// Session-local state machine. Pure, immutable helpers. (CAP-002/006/012)
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
    selectedDirection: null,
    alternativeDirectionIds: [],
    evidence: [],
    automaticWavesUsed: 0,
    explorationWave: 0,
    ownedChildRuns: [],
    manualExplorationGrant: null,
    lastDecision: null,
    routingIntegrity: opts.baseline.model || opts.baseline.effort !== "unknown" ? "unverified" : "source_gap",
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
    lastDecision: null,
    routingIntegrity: baseline.model || baseline.effort !== "unknown" ? "unverified" : "source_gap",
    taskOutcome: "not_started",
    sourceGaps: [],
    blockedReason: null,
  };
}

/** Model switch: restore old ownership, generation++, clear old model state, new baseline (REQ-012/AC-039). */
export function modelSwitch(state: SessionStateV1, baseline: Baseline): SessionStateV1 {
  const restored = restoreOwnedEffort(state, baseline);
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
    selectedDirection: null,
    alternativeDirectionIds: [],
    evidence: [],
    automaticWavesUsed: 0,
    explorationWave: 0,
    ownedChildRuns: detachedChildren,
    manualExplorationGrant: null,
    lastDecision: null,
    routingIntegrity: baseline.model || baseline.effort !== "unknown" ? "unverified" : "source_gap",
    taskOutcome: "not_started",
    sourceGaps: [],
    blockedReason: null,
  };
}

/** `off`: restore owned effort, detach running WEConverge children, do not terminate user children (REQ-012/AC-038). */
export function applyOff(state: SessionStateV1, baseline: Baseline): SessionStateV1 {
  const restored = restoreOwnedEffort(state, baseline);
  return {
    ...restored,
    enabledAtStart: false,
    phase: "disabled",
    ownedChildRuns: restored.ownedChildRuns.map((c) => ({ ...c, status: "detached" as const })),
  };
}

/** Restore only Extension-owned session-local effort. Never touches persistent config (REQ-033). */
export function restoreOwnedEffort(state: SessionStateV1, baseline: Baseline): SessionStateV1 {
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

/** Detect external ownership change: actual differs from owned baseline while owned (REQ-013/AC-025). */
export function detectExternalOwnershipChange(
  state: SessionStateV1,
  actual: Baseline,
): boolean {
  if (!state.effortOwnedByExtension) return false;
  if (state.currentEffort === "unknown" || actual.effort === "unknown") return false;
  return actual.effort !== state.currentEffort || actual.model !== state.currentModel;
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
