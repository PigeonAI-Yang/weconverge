// Cost guards, effort state machine, candidate comparison. (CAP-006/008)
import type { ConfigV1, Effort, SessionStateV1 } from "./types";

/** SPEC §11.1 legal automatic transitions only. */
export function transitionEffort(
  current: Effort,
  requested: Effort,
): { ok: boolean; next?: Effort; reason?: string } {
  const allowed: Record<string, Effort> = { medium: "high", high: "xhigh" };
  if (requested === "max") return { ok: false, reason: "max is never an automatic target" };
  if (requested === current) return { ok: false, reason: "no change" };
  if (current === "unknown") return { ok: false, reason: "unknown baseline cannot auto-transition" };
  if (current === "xhigh") return { ok: false, reason: "xhigh is the automatic ceiling" };
  if (allowed[current] === requested) return { ok: true, next: requested };
  return { ok: false, reason: `illegal transition ${current} -> ${requested}` };
}

/** Preconditions for raise_effort (SPEC §11.2 items 1,4 + completed-new-attempt flag). */
export function effortRaisePreconditionsMet(
  state: SessionStateV1,
  difficulty: string,
  completedNewAttemptSinceLastRaise: boolean,
): { ok: boolean; reason?: string } {
  if (difficulty !== "reasoning_depth_insufficient") {
    return { ok: false, reason: "raise_effort requires reasoning_depth_insufficient" };
  }
  if (state.currentEffort !== "medium" && state.currentEffort !== "high") {
    return { ok: false, reason: `current effort ${state.currentEffort} not eligible` };
  }
  if (!completedNewAttemptSinceLastRaise) {
    return { ok: false, reason: "no new verified attempt since last raise" };
  }
  return { ok: true };
}

/** Wave + concurrency limits (SPEC §13, REQ-044). */
export function checkExplorationLimits(
  state: SessionStateV1,
  cfg: ConfigV1,
  probeCount: number,
): { ok: boolean; reason?: string } {
  const maxParallel = state.manualExplorationGrant
    ? state.manualExplorationGrant.maxParallel
    : cfg.maxParallelExplorers;
  const maxWaves = cfg.maxExplorationWaves;
  if (probeCount < 1) return { ok: false, reason: "no probes" };
  if (probeCount > maxParallel) return { ok: false, reason: `exceeds parallel limit ${maxParallel}` };
  if (state.automaticWavesUsed >= maxWaves) {
    return { ok: false, reason: `exceeds wave limit ${maxWaves}` };
  }
  return { ok: true };
}

/** Same evidence set + same direction must not repeat the same incremental action (SPEC §13/AC-024).
 *  Compares the decision-level evidence/direction, not session-accumulated evidence, so it fires
 *  regardless of whether evidence has been appended to state. Different probe directions (waves)
 *  are NOT treated as a repeat. */
export function wouldRepeatSameAction(
  state: SessionStateV1,
  evidenceRefs: string[],
  action: string,
  probeDirectionIds: string[] = [],
): boolean {
  const last = state.lastDecision;
  if (!last) return false;
  const sameAction = last.action === action;
  const sameEvidence = last.evidenceRefs.join("|") === evidenceRefs.join("|");
  const lastDirs: string[] = (last as { probes?: { directionId: string }[] }).probes?.map((p) => p.directionId) ?? [];
  const sameDirs =
    probeDirectionIds.length === 0 ||
    lastDirs.length === 0 ||
    lastDirs.join("|") === probeDirectionIds.join("|");
  return sameAction && sameEvidence && sameDirs;
}

export interface Candidate {
  action: string;
  fixesGap: boolean;
  costTier: number | null;
}

/** SPEC §13: drop actions that don't fix the gap, then pick lowest relative cost. Missing cost => SOURCE GAP. */
export function selectCheaperCandidate(candidates: Candidate[]): { chosen: Candidate | null; sourceGap: boolean } {
  const fixing = candidates.filter((c) => c.fixesGap);
  if (fixing.length === 0) return { chosen: null, sourceGap: false };
  const withCost = fixing.filter((c) => c.costTier !== null);
  if (withCost.length === 0) return { chosen: null, sourceGap: true };
  const chosen = withCost.reduce((a, b) => ((a.costTier as number) <= (b.costTier as number) ? a : b));
  return { chosen, sourceGap: false };
}
