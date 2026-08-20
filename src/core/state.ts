// Session-local state machine. Pure, immutable helpers. (CAP-002/006/012)
//
// Restore is two-phase so the wiring layer performs the REAL side effect:
//   planRestore()    — pure: does the extension own effort, and what is the target?
//   confirmRestore() — pure: fold the actual post-restore readback into state.
// The wiring must call setSessionEffort + readbackActual between the two; mutating
// only in-memory state without the real restore is a contract violation (REQ-012).
import type { Effort, SessionStateV1 } from "./types";

export interface Baseline {
  model: string | null;
  effort: Effort;
}

export function createInitialState(opts: {
  sessionId: string;
  enabledAtStart: boolean;
  baseline: Baseline;
}): SessionStateV1 {
  return {
    schemaVersion: 1,
    generation: 1,
    enabledAtStart: opts.enabledAtStart,
    phase: opts.enabledAtStart ? "baseline" : "disabled",
    baselineModel: opts.baseline.model,
    baselineEffort: opts.baseline.effort,
    currentModel: opts.baseline.model,
    currentEffort: opts.baseline.effort,
    effortOwnedByExtension: false,
    lastEffortRaiseAt: null,
    selectedDirection: null,
    alternativeDirectionIds: [],
    evidence: [],
    automaticWavesUsed: 0,
    explorationWave: 0,
    ownedChildRuns: [],
    manualExplorationGrant: null,
    lastDecision: null,
    routingIntegrity: opts.baseline.model !== null && opts.baseline.effort !== "unknown" ? "unverified" : "source_gap",
    taskOutcome: "not_started",
    sourceGaps: [],
    blockedReason: null,
    restoreState: "not_needed",
    health: "ok",
  };
}

/** New task: new generation, empty state, no inheritance from previous task (REQ-011/AC-003). */
export function newGeneration(prev: SessionStateV1, baseline: Baseline): SessionStateV1 {
  return {
    ...createInitialState({ sessionId: "", enabledAtStart: prev.enabledAtStart, baseline }),
    generation: prev.generation + 1,
  };
}

/** `reset` command: same generation, restore owned effort, rebuild clean baseline, keep audit (REQ-012/§15.1). */
export function resetGeneration(state: SessionStateV1, baseline: Baseline): SessionStateV1 {
  const restored = restoreOwnedEffort(state, baseline);
  if (restored.restoreState === "failed") return restored;
  return {
    ...restored,
    phase: "baseline",
    selectedDirection: null,
    alternativeDirectionIds: [],
    evidence: [],
    automaticWavesUsed: 0,
    explorationWave: 0,
    ownedChildRuns: [],
    manualExplorationGrant: null,
    lastEffortRaiseAt: null,
    lastDecision: null,
    routingIntegrity: baseline.model !== null && baseline.effort !== "unknown" ? "unverified" : "source_gap",
    taskOutcome: "not_started",
    sourceGaps: [],
    blockedReason: null,
  };
}

/** Model switch: restore old ownership, generation++, clear old model state, new baseline (REQ-012/AC-039). */
export function modelSwitch(state: SessionStateV1, baseline: Baseline): SessionStateV1 {
  const restored = restoreOwnedEffort(state, baseline);
  if (restored.restoreState === "failed") return restored;
  const detachedChildren = restored.ownedChildRuns.map((c) => ({
    ...c,
    status: "detached" as const,
  }));
  return {
    ...restored,
    generation: state.generation + 1,
    phase: "baseline",
    baselineModel: baseline.model,
    baselineEffort: baseline.effort,
    currentModel: baseline.model,
    currentEffort: baseline.effort,
    effortOwnedByExtension: false,
    lastEffortRaiseAt: null,
    selectedDirection: null,
    alternativeDirectionIds: [],
    evidence: [],
    automaticWavesUsed: 0,
    explorationWave: 0,
    ownedChildRuns: detachedChildren,
    manualExplorationGrant: null,
    lastDecision: null,
    routingIntegrity: baseline.model !== null && baseline.effort !== "unknown" ? "unverified" : "source_gap",
    taskOutcome: "not_started",
    sourceGaps: [],
    blockedReason: null,
  };
}

/** `off`: restore owned effort, detach running WEConverge children, clear grant; never terminate user children (REQ-012/AC-038/AC-040). */
export function applyOff(state: SessionStateV1, baseline: Baseline): SessionStateV1 {
  const restored = restoreOwnedEffort(state, baseline);
  if (restored.restoreState === "failed") return restored;
  return {
    ...restored,
    enabledAtStart: false,
    phase: "disabled",
    manualExplorationGrant: null,
    ownedChildRuns: restored.ownedChildRuns.map((c) => ({ ...c, status: "detached" as const })),
  };
}

/**
 * Pure state fold for restore (test seam). The REAL restore must go through
 * planRestore -> adapters.setSessionEffort -> adapters.readbackActual -> confirmRestore
 * in the wiring layer; this helper alone is memory-only and exists for mechanical tests.
 */
export function restoreOwnedEffort(state: SessionStateV1, baseline: Baseline): SessionStateV1 {
  if (state.restoreState === "failed") return { ...state, health: "degraded" };
  if (!state.effortOwnedByExtension) {
    return { ...state, restoreState: "not_needed" };
  }
  // If persisted baseline can't be read back, mark failed + degraded but do NOT modify persistent config.
  if (baseline.effort === "unknown" && baseline.model === null) {
    return { ...state, restoreState: "failed", health: "degraded" };
  }
  return {
    ...state,
    currentEffort: baseline.effort,
    currentModel: baseline.model,
    effortOwnedByExtension: false,
    restoreState: "restored",
  };
}

/** Phase 1 of a real restore: what must the wiring set+readback? null => nothing owned. */
export function planRestore(state: SessionStateV1): { needed: boolean; target: Baseline } {
  if (!state.effortOwnedByExtension) return { needed: false, target: { model: state.baselineModel, effort: state.baselineEffort } };
  return { needed: true, target: { model: state.baselineModel, effort: state.baselineEffort } };
}

/**
 * Phase 2 of a real restore: fold the post-restore readback into state.
 * Unknown/unreadable actual, or actual still different from the target, is failed+degraded —
 * never reported as restored (REQ-012/AC-027).
 */
export function confirmRestore(
  state: SessionStateV1,
  target: Baseline,
  actual: Baseline | null,
): SessionStateV1 {
  if (!state.effortOwnedByExtension) return { ...state, restoreState: "not_needed" };
  const restored =
    actual !== null &&
    actual.effort !== "unknown" &&
    actual.effort === target.effort &&
    (target.model === null || actual.model === target.model);
  if (!restored) {
    return {
      ...state,
      currentEffort: actual?.effort ?? state.currentEffort,
      currentModel: actual?.model ?? state.currentModel,
      restoreState: "failed",
      health: "degraded",
    };
  }
  return {
    ...state,
    currentEffort: actual.effort,
    currentModel: actual.model,
    effortOwnedByExtension: false,
    restoreState: "restored",
  };
}

/** Detect external ownership change: actual differs from owned baseline while owned (REQ-013/AC-025). */
export function detectExternalOwnershipChange(
  state: SessionStateV1,
  actual: Baseline,
): boolean {
  if (!state.effortOwnedByExtension) return false;
  if (state.currentEffort === "unknown" || actual.effort === "unknown") return false;
  return actual.effort !== state.currentEffort || actual.model !== state.currentModel;
}

/** Relinquish ownership after an external change: keep actual values, mark degraded, re-baseline (REQ-013). */
export function relinquishOwnership(state: SessionStateV1, actual: Baseline): SessionStateV1 {
  return {
    ...state,
    baselineModel: actual.model,
    baselineEffort: actual.effort,
    currentModel: actual.model,
    currentEffort: actual.effort,
    effortOwnedByExtension: false,
    health: "degraded",
    restoreState: "not_needed",
  };
}

/** Mark a running WEConverge child as detached (off / late result) — visible, not in routing (REQ-053/AC-038). */
export function markChildDetached(state: SessionStateV1, childId: string): SessionStateV1 {
  return {
    ...state,
    ownedChildRuns: state.ownedChildRuns.map((c) =>
      c.childAgentId === childId ? { ...c, status: "detached" as const } : c,
    ),
  };
}

/** Mark a child result stale when generation/phase/model changed (REQ-053/AC-015). */
export function markChildStale(state: SessionStateV1, childId: string): SessionStateV1 {
  return {
    ...state,
    ownedChildRuns: state.ownedChildRuns.map((c) =>
      c.childAgentId === childId ? { ...c, status: "stale" as const } : c,
    ),
  };
}

export function markChildTerminal(state: SessionStateV1, childId: string): SessionStateV1 {
  return {
    ...state,
    ownedChildRuns: state.ownedChildRuns.map((c) =>
      c.childAgentId === childId ? { ...c, status: "terminal" as const } : c,
    ),
  };
}

/**
 * Manual exploration grant bound to the current generation + task_end (SPEC §5.1 / AC-040).
 * Does NOT lift the Max ban; only widens parallel/wave limits within the current generation.
 */
export function grantManualExploration(
  state: SessionStateV1,
  extraWaves: number,
  maxParallel: number,
): SessionStateV1 {
  const safeWaves = Math.max(0, Math.min(extraWaves, 2)); // still capped; never unbounded
  const safeParallel = Math.max(1, Math.min(maxParallel, 4));
  return {
    ...state,
    manualExplorationGrant: {
      generation: state.generation,
      extraWaves: safeWaves,
      maxParallel: safeParallel,
      expiresAt: "task_end",
    },
  };
}

/** Grant is invalid once generation changes (model switch) — caller clears it via modelSwitch. */
export function isGrantValidForGeneration(state: SessionStateV1): boolean {
  return state.manualExplorationGrant?.generation === state.generation;
}
