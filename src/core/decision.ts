// Single logical decision entry: weconvergeDecide. (CAP-003/004/005/006/009)
// Pure: OMP side effects are injected via OmpAdapters and only invoked AFTER validation passes.
import type {
  ConfigV1,
  ConvergenceDecisionV1,
  Effort,
  EvidenceRefV1,
  OmpAdapters,
  ResolvedRouteV1,
  SemanticAction,
  SessionStateV1,
} from "./types";
import { isValidEvidenceRef, hasConfirmedEvidence, isModelSelfReportOnly } from "./evidence";
import { resolveCapability, preflightEffort, buildResolvedRoute, preferredActionFor, roleRelativeCostTier } from "./route";
import type { Candidate } from "./cost";
import {
  transitionEffort,
  effortRaisePreconditionsMet,
  checkExplorationLimits,
  wouldRepeatSameAction,
  selectCheaperCandidate,
} from "./cost";
import { buildAuditEvent } from "./audit";
import { DecisionRegistry, hashPayload } from "./ledger";

export type DecisionStatus = "accepted" | "rejected" | "blocked" | "source_gap";

export interface DecideResult {
  status: DecisionStatus;
  reason?: string;
  state: SessionStateV1;
  auditEvent: ReturnType<typeof buildAuditEvent>;
  createdChildIds: string[];
  effectiveAction: SemanticAction | null;
  resolvedRoute: ResolvedRouteV1 | null;
  relativeCostTier: number | null;
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
  completedNewAttemptSinceLastRaise: boolean;
}

const FORBIDDEN_ALLOCATION_FIELDS = ["token", "providerId", "modelId", "provider", "model", "tokens"];
const RESOURCE_ACTIONS: SemanticAction[] = [
  "explore_in_parallel",
  "raise_effort",
  "invoke_specialist",
  "delegate_bounded_work",
  "activate_alternative",
];

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

/** Fail-closed: returns a rejected/source_gap/blocked result without any side effect. */
function refuse(
  status: DecisionStatus,
  reason: string,
  args: DecideArgs,
  effectiveAction: SemanticAction | null,
  resolvedRoute: ResolvedRouteV1 | null,
  relativeCostTier: number | null,
  sourceGaps: string[] = [],
): DecideResult {
  const auditEvent = buildAuditEvent({
    timestamp: args.now,
    sessionId: args.sessionId,
    generation: args.state.generation,
    parentAgentId: args.parentAgentId,
    eventType: `decision_${status}`,
    decision: args.decision,
    resolvedRoute,
    relativeCostTier,
    result: status === "accepted" ? "confirmed" : (status as any),
    sourceGaps,
    restoreResult: null,
  });
  return { status, reason, state: args.state, auditEvent, createdChildIds: [], effectiveAction, resolvedRoute, relativeCostTier };
}

export function weconvergeDecide(args: DecideArgs): DecideResult {
  const { state, decision, config, adapters } = args;

  // ---- 0. Idempotency (SPEC §9.0 / AC-042) ----
  const verdict = args.registry.check(decision.decisionId, hashPayload(decision));
  if (verdict === "conflict") {
    return refuse("rejected", "decisionId reused with different payload", args, decision.action, null, null);
  }
  if (verdict === "duplicate_same") {
    return refuse("accepted", "idempotent duplicate (no side effect)", args, decision.action, null, null);
  }

  // ---- 1. Disabled guard ----
  if (!state.enabledAtStart || state.phase === "disabled") {
    return refuse("rejected", "extension disabled", args, decision.action, null, null);
  }

  // ---- 2. Schema validation (SPEC §9.1 / AC-006) ----
  if (hasForbiddenAllocationFields(decision as unknown as Record<string, unknown>)) {
    return refuse("rejected", "decision must not allocate token/provider/model", args, decision.action, null, null);
  }
  if (!decision.obstacle || decision.obstacle.trim().length === 0) {
    return refuse("rejected", "obstacle required", args, decision.action, null, null);
  }
  if (!decision.expectedNewInformation || decision.expectedNewInformation.trim().length === 0) {
    return refuse("rejected", "expectedNewInformation required", args, decision.action, null, null);
  }
  if (!decision.successCriterion || decision.successCriterion.trim().length === 0) {
    return refuse("rejected", "successCriterion required", args, decision.action, null, null);
  }
  const { refs, missing } = resolveRefs(decision, args.evidenceById);
  if (decision.evidenceRefs.length === 0 || missing.length > 0 || isModelSelfReportOnly(refs)) {
    return refuse("rejected", "evidence must be readable and anchored (no model self-report)", args, decision.action, null, null);
  }

  // ---- 3. Difficulty -> action contract (SPEC §9.3) ----
  if (decision.difficultyType === "source_missing" && decision.action !== "report_source_gap") {
    return refuse("rejected", "source_missing must use report_source_gap", args, decision.action, null, null);
  }
  if (decision.difficultyType === "proven_blocker" && decision.action !== "report_blocked") {
    return refuse("rejected", "proven_blocker must use report_blocked", args, decision.action, null, null);
  }

  // ---- 4. Resource-increasing actions require a confirmed anchor (SPEC §9.1) ----
  const isResource = RESOURCE_ACTIONS.includes(decision.action);
  if (isResource && !hasConfirmedEvidence(refs)) {
    return refuse("rejected", "resource action requires >=1 confirmed evidence", args, decision.action, null, null);
  }

  const preferred = preferredActionFor(decision.difficultyType);
  void preferred; // informational; non-preferred allowed if gates pass (AC-009)

  switch (decision.action) {
    case "continue_current":
      return accept(state, args, "continue_current", null, null, []);

    case "activate_alternative": {
      if (!decision.alternativeId) {
        return refuse("rejected", "activate_alternative requires alternativeId", args, decision.action, null, null);
      }
      const next: SessionStateV1 = {
        ...state,
        phase: "executing",
        selectedDirection: decision.alternativeId,
        alternativeDirectionIds: state.alternativeDirectionIds.filter((a) => a !== decision.alternativeId),
        lastDecision: decision,
      };
      return accept(next, args, "activate_alternative", null, null, []);
    }

    case "report_source_gap": {
      if (!decision.sourceGap || !decision.sourceGap.missingFact || !decision.sourceGap.requiredSource || !decision.sourceGap.impact) {
        return refuse("rejected", "report_source_gap requires missingFact/requiredSource/impact", args, decision.action, null, ["source_gap"]);
      }
      const next: SessionStateV1 = {
        ...state,
        phase: "source_gap",
        sourceGaps: [...state.sourceGaps, decision.sourceGap.missingFact],
        lastDecision: decision,
      };
      return refuseResult("source_gap", "source gap reported", args, "report_source_gap", null, null, [decision.sourceGap.missingFact], next);
    }

    case "report_blocked": {
      if (!hasConfirmedEvidence(refs)) {
        return refuse("rejected", "report_blocked requires confirmed evidence", args, decision.action, null, null);
      }
      if (!decision.noSafeAlternativeReason || decision.noSafeAlternativeReason.trim().length === 0) {
        return refuse("rejected", "report_blocked requires noSafeAlternativeReason", args, decision.action, null, null);
      }
      const next: SessionStateV1 = {
        ...state,
        phase: "blocked",
        blockedReason: decision.noSafeAlternativeReason,
        lastDecision: decision,
      };
      return refuseResult("blocked", "blocked reported", args, "report_blocked", null, null, [], next);
    }

    case "raise_effort": {
      const pre = effortRaisePreconditionsMet(state, decision.difficultyType, args.completedNewAttemptSinceLastRaise);
      if (!pre.ok) return refuse("rejected", pre.reason ?? "raise_effort precondition failed", args, decision.action, null, null);
      const tr = transitionEffort(state.currentEffort, nextEffort(state.currentEffort));
      if (!tr.ok || !tr.next) return refuse("rejected", tr.reason ?? "illegal effort transition", args, decision.action, null, null);
      const candidates: Candidate[] = [
        { action: "raise_effort", fixesGap: true, costTier: config.effortCostTiers[tr.next] ?? null },
      ];
      if (decision.capability) {
        const role = resolveCapability(config, decision.capability);
        const ct = role ? roleRelativeCostTier(config, role) : null;
        candidates.push({ action: "invoke_specialist", fixesGap: true, costTier: ct });
      }
      const sel = selectCheaperCandidate(candidates);
      if (sel.sourceGap) {
        const nextState: SessionStateV1 = { ...state, sourceGaps: [...state.sourceGaps, "relative cost tier missing"], lastDecision: decision };
        return refuseResult("source_gap", "cost tier missing", args, "raise_effort", null, null, ["relative cost tier missing"], nextState);
      }
      const ok = adapters.setSessionEffort(tr.next);
      const readback = adapters.readbackActual();
      if (!ok || !readback) {
        const nextState: SessionStateV1 = { ...state, health: "degraded", restoreState: "failed", lastDecision: decision };
        return refuseResult("degraded", "effort set/readback failed", args, "raise_effort", null, null, [], nextState);
      }
      const nextState: SessionStateV1 = {
        ...state,
        phase: "executing",
        currentEffort: readback.effort,
        currentModel: readback.model,
        effortOwnedByExtension: true,
        lastDecision: decision,
        health: "ok",
      };
      return accept(nextState, args, "raise_effort", null, config.effortCostTiers[tr.next] ?? null, []);
    }

    case "delegate_bounded_work":
    case "invoke_specialist":
    case "explore_in_parallel": {
      if (!decision.capability) {
        return refuse("rejected", "capability required for dispatch", args, decision.action, null, null);
      }
      const role = resolveCapability(config, decision.capability);
      if (!role) {
        const nextState: SessionStateV1 = { ...state, sourceGaps: [...state.sourceGaps, `capability ${decision.capability} unmapped`], lastDecision: decision };
        return refuseResult("source_gap", "capability unmapped (no silent fallback)", args, decision.action, null, null, [`capability ${decision.capability} unmapped`], nextState);
      }
      const pre = preflightEffort(role, adapters);
      if (pre === "unavailable") {
        const nextState: SessionStateV1 = { ...state, health: "degraded", lastDecision: decision };
        return refuseResult("blocked", "preflight effort unavailable (BLOCKED, no call)", args, decision.action, null, null, [], nextState);
      }
      if (pre === "max") {
        const route: ResolvedRouteV1 = {
          requestedRole: role, resolvedAgent: role, resolvedModel: null, resolvedEffort: "max",
          parentAgentId: args.parentAgentId, childAgentId: null, source: "omp", integrity: "confirmed",
        };
        return refuse("rejected", "cost_guard_conflict: preflight resolved Max", args, decision.action, route, roleRelativeCostTier(config, role));
      }
      const probes = decision.probes ?? [];
      if (decision.action === "explore_in_parallel") {
        const lim = checkExplorationLimits(state, config, probes.length);
        if (!lim.ok) return refuse("rejected", lim.reason ?? "exploration limit", args, decision.action, null, null);
        const ids = new Set(probes.map((p) => p.directionId));
        if (ids.size !== probes.length) return refuse("rejected", "duplicate directionId", args, decision.action, null, null);
        for (const p of probes) {
          if (!p.question || !p.minimalTask || !p.falsifier) {
            return refuse("rejected", "probe missing question/minimalTask/falsifier", args, decision.action, null, null);
          }
        }
      }
      if (wouldRepeatSameAction(state, decision.evidenceRefs, decision.action, (decision.probes ?? []).map((p) => p.directionId))) {
        return refuse("rejected", "same evidence set already used for this action", args, decision.action, null, null);
      }
      if (!adapters.emitChild) {
        const nextState: SessionStateV1 = { ...state, health: "degraded", lastDecision: decision };
        return refuseResult("blocked", "child dispatch unavailable (BLOCKED)", args, decision.action, null, null, [], nextState);
      }
      const created: string[] = [];
      const probeList = probes.length > 0 ? probes : [{ directionId: decision.alternativeId ?? "single", question: decision.obstacle, minimalTask: decision.expectedNewInformation, falsifier: decision.successCriterion }];
      for (const p of probeList) {
        const r = adapters.emitChild({
          capability: decision.capability!,
          directionId: p.directionId,
          question: p.question,
          minimalTask: p.minimalTask,
          falsifier: p.falsifier,
          parentSessionId: args.sessionId,
        });
        if (r) created.push(r.childAgentId);
      }
      if (created.length === 0) {
        const nextState: SessionStateV1 = { ...state, health: "degraded", lastDecision: decision };
        return refuseResult("blocked", "child creation failed", args, decision.action, null, null, [], nextState);
      }
      const route = buildResolvedRoute({ requestedRole: role, parentAgentId: args.parentAgentId, childAgentId: created[0], adapters });
      const nextState: SessionStateV1 = {
        ...state,
        phase: decision.action === "explore_in_parallel" ? "external_exploration" : "executing",
        automaticWavesUsed: decision.action === "explore_in_parallel" ? ((state.automaticWavesUsed + 1) as 1 | 2) : state.automaticWavesUsed,
        explorationWave: decision.action === "explore_in_parallel" ? state.explorationWave + 1 : state.explorationWave,
        ownedChildRuns: [...state.ownedChildRuns, ...created.map((cid) => ({ childAgentId: cid, generation: state.generation, status: "running" as const }))],
        lastDecision: decision,
        routingIntegrity: route.integrity === "confirmed" ? "confirmed" : "source_gap",
      };
      return accept(nextState, args, decision.action, route, roleRelativeCostTier(config, role), created);
    }
  }

  return refuse("rejected", "unknown action", args, decision.action, null, null);
}

function nextEffort(current: Effort): Effort {
  if (current === "medium") return "high";
  if (current === "high") return "xhigh";
  return "xhigh";
}

function accept(
  next: SessionStateV1,
  args: DecideArgs,
  action: SemanticAction,
  route: ResolvedRouteV1 | null,
  costTier: number | null,
  createdChildIds: string[],
): DecideResult {
  const auditEvent = buildAuditEvent({
    timestamp: args.now,
    sessionId: args.sessionId,
    generation: args.state.generation,
    parentAgentId: args.parentAgentId,
    eventType: "decision_accepted",
    decision: args.decision,
    resolvedRoute: route,
    relativeCostTier: costTier,
    result: "confirmed",
    sourceGaps: [],
    restoreResult: null,
  });
  return { status: "accepted", state: next, auditEvent, createdChildIds, effectiveAction: action, resolvedRoute: route, relativeCostTier: costTier };
}

function refuseResult(
  status: DecisionStatus,
  reason: string,
  args: DecideArgs,
  action: SemanticAction,
  route: ResolvedRouteV1 | null,
  costTier: number | null,
  sourceGaps: string[],
  next: SessionStateV1,
): DecideResult {
  const auditEvent = buildAuditEvent({
    timestamp: args.now,
    sessionId: args.sessionId,
    generation: args.state.generation,
    parentAgentId: args.parentAgentId,
    eventType: `decision_${status}`,
    decision: args.decision,
    resolvedRoute: route,
    relativeCostTier: costTier,
    result: status === "accepted" ? "confirmed" : (status as any),
    sourceGaps,
    restoreResult: null,
  });
  return { status, reason, state: next, auditEvent, createdChildIds: [], effectiveAction: action, resolvedRoute: route, relativeCostTier: costTier };
}
