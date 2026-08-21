// Cost guards — advisory only. Effort state machine remains for raise_effort.
// Wave/concurrency limits are advisory values shown in status/audit, never blocking.
import type { ConfigV1, CostComparisonV1, Effort, EvidenceRefV1, SemanticAction, SessionStateV1 } from "./types";
import { isConfirmedAnchor } from "./evidence";

/** Legal automatic transitions only. Delegates to policy ladder; max allowed only when configured. */
export function transitionEffort(
  current: Effort,
  requested: Effort,
): { ok: boolean; next?: Effort; reason?: string } {
  if (requested === current) return { ok: false, reason: "no change" };
  if (current === "unknown") return { ok: false, reason: "unknown baseline cannot auto-transition" };
  const order: Effort[] = ["medium", "high", "xhigh", "max"];
  const ci = order.indexOf(current);
  const ri = order.indexOf(requested);
  if (ci === -1 || ri === -1) return { ok: false, reason: `illegal transition ${current} -> ${requested}` };
  if (ri <= ci) return { ok: false, reason: `illegal transition ${current} -> ${requested}` };
  return { ok: true, next: requested };
}

export function nextEffortRung(current: Effort): Effort | null {
  if (current === "medium") return "high";
  if (current === "high") return "xhigh";
  if (current === "xhigh") return "max";
  return null;
}

/**
 * Preconditions for raise_effort: difficulty must be reasoning_depth_insufficient and
 * an anchored confirmed evidence (verification/tool_result) observed after last raise.
 * Current effort eligibility is deferred to policy ladder; unknown still rejected here.
 */
export function effortRaisePreconditionsMet(
  state: SessionStateV1,
  difficulty: string,
  refs: EvidenceRefV1[],
): { ok: boolean; reason?: string } {
  if (difficulty !== "reasoning_depth_insufficient") {
    return { ok: false, reason: "raise_effort requires reasoning_depth_insufficient" };
  }
  if ((state.currentEffort as string) === "unknown") {
    return { ok: false, reason: "unknown baseline cannot auto-transition" };
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
  routeOk: boolean;
}

export interface CandidateSelection {
  chosen: Candidate | null;
  excluded: Array<{ action: SemanticAction; reason: string }>;
}

/** Advisory cost comparison — lowest tier wins, missing cost => source_gap. */
export function selectCheaperCandidate(candidates: Candidate[]): CandidateSelection {
  const excluded: Array<{ action: SemanticAction; reason: string }> = [];
  const viable = candidates.filter((c) => {
    if (!c.routeOk) {
      excluded.push({ action: c.action, reason: "route unavailable" });
      return false;
    }
    if (c.costTier === null) {
      excluded.push({ action: c.action, reason: "source_gap cost" });
      return false;
    }
    return true;
  });
  if (viable.length === 0) return { chosen: null, excluded };
  viable.sort((a, b) => (a.costTier as number) - (b.costTier as number));
  return { chosen: viable[0], excluded };
}
