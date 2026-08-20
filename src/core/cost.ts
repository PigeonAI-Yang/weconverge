// Cost guards, effort state machine, candidate comparison. (CAP-006/008)
import type { ConfigV1, CostComparisonV1, Effort, EvidenceRefV1, SemanticAction, SessionStateV1 } from "./types";
import { isConfirmedAnchor } from "./evidence";

/** SPEC §11.1 legal automatic transitions only. */
export function transitionEffort(
  current: Effort,
  requested: Effort,
): { ok: boolean; next?: Effort; reason?: string } {
  const allowed: Record<string, Effort> = { medium: "high", high: "xhigh" };
  if (requested === "max") return { ok: false, reason: "max is never an automatic target" };
  if (requested === current) return { ok: false, reason: "no change" };
  if (current === "unknown") return { ok: false, reason: "unknown baseline cannot auto-transition" };
  if (current === "max") return { ok: false, reason: "current effort max is a configuration conflict, not an automatic path" };
  if (current === "xhigh") return { ok: false, reason: "xhigh is the automatic ceiling" };
  if (allowed[current] === requested) return { ok: true, next: requested };
  return { ok: false, reason: `illegal transition ${current} -> ${requested}` };
}

/** SPEC §11.2: the next (and only next) automatic rung above `current`, or null at/over the ceiling. */
export function nextEffortRung(current: Effort): Effort | null {
  if (current === "medium") return "high";
  if (current === "high") return "xhigh";
  return null;
}

/**
 * Preconditions for raise_effort (SPEC §11.2). A "new verified attempt" is proven by an
 * ANCHORED confirmed evidence of kind verification/tool_result observed AFTER the last
 * raise — never by a model-claimed boolean (2026-08-20 contract).
 */
export function effortRaisePreconditionsMet(
  state: SessionStateV1,
  difficulty: string,
  refs: EvidenceRefV1[],
): { ok: boolean; reason?: string } {
  if (difficulty !== "reasoning_depth_insufficient") {
    return { ok: false, reason: "raise_effort requires reasoning_depth_insufficient" };
  }
  if (state.currentEffort !== "medium" && state.currentEffort !== "high") {
    return { ok: false, reason: `current effort ${state.currentEffort} not eligible` };
  }
  const attempt = refs.some(
    (r) =>
      isConfirmedAnchor(r) &&
      (r.kind === "verification" || r.kind === "tool_result") &&
      (state.lastEffortRaiseAt === null || r.observedAt > state.lastEffortRaiseAt),
  );
  if (!attempt) {
    return { ok: false, reason: "no anchored verified attempt since last raise" };
  }
  return { ok: true };
}

/** Wave + concurrency limits (SPEC §13, REQ-044). A grant counts only in its own generation (AC-040). */
export function checkExplorationLimits(
  state: SessionStateV1,
  cfg: ConfigV1,
  probeCount: number,
): { ok: boolean; reason?: string } {
  const grant = state.manualExplorationGrant;
  const grantValid = grant !== null && grant.generation === state.generation;
  const maxParallel = grantValid ? grant.maxParallel : cfg.maxParallelExplorers;
  const maxWaves = grantValid ? cfg.maxExplorationWaves + grant.extraWaves : cfg.maxExplorationWaves;
  if (probeCount < 1) return { ok: false, reason: "no probes" };
  if (probeCount > maxParallel) return { ok: false, reason: `exceeds parallel limit ${maxParallel}` };
  if (state.automaticWavesUsed >= maxWaves) {
    return { ok: false, reason: `exceeds wave limit ${maxWaves}` };
  }
  return { ok: true };
}

/** Same evidence set + same direction must not repeat the same incremental action (SPEC §13/AC-024).
 * Compares the decision-level evidence/direction, not session-accumulated evidence, so it fires
 * regardless of whether evidence has been appended to state. Different probe directions (waves)
 * are NOT treated as a repeat. Evidence references are sets: order and duplicate presentation do not matter. */
export function wouldRepeatSameAction(
  state: SessionStateV1,
  evidenceRefs: string[],
  action: string,
  probeDirectionIds: string[] = [],
): boolean {
  const last = state.lastDecision;
  if (!last) return false;
  const sameSet = (left: string[], right: string[]): boolean => {
    const a = new Set(left);
    const b = new Set(right);
    return a.size === b.size && [...a].every((value) => b.has(value));
  };
  const sameAction = last.action === action;
  const sameEvidence = sameSet(last.evidenceRefs, evidenceRefs);
  const lastDirs: string[] = last.probes?.map((p) => p.directionId) ?? [];
  const sameDirs =
    probeDirectionIds.length === 0 ||
    lastDirs.length === 0 ||
    sameSet(lastDirs, probeDirectionIds);
  return sameAction && sameEvidence && sameDirs;
}

export interface Candidate {
  action: SemanticAction;
  fixesGap: boolean;
  costTier: number | null;
  /** non-null when excluded before cost comparison (illegal route, Max, unavailable, …) */
  excluded: string | null;
}

export interface CandidateSelection {
  chosen: Candidate | null;
  sourceGap: boolean;
  comparison: CostComparisonV1;
}

/**
 * SPEC §13: drop candidates that cannot fix the capability gap or are illegal, then pick
 * the lowest relative cost. Ties prefer, in order: zero new provider calls (current path),
 * a single bounded specialist call, an effort raise, and parallel exploration last.
 * Missing cost data => SOURCE GAP, never a guess (AC-036/AC-023).
 */
export function selectCheaperCandidate(candidates: Candidate[]): CandidateSelection {
  const comparison: CostComparisonV1 = {
    candidates: candidates.map((c) => ({ action: c.action, costTier: c.costTier, excluded: c.excluded })),
    chosen: null,
  };
  const legal = candidates.filter((c) => c.excluded === null && c.fixesGap);
  if (legal.length === 0) return { chosen: null, sourceGap: false, comparison };
  const withCost = legal.filter((c) => c.costTier !== null);
  if (withCost.length === 0) return { chosen: null, sourceGap: true, comparison };
  const tieRank: Record<string, number> = {
    continue_current: 0,
    invoke_specialist: 1,
    delegate_bounded_work: 1,
    raise_effort: 2,
    explore_in_parallel: 3,
    activate_alternative: 1,
  };
  const chosen = withCost.reduce((a, b) => {
    if ((a.costTier as number) !== (b.costTier as number)) {
      return (a.costTier as number) < (b.costTier as number) ? a : b;
    }
    return (tieRank[a.action] ?? 9) <= (tieRank[b.action] ?? 9) ? a : b;
  });
  comparison.chosen = chosen.action;
  return { chosen, sourceGap: false, comparison };
}
