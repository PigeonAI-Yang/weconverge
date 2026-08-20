// Single logical decision entry: weconvergeDecide. (CAP-003/004/005/006/009)
// Pure: OMP side effects are injected via OmpAdapters and only invoked AFTER validation passes.
//
// Contracts enforced here (2026-08-20 supplementary contract):
//  - NEVER throws: malformed/missing input is a `rejected` result, not an exception.
//  - evidenceRefs is REQUIRED and non-empty for every action, including continue_current.
//  - Audit sequence: decision_received -> decision_validated|decision_rejected
//    (-> action_started -> action_terminal for accepted actions).
//  - Idempotency per (sessionId, generation): same id+payload returns the FIRST result
//    with zero repeated side effects; same id+different payload is a conflict.
//  - raise_effort: single rung, anchored verified-attempt gate, real set+readback where
//    the readback MUST equal the target; unknown/max/mismatch is never accepted.
//  - Cost comparison is EXECUTED: a cheaper legal specialist wins over raising effort;
//    candidates/exclusions/tiers/choice land in the audit event.
//  - report_blocked is rejected while a legal recorded alternative remains.
import type {
  AuditEventV1,
  ConfigV1,
  ConvergenceDecisionV1,
  CostComparisonV1,
  DifficultyType,
  Effort,
  EvidenceRefV1,
  Integrity,
  OmpAdapters,
  ResolvedRouteV1,
  SemanticAction,
  SessionStateV1,
} from "./types";
import { isValidEvidenceRef, hasConfirmedEvidence, isModelSelfReportOnly } from "./evidence";
import { resolveCapability, preflightEffort, buildResolvedRoute, roleRelativeCostTier } from "./route";
import type { Candidate } from "./cost";
import {
  transitionEffort,
  nextEffortRung,
  effortRaisePreconditionsMet,
  checkExplorationLimits,
  wouldRepeatSameAction,
  selectCheaperCandidate,
} from "./cost";
import { buildAuditEvent } from "./audit";
import { DecisionRegistry, hashPayload } from "./ledger";
import { makeEventId } from "./ids";

export type DecisionStatus = "accepted" | "rejected" | "blocked" | "source_gap";

export interface DecideResult {
  status: DecisionStatus;
  reason?: string;
  state: SessionStateV1;
  /** Ordered audit events: received -> validated|rejected (-> action_started -> action_terminal). */
  auditEvents: AuditEventV1[];
  /** Id of the terminal audit event for this decision. */
  auditEventId: string;
  decisionId: string;
  generation: number;
  createdChildIds: string[];
  effectiveAction: SemanticAction | null;
  resolvedRoute: ResolvedRouteV1 | null;
  /** One route per created child; a single child never stands in for the others. */
  resolvedRoutes: ResolvedRouteV1[];
  relativeCostTier: number | null;
  costComparison: CostComparisonV1 | null;
}

export interface DecideArgs {
  state: SessionStateV1;
  decision: ConvergenceDecisionV1;
  config: ConfigV1;
  adapters: OmpAdapters;
  evidenceById: Map<string, EvidenceRefV1>;
  registry: DecisionRegistry;
  now: string;
  sessionId: string;
  parentAgentId: string | null;
}

const FORBIDDEN_ALLOCATION_FIELDS = ["token", "providerid", "modelid", "provider", "model", "tokens"];
const RESOURCE_ACTIONS: SemanticAction[] = [
  "explore_in_parallel",
  "raise_effort",
  "invoke_specialist",
  "delegate_bounded_work",
  "activate_alternative",
];
const VALID_ACTIONS: SemanticAction[] = [
  "continue_current",
  "activate_alternative",
  "delegate_bounded_work",
  "invoke_specialist",
  "explore_in_parallel",
  "raise_effort",
  "report_source_gap",
  "report_blocked",
];
const VALID_DIFFICULTIES: DifficultyType[] = [
  "path_unclear",
  "reasoning_depth_insufficient",
  "domain_mismatch",
  "bounded_mechanical_work",
  "alternative_ready",
  "source_missing",
  "proven_blocker",
];
/** Single fail-closed gate for all automatic resource-producing actions. */
export function automaticActionBlockReason(state: SessionStateV1): string | null {
  if (state.health === "degraded") return "automatic actions blocked: extension health is degraded";
  if (state.phase === "degraded" || state.phase === "blocked" || state.phase === "source_gap") {
    return `automatic actions blocked: phase=${state.phase}`;
  }
  if (state.routingIntegrity === "source_gap" || state.routingIntegrity === "failed") {
    return `automatic actions blocked: routing integrity=${state.routingIntegrity}`;
  }
  if (state.sourceGaps.length > 0) return "automatic actions blocked: unresolved source gap";
  return null;
}

function resolveRefs(decision: ConvergenceDecisionV1, byId: Map<string, EvidenceRefV1>) {
  const refs: EvidenceRefV1[] = [];
  const missing: string[] = [];
  for (const id of decision.evidenceRefs) {
    const r = byId.get(id);
    if (!r || !isValidEvidenceRef(r)) missing.push(id);
    else refs.push(r);
  }
  return { refs, missing };
}

function hasForbiddenAllocationFields(d: Record<string, unknown>): boolean {
  return Object.keys(d).some((k) => FORBIDDEN_ALLOCATION_FIELDS.includes(k.toLowerCase()));
}

/** Ordered audit event builder for one decision call. */
class AuditSeq {
  readonly events: AuditEventV1[] = [];
  readonly decisionId: string;
  private readonly args: DecideArgs;
  private readonly decision: ConvergenceDecisionV1 | null;
  private readonly payloadHash: string | null;
  constructor(args: DecideArgs, decision: ConvergenceDecisionV1 | null, payloadHash: string | null = null) {
    this.args = args;
    this.decision = decision;
    this.payloadHash = payloadHash;
    this.decisionId = decision?.decisionId ?? "unknown";
  }
  push(
    eventType: string,
    eventResult: Integrity,
    extra: {
      resolvedRoute?: ResolvedRouteV1 | null;
      relativeCostTier?: number | null;
      costComparison?: CostComparisonV1 | null;
      sourceGaps?: string[];
      restoreResult?: string | null;
      decisionStatus?: "accepted" | "rejected" | "blocked" | "source_gap" | null;
      decisionReason?: string | null;
      effectiveAction?: SemanticAction | null;
      createdChildIds?: string[];
      resolvedRoutes?: ResolvedRouteV1[];
    } = {},
  ): AuditEventV1 {
    const ev = buildAuditEvent({
      eventId: makeEventId(this.args.now),
      timestamp: this.args.now,
      sessionId: this.args.sessionId,
      generation: this.args.state.generation,
      parentAgentId: this.args.parentAgentId,
      eventType,
      decision: this.decision,
      decisionId: this.decision ? this.decision.decisionId : null,
      payloadHash: this.payloadHash,
      resolvedRoute: extra.resolvedRoute ?? null,
      relativeCostTier: extra.relativeCostTier ?? null,
      costComparison: extra.costComparison ?? null,
      result: eventResult,
      sourceGaps: extra.sourceGaps ?? [],
      restoreResult: extra.restoreResult ?? null,
      decisionStatus: extra.decisionStatus,
      decisionReason: extra.decisionReason,
      effectiveAction: extra.effectiveAction,
      createdChildIds: extra.createdChildIds,
      resolvedRoutes: extra.resolvedRoutes,
    });
    this.events.push(ev);
    return ev;
  }
  terminalId(): string {
    return this.events.length > 0 ? this.events[this.events.length - 1].eventId : "wev-none";
  }
}

function result(
  seq: AuditSeq,
  status: DecisionStatus,
  reason: string | undefined,
  nextState: SessionStateV1,
  opts: {
    effectiveAction?: SemanticAction | null;
    resolvedRoute?: ResolvedRouteV1 | null;
    resolvedRoutes?: ResolvedRouteV1[];
    relativeCostTier?: number | null;
    costComparison?: CostComparisonV1 | null;
    createdChildIds?: string[];
  } = {},
): DecideResult {
  return {
    status,
    reason,
    state: nextState,
    auditEvents: seq.events,
    auditEventId: seq.terminalId(),
    decisionId: seq.decisionId,
    generation: nextState.generation,
    createdChildIds: opts.createdChildIds ?? [],
    effectiveAction: opts.effectiveAction ?? null,
    resolvedRoute: opts.resolvedRoute ?? null,
    resolvedRoutes: opts.resolvedRoutes ?? [],
    relativeCostTier: opts.relativeCostTier ?? null,
    costComparison: opts.costComparison ?? null,
  };
}

export function weconvergeDecide(args: DecideArgs): DecideResult {
  try {
    return decideInner(args);
  } catch (e) {
    // Absolute fail-closed: a decision call must never throw into OMP (REQ-070).
    try {
      const seq = new AuditSeq(args, null);
      seq.push("decision_received", "failed");
      seq.push("decision_rejected", "failed");
      return result(seq, "rejected", `internal decision error: ${e instanceof Error ? e.message : String(e)}`, args.state);
    } catch {
      return {
        status: "rejected",
        reason: "internal decision error",
        state: args.state,
        auditEvents: [],
        auditEventId: "wev-error",
        decisionId: "unknown",
        generation: args.state.generation,
        createdChildIds: [],
        effectiveAction: null,
        resolvedRoute: null,
        resolvedRoutes: [],
        relativeCostTier: null,
        costComparison: null,
      };
    }
  }
}

function decideInner(args: DecideArgs): DecideResult {
  const { state, decision, config, adapters } = args;
  const scope = `${args.sessionId}#${state.generation}`;

  // ---- 0. Structural validation: malformed input is REJECTED, never an exception ----
  const raw = decision as unknown;
  if (!raw || typeof raw !== "object") {
    const seq = new AuditSeq(args, null);
    seq.push("decision_received", "failed");
    seq.push("decision_rejected", "failed");
    return result(seq, "rejected", "decision must be an object", state);
  }
  const d = decision;
  if (typeof d.decisionId !== "string" || d.decisionId.length === 0) {
    const seq = new AuditSeq(args, null);
    seq.push("decision_received", "failed");
    seq.push("decision_rejected", "failed");
    return result(seq, "rejected", "decisionId required", state);
  }

  const hash = hashPayload(d);
  const seq = new AuditSeq(args, d, hash);
  seq.push("decision_received", "partial");

  const reject = (reason: string, gaps: string[] = []): DecideResult => {
    seq.push("decision_rejected", "failed", {
      sourceGaps: gaps,
      decisionStatus: "rejected",
      decisionReason: reason,
      effectiveAction: d.action,
    });
    const first = result(seq, "rejected", reason, state, { effectiveAction: d.action });
    args.registry.record(scope, d.decisionId, hash, first.status, first);
    return first;
  };
  const block = (reason: string, nextState: SessionStateV1 = state): DecideResult => {
    seq.push("decision_blocked", "blocked", {
      sourceGaps: nextState.sourceGaps.filter((g) => !state.sourceGaps.includes(g)),
      decisionStatus: "blocked",
      decisionReason: reason,
      effectiveAction: d.action,
    });
    const first = result(seq, "blocked", reason, nextState, { effectiveAction: d.action });
    args.registry.record(scope, d.decisionId, hash, first.status, first);
    return first;
  };
  const terminal = (
    status: DecisionStatus,
    integrity: Integrity,
    reason: string | undefined,
    nextState: SessionStateV1,
    opts: Parameters<typeof result>[4] = {},
  ): DecideResult => {
    const terminalEvent = status === "accepted" ? "action_terminal" : `decision_${status}`;
    seq.push(terminalEvent, integrity, {
      resolvedRoute: opts.resolvedRoute ?? null,
      resolvedRoutes: opts.resolvedRoutes,
      relativeCostTier: opts.relativeCostTier ?? null,
      costComparison: opts.costComparison ?? null,
      sourceGaps: status === "accepted" ? [] : nextState.sourceGaps.filter((g) => !state.sourceGaps.includes(g)),
      decisionStatus: status,
      decisionReason: reason ?? null,
      effectiveAction: opts.effectiveAction ?? d.action,
      createdChildIds: opts.createdChildIds,
    });
    const first = result(seq, status, reason, nextState, { effectiveAction: d.action, ...opts });
    args.registry.record(scope, d.decisionId, hash, first.status, first);
    return first;
  };

  // ---- 0b. Idempotency (SPEC §9.0 / AC-042) ----
  const prior = args.registry.lookup(scope, d.decisionId);
  if (prior) {
    if (prior.hash !== hash) {
      seq.push("decision_rejected", "failed", { decisionStatus: "rejected", decisionReason: "decisionId reused with different payload" });
      return result(seq, "rejected", "decisionId reused with different payload", state, { effectiveAction: d.action });
    }
    // Same id + same payload: return the exact first result, including its audit id/routes/children.
    if (prior.result) return prior.result as DecideResult;
    // Legacy incomplete registry records cannot trigger an action; report the integrity gap without overwriting it.
    seq.push("decision_rejected", "failed", { decisionStatus: "rejected", decisionReason: "idempotency record missing complete result" });
    return result(seq, "rejected", "idempotency record missing complete result", state, { effectiveAction: d.action });
  }

  // ---- 1. Disabled guard ----
  if (!state.enabledAtStart || state.phase === "disabled") {
    return reject("extension disabled");
  }

  const versionValue = raw && typeof raw === "object" && "version" in raw ? raw.version : undefined;
  if (versionValue !== 1) {
    return reject("decision version must be exactly 1");
  }
  if (typeof d.action !== "string" || !VALID_ACTIONS.includes(d.action)) {
    return reject(`unknown or missing action`);
  }
  if (typeof d.difficultyType !== "string" || !VALID_DIFFICULTIES.includes(d.difficultyType)) {
    return reject("unknown or missing difficultyType");
  }
  if (hasForbiddenAllocationFields(d as unknown as Record<string, unknown>)) {
    return reject("decision must not allocate token/provider/model");
  }
  if (!d.obstacle || d.obstacle.trim().length === 0) return reject("obstacle required");
  if (!d.expectedNewInformation || d.expectedNewInformation.trim().length === 0) {
    return reject("expectedNewInformation required");
  }
  if (!d.successCriterion || d.successCriterion.trim().length === 0) return reject("successCriterion required");
  if (!Array.isArray(d.evidenceRefs) || d.evidenceRefs.length === 0 || d.evidenceRefs.some((r) => typeof r !== "string")) {
    return reject("evidenceRefs required (non-empty string array)");
  }
  const { refs, missing } = resolveRefs(d, args.evidenceById);
  if (missing.length > 0 || isModelSelfReportOnly(refs)) {
    return reject(`evidence must be readable and anchored (missing: ${missing.join(",") || "none"}; no model self-report)`);
  }

  // ---- 3. Difficulty -> action contract (SPEC §9.3) ----
  if (d.difficultyType === "source_missing" && d.action !== "report_source_gap") {
    return reject("source_missing must use report_source_gap");
  }
  if (d.difficultyType === "proven_blocker" && d.action !== "report_blocked") {
    return reject("proven_blocker must use report_blocked");
  }

  // ---- 4. Resource-increasing actions require a confirmed anchor (SPEC §9.1) ----
  const isResource = RESOURCE_ACTIONS.includes(d.action);
  if (isResource && !hasConfirmedEvidence(refs)) {
    return reject("resource action requires >=1 confirmed evidence");
  }
  if (isResource) {
    const blockedReason = automaticActionBlockReason(state);
    if (blockedReason) return block(blockedReason);
  }

  seq.push("decision_validated", "partial");

  // Optional internal-search record (SPEC §9.1): persist selected + backup direction ids.
  const withDirections = (s: SessionStateV1): SessionStateV1 => {
    if (!d.selectedDirectionId) return s;
    return {
      ...s,
      selectedDirection: d.selectedDirectionId,
      alternativeDirectionIds: d.alternativeDirectionIds ?? s.alternativeDirectionIds,
    };
  };

  switch (d.action) {
    case "continue_current":
      return terminal("accepted", "confirmed", undefined, withDirections({ ...state, lastDecision: d }));

    case "activate_alternative": {
      if (!d.alternativeId) return reject("activate_alternative requires alternativeId");
      if (!state.alternativeDirectionIds.includes(d.alternativeId)) {
        return reject(`alternative "${d.alternativeId}" is not a recorded backup direction`);
      }
      const next: SessionStateV1 = {
        ...state,
        phase: "executing",
        selectedDirection: d.alternativeId,
        alternativeDirectionIds: state.alternativeDirectionIds.filter((a) => a !== d.alternativeId),
        lastDecision: d,
      };
      seq.push("action_started", "partial");
      return terminal("accepted", "confirmed", undefined, next);
    }

    case "report_source_gap": {
      if (!d.sourceGap || !d.sourceGap.missingFact || !d.sourceGap.requiredSource || !d.sourceGap.impact) {
        return reject("report_source_gap requires missingFact/requiredSource/impact", ["source_gap"]);
      }
      const next: SessionStateV1 = {
        ...state,
        phase: "source_gap",
        sourceGaps: [...state.sourceGaps, d.sourceGap.missingFact],
        lastDecision: d,
      };
      return terminal("source_gap", "source_gap", "source gap reported", next);
    }

    case "report_blocked": {
      if (!hasConfirmedEvidence(refs)) return reject("report_blocked requires confirmed evidence");
      if (!d.noSafeAlternativeReason || d.noSafeAlternativeReason.trim().length === 0) {
        return reject("report_blocked requires noSafeAlternativeReason");
      }
      if (state.alternativeDirectionIds.length > 0) {
        return reject(`legal alternative(s) remain: ${state.alternativeDirectionIds.join(",")} — activate or falsify them first`);
      }
      const next: SessionStateV1 = {
        ...state,
        phase: "blocked",
        blockedReason: d.noSafeAlternativeReason,
        lastDecision: d,
      };
      return terminal("blocked", "blocked", "blocked reported", next);
    }

    case "raise_effort": {
      const pre = effortRaisePreconditionsMet(state, d.difficultyType, refs);
      if (!pre.ok) return reject(pre.reason ?? "raise_effort precondition failed");
      const rung = nextEffortRung(state.currentEffort);
      if (!rung) {
        return reject(state.currentEffort === "xhigh" ? "xhigh is the automatic ceiling" : `cannot raise from ${state.currentEffort}`);
      }
      const tr = transitionEffort(state.currentEffort, rung);
      if (!tr.ok || !tr.next) return reject(tr.reason ?? "illegal effort transition");

      // Cost comparison must be EXECUTED: a cheaper legal specialist beats raising effort.
      const candidates: Candidate[] = [
        { action: "raise_effort", fixesGap: true, costTier: config.effortCostTiers[tr.next] ?? null, excluded: null },
      ];
      let specialistRole: string | null = null;
      if (d.capability) {
        specialistRole = resolveCapability(config, d.capability);
        if (!specialistRole) {
          candidates.push({ action: "invoke_specialist", fixesGap: true, costTier: null, excluded: `capability ${d.capability} unmapped` });
        } else {
          const pre2 = preflightEffort(specialistRole, adapters);
          const excluded =
            pre2 === "unavailable"
              ? "preflight effort unavailable (BLOCKED)"
              : pre2 === "blocked"
                ? "preflight blocked"
                : pre2 === "max"
                  ? "cost_guard_conflict: preflight resolved Max"
                  : !adapters.emitChild
                    ? "child dispatch unavailable on this API surface"
                    : null;
          candidates.push({
            action: "invoke_specialist",
            fixesGap: true,
            costTier: roleRelativeCostTier(config, specialistRole),
            excluded,
          });
        }
      }
      const sel = selectCheaperCandidate(candidates);
      if (sel.sourceGap) {
        const nextState: SessionStateV1 = { ...state, sourceGaps: [...state.sourceGaps, "relative cost tier missing"], lastDecision: d };
        return terminal("source_gap", "source_gap", "cost tier missing", nextState, { costComparison: sel.comparison });
      }
      if (sel.chosen && sel.chosen.action === "invoke_specialist" && specialistRole) {
        // Cheaper legal specialist: dispatch ONE bounded specialist call instead of raising.
        return dispatchBounded(args, seq, d, config, adapters, specialistRole, sel.comparison, [
          {
            directionId: `specialist:${d.capability}`,
            question: d.obstacle,
            minimalTask: d.expectedNewInformation,
            falsifier: d.successCriterion,
          },
        ]);
      }

      seq.push("action_started", "partial");
      const ok = adapters.setSessionEffort(tr.next);
      const readback = adapters.readbackActual();
      const verified =
        ok && readback !== null && readback.effort === tr.next && readback.effort !== "unknown" && readback.effort !== "max";
      if (!verified) {
        // Keep actual, mark degraded; never claim the raise happened (AC-027).
        const nextState: SessionStateV1 = {
          ...state,
          currentEffort: readback?.effort ?? state.currentEffort,
          currentModel: readback?.model ?? state.currentModel,
          health: "degraded",
          restoreState: "failed",
          lastDecision: d,
        };
        return terminal("rejected", "failed", "effort set/readback failed or mismatched (kept actual)", nextState, {
          costComparison: sel.comparison,
        });
      }
      const route = buildResolvedRoute({ requestedRole: "current", parentAgentId: args.parentAgentId, childAgentId: null, adapters });
      const nextState: SessionStateV1 = {
        ...state,
        phase: "executing",
        currentEffort: tr.next,
        currentModel: readback.model,
        effortOwnedByExtension: true,
        lastEffortRaiseAt: args.now,
        lastDecision: d,
        health: "ok",
        routingIntegrity: route.integrity === "confirmed" ? "confirmed" : "source_gap",
      };
      return terminal("accepted", "confirmed", undefined, nextState, {
        resolvedRoute: route,
        relativeCostTier: config.effortCostTiers[tr.next] ?? null,
        costComparison: sel.comparison,
      });
    }

    case "delegate_bounded_work":
    case "invoke_specialist":
    case "explore_in_parallel": {
      if (!d.capability) return reject("capability required for dispatch");
      const role = resolveCapability(config, d.capability);
      if (!role) {
        const nextState: SessionStateV1 = { ...state, sourceGaps: [...state.sourceGaps, `capability ${d.capability} unmapped`], lastDecision: d };
        return terminal("source_gap", "source_gap", "capability unmapped (no silent fallback)", nextState);
      }
      const pre = preflightEffort(role, adapters);
      if (pre === "unavailable" || pre === "blocked") {
        const reason = `preflight ${pre} (BLOCKED, zero provider calls)`;
        const nextState: SessionStateV1 = { ...state, phase: "blocked", health: "degraded", blockedReason: reason, lastDecision: d };
        return terminal("blocked", "blocked", reason, nextState);
      }
      if (pre === "max") {
        const route: ResolvedRouteV1 = {
          requestedRole: role,
          resolvedAgent: null,
          resolvedModel: null,
          resolvedEffort: "max",
          parentAgentId: args.parentAgentId,
          childAgentId: null,
          source: "omp",
          integrity: "source_gap",
        };
        return terminal("rejected", "blocked", "cost_guard_conflict: preflight resolved Max", state, {
          effectiveAction: d.action,
          resolvedRoute: route,
          relativeCostTier: roleRelativeCostTier(config, role),
        });
      }

      const probes = d.probes ?? [];
      if (d.action === "explore_in_parallel") {
        const lim = checkExplorationLimits(state, config, probes.length);
        if (!lim.ok) return reject(lim.reason ?? "exploration limit");
        const ids = new Set(probes.map((p) => p.directionId));
        for (const p of probes) {
          if (!p.question || !p.minimalTask || !p.falsifier) {
            return reject("probe missing question/minimalTask/falsifier");
          }
        }
        // SPEC §10.3: wave 2+ must cite NEW evidence produced by the previous wave.
        if (
          state.explorationWave > 0 &&
          state.lastDecision?.action === "explore_in_parallel" &&
          [...new Set(state.lastDecision.evidenceRefs)].sort().join("|") === [...new Set(d.evidenceRefs)].sort().join("|")
        ) {
          return reject("wave 2 requires new evidence from wave 1");
        }
      }
      if (wouldRepeatSameAction(state, d.evidenceRefs, d.action, probes.map((p) => p.directionId))) {
        return reject("same evidence set already used for this action");
      }

      const probeList =
        probes.length > 0
          ? probes
          : [
              {
                directionId: d.alternativeId ?? `single:${d.capability}`,
                question: d.obstacle,
                minimalTask: d.expectedNewInformation,
                falsifier: d.successCriterion,
              },
            ];
      return dispatchBounded(args, seq, d, config, adapters, role, null, probeList);
    }
  }
  // Unreachable given the VALID_ACTIONS gate, but fail closed instead of returning undefined.
  return reject("unhandled action");
}

/** Shared bounded-dispatch path for delegate/specialist/explore (and specialist-wins-over-raise). */
function dispatchBounded(
  args: DecideArgs,
  seq: AuditSeq,
  d: ConvergenceDecisionV1,
  config: ConfigV1,
  adapters: OmpAdapters,
  role: string,
  costComparison: CostComparisonV1 | null,
  probeList: Array<{ directionId: string; question: string; minimalTask: string; falsifier: string }>,
): DecideResult {
  const { state } = args;
  const scope = `${args.sessionId}#${state.generation}`;
  const decisionHash = hashPayload(d);
  if (!adapters.emitChild) {
    const reason = "child dispatch unavailable (BLOCKED, zero provider calls)";
    const nextState: SessionStateV1 = { ...state, phase: "blocked", health: "degraded", blockedReason: reason, lastDecision: d };
    seq.push("decision_blocked", "blocked", { costComparison, decisionStatus: "blocked", decisionReason: reason, effectiveAction: d.action === "raise_effort" ? "invoke_specialist" : d.action });
    const first = result(seq, "blocked", reason, nextState, {
      effectiveAction: d.action === "raise_effort" ? "invoke_specialist" : d.action,
      costComparison,
    });
    args.registry.record(scope, d.decisionId, decisionHash, first.status, first);
    return first;
  }
  seq.push("action_started", "partial");
  const created: string[] = [];
  let failures = 0;
  for (const p of probeList) {
    const r = adapters.emitChild({
      capability: d.capability ?? "unknown",
      directionId: p.directionId,
      question: p.question,
      minimalTask: p.minimalTask,
      falsifier: p.falsifier,
      parentSessionId: args.sessionId,
    });
    if (r) created.push(r.childAgentId);
    else failures += 1;
  }
  if (created.length === 0) {
    const reason = `child creation failed (${failures}/${probeList.length})`;
    const nextState: SessionStateV1 = { ...state, phase: "blocked", health: "degraded", blockedReason: reason, lastDecision: d };
    seq.push("decision_blocked", "failed", { costComparison, decisionStatus: "blocked", decisionReason: reason, effectiveAction: d.action });
    const first = result(seq, "blocked", reason, nextState, { effectiveAction: d.action, costComparison });
    args.registry.record(scope, d.decisionId, decisionHash, first.status, first);
    return first;
  }
  // Per-child route readback; one child never stands in for all.
  const routes = created.map((cid) =>
    buildResolvedRoute({ requestedRole: role, parentAgentId: args.parentAgentId, childAgentId: cid, adapters }),
  );
  const maxRoutes = routes.filter((route) => route.resolvedEffort === "max");
  if (maxRoutes.length > 0) {
    const reason = "child actual effort Max after dispatch; automatic route blocked";
    const nextState: SessionStateV1 = {
      ...state,
      phase: "blocked",
      health: "degraded",
      routingIntegrity: "failed",
      blockedReason: reason,
      ownedChildRuns: [
        ...state.ownedChildRuns,
        ...created.map((childAgentId) => ({ childAgentId, generation: state.generation, status: "stale" as const })),
      ],
      lastDecision: d,
    };
    seq.push("decision_blocked", "blocked", {
      resolvedRoute: routes[0] ?? null,
      resolvedRoutes: routes,
      relativeCostTier: roleRelativeCostTier(config, role),
      costComparison,
      decisionStatus: "blocked",
      decisionReason: reason,
      createdChildIds: created,
      effectiveAction: d.action,
    });
    const first = result(seq, "blocked", reason, nextState, {
      effectiveAction: d.action,
      createdChildIds: created,
      resolvedRoute: routes[0] ?? null,
      resolvedRoutes: routes,
      relativeCostTier: roleRelativeCostTier(config, role),
      costComparison,
    });
    args.registry.record(scope, d.decisionId, decisionHash, first.status, first);
    return first;
  }
  const allConfirmed = routes.every((r) => r.integrity === "confirmed");
  const isExplore = d.action === "explore_in_parallel";
  const nextState: SessionStateV1 = {
    ...state,
    phase: isExplore ? "external_exploration" : "executing",
    automaticWavesUsed: isExplore ? ((state.automaticWavesUsed + 1) as 1 | 2) : state.automaticWavesUsed,
    explorationWave: isExplore ? state.explorationWave + 1 : state.explorationWave,
    ownedChildRuns: [
      ...state.ownedChildRuns,
      ...created.map((childAgentId) => ({ childAgentId, generation: state.generation, status: "running" as const })),
    ],
    lastDecision: d,
    routingIntegrity: allConfirmed ? "confirmed" : "source_gap",
  };
  const effectiveAction = d.action === "raise_effort" ? "invoke_specialist" : d.action;
  const resolvedIntegrity = failures > 0 ? "partial" : allConfirmed ? "confirmed" : "source_gap";
  const opts = {
    effectiveAction,
    createdChildIds: created,
    resolvedRoute: routes[0] ?? null,
    resolvedRoutes: routes,
    relativeCostTier: roleRelativeCostTier(config, role),
    costComparison,
  };
  seq.push("action_terminal", resolvedIntegrity, {
    ...opts,
    decisionStatus: "accepted",
    decisionReason: null,
  });
  const first = result(seq, "accepted", undefined, nextState, opts);
  args.registry.record(scope, d.decisionId, decisionHash, first.status, first);
  return first;
}
