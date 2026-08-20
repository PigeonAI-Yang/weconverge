// Cost guards — advisory only. Effort state machine remains for raise_effort.
// Wave/concurrency limits are advisory values shown in status/audit, never blocking.
import type { ConfigV1, CostComparisonV1, Effort, EvidenceRefV1, SemanticAction, SessionStateV1 } from "./types";
import { isConfirmedAnchor } from "./evidence";

/** Legal automatic transitions only. */
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

export function nextEffortRung(current: Effort): Effort | null {
  if (current === "medium") return "high";
  if (current === "high") return "xhigh";
  return null;
}

/**
 * Preconditions for raise_effort: difficulty must be reasoning_depth_insufficient and
 * an anchored confirmed evidence (verification/tool_result) observed after last raise.
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

/** Advisory wave/parallel values — never blocks, only records observed. */
export function advisoryExplorationInfo(
  state: SessionStateV1,
  cfg: ConfigV1,
): { observedWaves: number; advisoryMaxParallel: number; advisoryMaxWaves: number } {
  const grant = state.manualExplorationGrant;
  const grantValid = grant !== null && grant.generation === state.generation;
  const maxParallel = grantValid ? grant.maxParallel : cfg.maxParallelExplorers;
  const maxWaves = grantValid ? cfg.maxExplorationWaves + grant.extraWaves : cfg.maxExplorationWaves;
  return { observedWaves: state.explorationWave, advisoryMaxParallel: maxParallel, advisoryMaxWaves: maxWaves };
}

export interface Candidate {
  action: SemanticAction;
  fixesGap: boolean;
  costTier: number | null;
  excluded: string | null;
}

export interface CandidateSelection {
  chosen: Candidate | null;
  sourceGap: boolean;
  comparison: CostComparisonV1;
}

/** Advisory cost comparison — lowest tier wins, missing cost => source_gap. */
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
