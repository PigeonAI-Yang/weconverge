// Session-local state machine — pure advisory (2026-08-20).
// One active full runtime per sessionId#generation + bounded detached tombstones.
// No enforcement; advisory bookkeeping only.
import type { DetachedTombstone, Effort, SessionStateV1 } from "./types";

export interface Baseline {
  model: string | null;
  effort: Effort;
}

const MAX_TOMBSTONES_PER_GENERATION = 2;
const MAX_PREVIEW = 200;

function truncatePreview(s: string): string {
  if (s.length <= MAX_PREVIEW) return s;
  return s.slice(0, MAX_PREVIEW);
}

function pruneTombstones(list: DetachedTombstone[]): DetachedTombstone[] {
  if (list.length <= MAX_TOMBSTONES_PER_GENERATION) return list;
  return list.slice(list.length - MAX_TOMBSTONES_PER_GENERATION);
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
    detachedTombstones: [],
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

/** New task: new generation, no inheritance (REQ-011). One active runtime invariant. */
export function newGeneration(prev: SessionStateV1, baseline: Baseline): SessionStateV1 {
  return {
    ...createInitialState({ sessionId: "", enabledAtStart: prev.enabledAtStart, baseline }),
    generation: prev.generation + 1,
  };
}

/** `reset` command: same generation, restore owned effort, rebuild clean baseline, keep audit. */
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
    // retain tombstones across reset? Reset keeps audit but clears generation state; tombstones are per-generation bounded so clear.
    detachedTombstones: [],
    manualExplorationGrant: null,
    lastEffortRaiseAt: null,
    lastDecision: null,
    routingIntegrity: baseline.model !== null && baseline.effort !== "unknown" ? "unverified" : "source_gap",
    taskOutcome: "not_started",
    sourceGaps: [],
    blockedReason: null,
  };
}

/** Model switch: restore old ownership, generation++, clear old state, new baseline. Switch destroys old full runtime. */
export function modelSwitch(state: SessionStateV1, baseline: Baseline): SessionStateV1 {
  const restored = restoreOwnedEffort(state, baseline);
  if (restored.restoreState === "failed") return restored;
  // Move any running children to detached tombstones (bounded).
  const tombstones: DetachedTombstone[] = restored.ownedChildRuns.map((c) => ({
    childId: c.childAgentId,
    parentToolCallId: null,
    sessionFile: null,
    status: "detached",
    resolvedModel: null,
    preview: "",
  }));
  const nextTombstones = pruneTombstones([...restored.detachedTombstones, ...tombstones]);
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
    ownedChildRuns: [],
    detachedTombstones: nextTombstones,
    manualExplorationGrant: null,
    lastDecision: null,
    routingIntegrity: baseline.model !== null && baseline.effort !== "unknown" ? "unverified" : "source_gap",
    taskOutcome: "not_started",
    sourceGaps: [],
    blockedReason: null,
  };
}

/** `off`: restore owned effort, detach running children as tombstones, never cancel user children. */
export function applyOff(state: SessionStateV1, baseline: Baseline): SessionStateV1 {
  const restored = restoreOwnedEffort(state, baseline);
  if (restored.restoreState === "failed") return restored;
  const tombstones: DetachedTombstone[] = restored.ownedChildRuns
    .filter((c) => c.status === "running")
    .map((c) => ({
      childId: c.childAgentId,
      parentToolCallId: null,
      sessionFile: null,
      status: "detached",
      resolvedModel: null,
      preview: "",
    }));
  return {
    ...restored,
    enabledAtStart: false,
    phase: "disabled",
    manualExplorationGrant: null,
    ownedChildRuns: restored.ownedChildRuns.map((c) => ({ ...c, status: "detached" as const })),
    detachedTombstones: pruneTombstones([...restored.detachedTombstones, ...tombstones]),
  };
}

export function restoreOwnedEffort(state: SessionStateV1, baseline: Baseline): SessionStateV1 {
  if (state.restoreState === "failed") return { ...state, health: "degraded" };
  if (!state.effortOwnedByExtension) {
    return { ...state, restoreState: "not_needed" };
  }
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

export function planRestore(state: SessionStateV1): { needed: boolean; target: Baseline } {
  if (!state.effortOwnedByExtension) return { needed: false, target: { model: state.baselineModel, effort: state.baselineEffort } };
  return { needed: true, target: { model: state.baselineModel, effort: state.baselineEffort } };
}

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

export function detectExternalOwnershipChange(
  state: SessionStateV1,
  actual: Baseline,
): boolean {
  if (!state.effortOwnedByExtension) return false;
  if (state.currentEffort === "unknown" || actual.effort === "unknown") return false;
  return actual.effort !== state.currentEffort || actual.model !== state.currentModel;
}

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

export function markChildDetached(state: SessionStateV1, childId: string): SessionStateV1 {
  return {
    ...state,
    ownedChildRuns: state.ownedChildRuns.map((c) => (c.childAgentId === childId ? { ...c, status: "detached" as const } : c)),
  };
}

export function markChildStale(state: SessionStateV1, childId: string): SessionStateV1 {
  return {
    ...state,
    ownedChildRuns: state.ownedChildRuns.map((c) => (c.childAgentId === childId ? { ...c, status: "stale" as const } : c)),
  };
}

export function markChildTerminal(state: SessionStateV1, childId: string): SessionStateV1 {
  return {
    ...state,
    ownedChildRuns: state.ownedChildRuns.map((c) => (c.childAgentId === childId ? { ...c, status: "terminal" as const } : c)),
  };
}

export function grantManualExploration(
  state: SessionStateV1,
  extraWaves: number,
  maxParallel: number,
): SessionStateV1 {
  return {
    ...state,
    manualExplorationGrant: {
      generation: state.generation,
      extraWaves,
      maxParallel,
      expiresAt: "task_end",
    },
  };
}

export function isGrantValidForGeneration(state: SessionStateV1): boolean {
  return state.manualExplorationGrant?.generation === state.generation;
}
/** Pure advisory: no global automatic action block. Always null. */
export function automaticActionBlockReason(_state: SessionStateV1): string | null {
  return null;
}

// ---- Advisory observation helpers ----

/** Record an observed tool_call for task — advisory only, increments observed wave. */
export function recordObservedTaskCall(
  state: SessionStateV1,
  childInfo: { childId: string; generation: number },
): SessionStateV1 {
  const wave = state.explorationWave + 1;
  return {
    ...state,
    explorationWave: wave,
    automaticWavesUsed: Math.min(2, wave) as 0 | 1 | 2,
    ownedChildRuns: [
      ...state.ownedChildRuns,
      { childAgentId: childInfo.childId, generation: childInfo.generation, status: "running" as const },
    ],
    phase: "external_exploration",
  };
}

/** Record observed tool_result — marks child terminal, moves to integrating. */
export function recordObservedTaskResult(
  state: SessionStateV1,
  childId: string,
): SessionStateV1 {
  return {
    ...state,
    ownedChildRuns: state.ownedChildRuns.map((c) => (c.childAgentId === childId ? { ...c, status: "terminal" as const } : c)),
    phase: "integrating",
  };
}

/** Add a detached tombstone (late child after switch/off), bounded to 2 per generation. */
export function addDetachedTombstone(state: SessionStateV1, t: DetachedTombstone): SessionStateV1 {
  const preview = truncatePreview(t.preview);
  const entry: DetachedTombstone = { ...t, preview };
  return {
    ...state,
    detachedTombstones: pruneTombstones([...state.detachedTombstones, entry]),
  };
}

/** Fail-open observer wrapper: any handler error marks degraded but never throws. */
export function observeFailOpen(state: SessionStateV1, fn: () => void, reason: string): SessionStateV1 {
  try {
    fn();
    return state;
  } catch {
    return { ...state, health: "degraded", sourceGaps: [...state.sourceGaps, `observer:${reason}`] };
  }
}
