// Pure-advisory decision entry: weconvergeDecide.
// Narrowed role: only raise_effort, report_source_gap, report_blocked, continue_current (and activate_alternative as manual).
// Retired dispatch actions (delegate/invoke/explore) are REJECTED with advisory note — use native task directly.
// Pure advisory: no automatic dispatch, no concurrency enforcement, no Max ban.
// NEVER throws; malformed input => rejected.

import type {
  AuditEventV1,
  ConfigV1,
  ConvergenceDecisionV1,
  CostComparisonV1,
  DifficultyType,
  Effort,
  EffortLevel,
  EvidenceRefV1,
  Integrity,
  OmpAdapters,
  ResolvedRouteV1,
  SemanticAction,
  SessionStateV1,
} from "./types";
import { BUILTIN_COMPAT_EFFORTS } from "./types";
import { hasConfirmedEvidence, isModelSelfReportOnly } from "./evidence";
import { resolveCapability, roleRelativeCostTier } from "./route";
import { effortRaisePreconditionsMet } from "./cost";
import { canonicalizeModelId, globMatch, validateEffortPolicies } from "./config";
import { buildAuditEvent } from "./audit";
import { DecisionRegistry, hashPayload } from "./ledger";
import { makeEventId } from "./ids";

export type DecisionStatus = "accepted" | "rejected" | "blocked" | "source_gap";

export interface DecideResult {
  status: DecisionStatus;
  reason?: string;
  state: SessionStateV1;
  auditEvents: AuditEventV1[];
  auditEventId: string;
  decisionId: string;
  generation: number;
  createdChildIds: string[];
  effectiveAction: SemanticAction | null;
  resolvedRoute: ResolvedRouteV1 | null;
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
// Pure-advisory allowed actions: only these reach acceptance. Others are retired.
const ADVISORY_ALLOWED: SemanticAction[] = ["continue_current", "activate_alternative", "raise_effort", "report_source_gap", "report_blocked"];
const RETIRED_ACTIONS: SemanticAction[] = ["delegate_bounded_work", "invoke_specialist", "explore_in_parallel"];

function hasForbiddenAllocationFields(d: Record<string, unknown>): boolean {
  return Object.keys(d).some((k) => FORBIDDEN_ALLOCATION_FIELDS.includes(k.toLowerCase()));
}

function resolveRefs(decision: ConvergenceDecisionV1, byId: Map<string, EvidenceRefV1>): { refs: EvidenceRefV1[]; missing: string[] } {
  const refs: EvidenceRefV1[] = [];
  const missing: string[] = [];
  for (const id of decision.evidenceRefs ?? []) {
    const r = byId.get(id);
    if (!r) missing.push(id);
    else refs.push(r);
  }
  return { refs, missing };
}

class AuditSeq {
  events: AuditEventV1[] = [];
  private args: DecideArgs;
  private decision: ConvergenceDecisionV1 | null;
  private payloadHash: string | null;
  constructor(args: DecideArgs, decision: ConvergenceDecisionV1 | null, payloadHash: string | null = null) {
    this.args = args;
    this.decision = decision;
    this.payloadHash = payloadHash;
  }
  get decisionId(): string {
    return this.decision?.decisionId ?? "unknown";
  }
  push(
    eventType: string,
    eventResult: Integrity,
    extra: Partial<{
      resolvedRoute: ResolvedRouteV1 | null;
      resolvedRoutes: ResolvedRouteV1[];
      relativeCostTier: number | null;
      costComparison: CostComparisonV1 | null;
      sourceGaps: string[];
      decisionStatus: DecideResult["status"] | null;
      decisionReason: string | null;
      effectiveAction: SemanticAction | null;
      createdChildIds: string[];
      requestedEffort: EffortLevel | null;
      actualModel: string | null;
      actualEffort: Effort | null;
      matchedRule: string | null;
      automaticEfforts: EffortLevel[] | null;
      nextEffort: EffortLevel | null;
      reasonCode: string | null;
      policySource: "rule" | "default" | "builtin-compat" | null;
    }> = {},
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
      restoreResult: null,
      decisionStatus: extra.decisionStatus,
      decisionReason: extra.decisionReason,
      effectiveAction: extra.effectiveAction,
      createdChildIds: extra.createdChildIds,
      resolvedRoutes: extra.resolvedRoutes,
      requestedEffort: extra.requestedEffort,
      actualModel: extra.actualModel,
      actualEffort: extra.actualEffort,
      matchedRule: extra.matchedRule,
      automaticEfforts: extra.automaticEfforts,
      nextEffort: extra.nextEffort,
      reasonCode: extra.reasonCode,
      policySource: extra.policySource,
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
    createdChildIds?: string[];
    resolvedRoute?: ResolvedRouteV1 | null;
    resolvedRoutes?: ResolvedRouteV1[];
    relativeCostTier?: number | null;
    costComparison?: CostComparisonV1 | null;
  } = {},
): DecideResult {
  const first = {
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
  } as DecideResult;
  return first;
}

export function weconvergeDecide(args: DecideArgs): DecideResult {
  try {
    return decideInner(args);
  } catch (e) {
    try {
      const seq = new AuditSeq(args, null);
      seq.push("decision_received", "failed");
      seq.push("decision_rejected", "failed");
      return result(seq, "rejected", e instanceof Error ? e.message : String(e), args.state);
    } catch {
      return {
        status: "rejected",
        reason: "decision failed",
        state: args.state,
        auditEvents: [],
        auditEventId: "wev-none",
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
  const terminal = (
    status: DecisionStatus,
    integrity: Integrity,
    reason: string | undefined,
    nextState: SessionStateV1,
    opts: Parameters<typeof result>[4] = {},
    auditExtra: Partial<{
      requestedEffort: EffortLevel | null;
      actualModel: string | null;
      actualEffort: Effort | null;
      matchedRule: string | null;
      automaticEfforts: EffortLevel[] | null;
      nextEffort: EffortLevel | null;
      reasonCode: string | null;
      policySource: "rule" | "default" | "builtin-compat" | null;
    }> = {},
  ): DecideResult => {
    const terminalEvent = status === "accepted" ? "action_terminal" : `decision_${status}`;
    seq.push(terminalEvent, integrity, {
      sourceGaps: status === "accepted" ? [] : nextState.sourceGaps.filter((g) => !state.sourceGaps.includes(g)),
      decisionStatus: status,
      decisionReason: reason ?? null,
      effectiveAction: opts.effectiveAction ?? d.action,
      createdChildIds: opts.createdChildIds,
      resolvedRoute: opts.resolvedRoute,
      resolvedRoutes: opts.resolvedRoutes,
      relativeCostTier: opts.relativeCostTier,
      costComparison: opts.costComparison,
      ...auditExtra,
    });
    const first = result(seq, status, reason, nextState, { effectiveAction: d.action, ...opts });
    args.registry.record(scope, d.decisionId, hash, first.status, first);
    return first;
  };

  const prior = args.registry.lookup(scope, d.decisionId);
  if (prior) {
    if (prior.hash !== hash) {
      seq.push("decision_rejected", "failed", { decisionStatus: "rejected", decisionReason: "decisionId reused with different payload" });
      return result(seq, "rejected", "decisionId reused with different payload", state, { effectiveAction: d.action });
    }
    if (prior.result) return prior.result as DecideResult;
    seq.push("decision_rejected", "failed", { decisionStatus: "rejected", decisionReason: "idempotency record missing complete result" });
    return result(seq, "rejected", "idempotency record missing complete result", state, { effectiveAction: d.action });
  }

  if (!state.enabledAtStart || state.phase === "disabled") {
    return reject("extension disabled");
  }

  const versionValue = (raw as Record<string, unknown>).version;
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

  if (d.difficultyType === "source_missing" && d.action !== "report_source_gap") {
    return reject("source_missing must use report_source_gap");
  }
  if (d.difficultyType === "proven_blocker" && d.action !== "report_blocked") {
    return reject("proven_blocker must use report_blocked");
  }

  // Retired dispatch actions: advisory does not dispatch; advise native task.
  if (RETIRED_ACTIONS.includes(d.action)) {
    return reject(`action ${d.action} retired under pure advisory — use native task(context, tasks:[≤2]) directly; weconverge observes only`);
  }
  if (!ADVISORY_ALLOWED.includes(d.action)) {
    return reject(`action ${d.action} not allowed in pure advisory`);
  }

  seq.push("decision_validated", "partial");

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

      // Validate effortPolicies block
      const validation = validateEffortPolicies(config.effortPolicies);
      if (config.effortPolicies !== undefined && !validation.ok) {
        const first = validation.errors[0];
        const code = first.code;
        const nextState: SessionStateV1 = { ...state, health: "degraded", lastDecision: d };
        seq.push("action_started", "partial");
        return terminal("blocked", "blocked", `${code}: ${first.message}`, nextState, { effectiveAction: d.action }, {
          actualModel: null,
          actualEffort: null,
          matchedRule: null,
          automaticEfforts: null,
          nextEffort: null,
          reasonCode: code,
          policySource: null,
        });
      }

      // Read actual model/effort
      const actual = adapters.readbackActual();
      const actualModelRaw = actual?.model ?? null;
      const actualEffortRaw: Effort | null = actual?.effort ?? "unknown";
      if (actual == null || actualModelRaw == null) {
        const nextState: SessionStateV1 = { ...state, lastDecision: d };
        seq.push("action_started", "partial");
        return terminal("source_gap", "source_gap", "SOURCE_GAP_ACTUAL_MODEL_UNREADABLE", nextState, { effectiveAction: d.action }, {
          actualModel: actualModelRaw,
          actualEffort: actualEffortRaw,
          matchedRule: null,
          automaticEfforts: null,
          nextEffort: null,
          reasonCode: "SOURCE_GAP_ACTUAL_MODEL_UNREADABLE",
          policySource: null,
        });
      }
      if (actualEffortRaw == null || actualEffortRaw === "unknown") {
        const nextState: SessionStateV1 = { ...state, lastDecision: d };
        seq.push("action_started", "partial");
        return terminal("source_gap", "source_gap", "SOURCE_GAP_ACTUAL_EFFORT_UNREADABLE", nextState, { effectiveAction: d.action }, {
          actualModel: actualModelRaw,
          actualEffort: "unknown",
          matchedRule: null,
          automaticEfforts: null,
          nextEffort: null,
          reasonCode: "SOURCE_GAP_ACTUAL_EFFORT_UNREADABLE",
          policySource: null,
        });
      }

      // Resolve effective policy
      let matchedRule: string | null = null;
      let automaticEfforts: EffortLevel[] | null = null;
      let policySource: "rule" | "default" | "builtin-compat" | null = null;
      if (config.effortPolicies === undefined) {
        matchedRule = "builtin-compat";
        automaticEfforts = [...BUILTIN_COMPAT_EFFORTS];
        policySource = "builtin-compat";
      } else {
        const canonical = canonicalizeModelId(actualModelRaw);
        let found = false;
        for (const r of config.effortPolicies.rules) {
          if (canonical != null && globMatch(r.match, canonical)) {
            matchedRule = r.match;
            automaticEfforts = r.automaticEfforts;
            policySource = "rule";
            found = true;
            break;
          }
        }
        if (!found) {
          matchedRule = "default";
          automaticEfforts = config.effortPolicies.default.automaticEfforts;
          policySource = "default";
        }
      }

      if (!automaticEfforts) {
        const nextState: SessionStateV1 = { ...state, health: "degraded", lastDecision: d };
        return terminal("blocked", "blocked", "BLOCKED_CONFIG_ERROR", nextState, { effectiveAction: d.action }, {
          actualModel: actualModelRaw,
          actualEffort: actualEffortRaw,
          matchedRule: null,
          automaticEfforts: null,
          nextEffort: null,
          reasonCode: "BLOCKED_CONFIG_ERROR",
          policySource: null,
        });
      }

      // Check current effort in ladder
      const idx = automaticEfforts.indexOf(actualEffortRaw as EffortLevel);
      if (idx === -1) {
        const nextState: SessionStateV1 = { ...state, health: "degraded", lastDecision: d };
        seq.push("action_started", "partial");
        return terminal("blocked", "blocked", "POLICY_CONFLICT_CURRENT_NOT_IN_LADDER", nextState, { effectiveAction: d.action }, {
          actualModel: actualModelRaw,
          actualEffort: actualEffortRaw,
          matchedRule,
          automaticEfforts,
          nextEffort: null,
          reasonCode: "POLICY_CONFLICT_CURRENT_NOT_IN_LADDER",
          policySource,
        });
      }
      if (idx === automaticEfforts.length - 1) {
        seq.push("action_started", "partial");
        return terminal("rejected", "blocked", "REJECTED_NO_NEXT_RUNG", { ...state, lastDecision: d }, { effectiveAction: d.action }, {
          actualModel: actualModelRaw,
          actualEffort: actualEffortRaw,
          matchedRule,
          automaticEfforts,
          nextEffort: null,
          reasonCode: "REJECTED_NO_NEXT_RUNG",
          policySource,
        });
      }
      const nextEffort = automaticEfforts[idx + 1];

      // Determine expected tier for advisory
      let expectedTier: number | null = null;
      if (d.capability) {
        const role = resolveCapability(config, d.capability);
        if (role) expectedTier = roleRelativeCostTier(config, role);
      }
      void expectedTier;

      seq.push("action_started", "partial");
      const ok = adapters.setSessionEffort(nextEffort);
      const readback = adapters.readbackActual();
      const verified =
        ok && readback !== null && readback.effort === nextEffort;
      if (!verified) {
        const nextState: SessionStateV1 = {
          ...state,
          currentEffort: (readback?.effort as Effort) ?? state.currentEffort,
          currentModel: readback?.model ?? state.currentModel,
          health: "degraded",
          restoreState: "failed",
          lastDecision: d,
        };
        return terminal("rejected", "failed", "effort set/readback failed or mismatched (kept actual)", nextState, {
          relativeCostTier: config.effortCostTiers[nextEffort] ?? null,
        }, {
          actualModel: actualModelRaw,
          actualEffort: actualEffortRaw,
          matchedRule,
          automaticEfforts,
          nextEffort,
          reasonCode: "REJECTED_NO_NEXT_RUNG",
          policySource,
        });
      }
      const observedEffort = readback.effort;
      const integrity: Integrity = observedEffort !== "unknown" && readback.model !== null ? "confirmed" : "source_gap";
      const route: ResolvedRouteV1 = {
        requestedRole: "current",
        resolvedAgent: null,
        resolvedModel: readback.model,
        resolvedEffort: observedEffort,
        parentAgentId: args.parentAgentId,
        childAgentId: null,
        source: integrity === "confirmed" ? "omp" : "unavailable",
        integrity,
      };
      const nextState: SessionStateV1 = {
        ...state,
        phase: "executing",
        currentEffort: nextEffort,
        currentModel: readback.model,
        effortOwnedByExtension: true,
        lastEffortRaiseAt: args.now,
        lastDecision: d,
        health: "ok",
        routingIntegrity: integrity === "confirmed" ? "confirmed" : "source_gap",
      };
      const reasonCode = policySource === "default" ? "ACCEPTED_DEFAULT_NEXT_RUNG" : "ACCEPTED_NEXT_RUNG";
      return terminal("accepted", "confirmed", undefined, nextState, {
        resolvedRoute: route,
        relativeCostTier: config.effortCostTiers[nextEffort] ?? null,
        costComparison: null,
      }, {
        actualModel: actualModelRaw,
        actualEffort: actualEffortRaw,
        matchedRule,
        automaticEfforts,
        nextEffort,
        reasonCode,
        policySource,
      });
    }
  }
  return reject("unhandled action");
}
