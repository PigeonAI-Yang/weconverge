// Audit construction + desensitization + replay. (CAP-011 / SPEC §16/§17)
import type { AuditEventV1, ConvergenceDecisionV1, CostComparisonV1, Effort, Integrity, ResolvedRouteV1, SessionStateV1 } from "./types";

// Consume key AND value: redacting only the key leaks the secret (AC-030 regression).
// Quoted JSON/key-value forms are supported while preserving safe neighboring fields.
const CREDENTIAL_RE =
  /\b(authorization|api[_-]?key|secret|password|cookie|token|credential)\b(["']?\s*[:=]\s*)(?:(['"])(?:bearer\s+)?(?:\\.|[^"'\\])*\3|(?:bearer\s+)?[^\s,;}"'`]+)/gi;
const BEARER_RE = /bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const CREDENTIAL_KEY_RE = /(authorization|cookie|api[_-]?key|secret|password|token|credential)/i;
const MAX_FREE_TEXT = 2000;

/** Redact credentials and cap length so full hidden reasoning / parent context never lands in audit (REQ-063/AC-030). */
export function sanitizeText(s: string): string {
  if (typeof s !== "string") return "";
  let out = s.replace(CREDENTIAL_RE, (_match, key: string, separator: string, quote?: string) => {
    const wrapped = quote ? `${quote}[REDACTED]${quote}` : "[REDACTED]";
    return `${key}${separator}${wrapped}`;
  });
  out = out.replace(BEARER_RE, "[REDACTED]");
  if (out.length > MAX_FREE_TEXT) out = out.slice(0, MAX_FREE_TEXT) + " …[truncated]";
  return out;
}

/**
 * Deep-sanitize an arbitrary event payload (e.g. after_provider_response metadata)
 * BEFORE persistence: credential-looking keys are dropped, string values redacted and
 * capped. Audit must never contain keys/cookies/tokens (AC-030).
 */
export function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated:depth]";
  if (typeof value === "string") return sanitizeText(value);
  if (Array.isArray(value)) return value.map((v) => sanitizeValue(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (CREDENTIAL_KEY_RE.test(k)) {
        out[k] = "[REDACTED]";
        continue;
      }
      out[k] = sanitizeValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function buildAuditEvent(args: {
  eventId: string;
  timestamp: string;
  sessionId: string;
  generation: number;
  parentAgentId: string | null;
  eventType: string;
  decision: ConvergenceDecisionV1 | null;
  resolvedRoute: ResolvedRouteV1 | null;
  relativeCostTier: number | null;
  costComparison: CostComparisonV1 | null;
  result: Integrity;
  sourceGaps: string[];
  restoreResult: string | null;
  decisionId?: string | null;
  payloadHash?: string | null;
  decisionStatus?: "accepted" | "rejected" | "blocked" | "source_gap" | null;
  decisionReason?: string | null;
  effectiveAction?: ConvergenceDecisionV1["action"] | null;
  createdChildIds?: string[];
  resolvedRoutes?: ResolvedRouteV1[];
  stateSnapshot?: SessionStateV1 | null;
}): AuditEventV1 {
  const d = args.decision;
  const event: AuditEventV1 = {
    schemaVersion: 1,
    eventId: args.eventId,
    timestamp: args.timestamp,
    sessionId: args.sessionId,
    generation: args.generation,
    parentAgentId: args.parentAgentId,
    eventType: args.eventType,
    action: d?.action ?? null,
    difficultyType: d?.difficultyType ?? null,
    evidenceSummary: (d?.evidenceRefs ?? []).map((id) => sanitizeText(id)),
    expectedNewInformation: d ? sanitizeText(d.expectedNewInformation) : null,
    successCriterion: d ? sanitizeText(d.successCriterion) : null,
    requestedRole: d?.capability ?? null,
    resolvedRoute: args.resolvedRoute,
    relativeCostTier: args.relativeCostTier,
    costComparison: args.costComparison,
    result: args.result,
    sourceGaps: args.sourceGaps.map(sanitizeText),
    restoreResult: args.restoreResult ? sanitizeText(args.restoreResult) : null,
  };
  if (args.decisionId !== undefined) event.decisionId = args.decisionId;
  else if (d) event.decisionId = d.decisionId;
  if (args.payloadHash !== undefined) event.payloadHash = args.payloadHash;
  if (args.decisionStatus !== undefined) event.decisionStatus = args.decisionStatus;
  if (args.decisionReason !== undefined) event.decisionReason = args.decisionReason === null ? null : sanitizeText(args.decisionReason);
  if (args.effectiveAction !== undefined) event.effectiveAction = args.effectiveAction;
  if (args.createdChildIds !== undefined) event.createdChildIds = args.createdChildIds.map(sanitizeText);
  if (args.resolvedRoutes !== undefined) event.resolvedRoutes = args.resolvedRoutes;
  if (args.stateSnapshot !== undefined) event.stateSnapshot = sanitizeValue(args.stateSnapshot) as SessionStateV1 | null;
  return event;
}

/** Append an audit event to a log (immutable). Returns new array. */
export function appendToLog(log: AuditEventV1[], event: AuditEventV1): AuditEventV1[] {
  return [...log, event];
}

/** Integrity is independent across dimensions (SPEC §14/AC-032). */
export function independentDimensions(state: SessionStateV1): {
  routingIntegrity: string;
  taskOutcome: string;
  sourceGaps: number;
  blockedReason: string | null;
  restoreState: string;
  health: string;
} {
  return {
    routingIntegrity: state.routingIntegrity,
    taskOutcome: state.taskOutcome,
    sourceGaps: state.sourceGaps.length,
    blockedReason: state.blockedReason,
    restoreState: state.restoreState,
    health: state.health,
  };
}

/** Safe persistence: a write failure must not crash OMP; caller degrades (REQ-070/AC-031). */
export function persistAudit(write: () => void): { ok: boolean } {
  try {
    write();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ---------- replay (SPEC §17.1 / AC-037 / AC-115) ----------

/** Structural validation of one persisted audit event. Never throws. */
export function isValidAuditEvent(e: unknown): e is AuditEventV1 {
  if (!e || typeof e !== "object") return false;
  const ev = e as Record<string, unknown>;
  const validIntegrity = ["confirmed", "partial", "source_gap", "blocked", "failed", "stale", "degraded"];
  const validActions = ["continue_current", "activate_alternative", "delegate_bounded_work", "invoke_specialist", "explore_in_parallel", "raise_effort", "report_source_gap", "report_blocked"];
  const validDifficulties = ["path_unclear", "reasoning_depth_insufficient", "domain_mismatch", "bounded_mechanical_work", "alternative_ready", "source_missing", "proven_blocker"];
  const optionalStringOrNull = (value: unknown): boolean => value === undefined || value === null || typeof value === "string";
  const validRoute = (value: unknown): boolean => {
    if (value === null) return true;
    if (!value || typeof value !== "object") return false;
    const r = value as Record<string, unknown>;
    return (
      (r.requestedRole === null || typeof r.requestedRole === "string") &&
      (r.resolvedAgent === null || typeof r.resolvedAgent === "string") &&
      (r.resolvedModel === null || typeof r.resolvedModel === "string") &&
      ["medium", "high", "xhigh", "max", "unknown"].includes(String(r.resolvedEffort)) &&
      (r.parentAgentId === null || typeof r.parentAgentId === "string") &&
      (r.childAgentId === null || typeof r.childAgentId === "string") &&
      ["omp", "unavailable"].includes(String(r.source)) &&
      ["confirmed", "source_gap"].includes(String(r.integrity))
    );
  };
  const validCost = (value: unknown): boolean => {
    if (value === null) return true;
    if (!value || typeof value !== "object") return false;
    const c = value as Record<string, unknown>;
    if (!Array.isArray(c.candidates) || !(c.chosen === null || validActions.includes(String(c.chosen)))) return false;
    return c.candidates.every((candidate) => {
      if (!candidate || typeof candidate !== "object") return false;
      const v = candidate as Record<string, unknown>;
      return validActions.includes(String(v.action)) && (v.costTier === null || typeof v.costTier === "number") && (v.excluded === null || typeof v.excluded === "string");
    });
  };
  const optionalRoutes = ev.resolvedRoutes === undefined || (Array.isArray(ev.resolvedRoutes) && ev.resolvedRoutes.every(validRoute));
  const optionalChildren = ev.createdChildIds === undefined || (Array.isArray(ev.createdChildIds) && ev.createdChildIds.every((id) => typeof id === "string"));
  const optionalSnapshot = ev.stateSnapshot === undefined || ev.stateSnapshot === null || isValidSessionState(ev.stateSnapshot);
  return (
    ev.schemaVersion === 1 &&
    typeof ev.eventId === "string" && ev.eventId.length > 0 &&
    typeof ev.timestamp === "string" && ev.timestamp.length > 0 &&
    typeof ev.sessionId === "string" && ev.sessionId.length > 0 &&
    typeof ev.generation === "number" && Number.isInteger(ev.generation) && ev.generation >= 1 &&
    (ev.parentAgentId === null || typeof ev.parentAgentId === "string") &&
    typeof ev.eventType === "string" && ev.eventType.length > 0 &&
    (ev.action === null || validActions.includes(String(ev.action))) &&
    (ev.difficultyType === null || validDifficulties.includes(String(ev.difficultyType))) &&
    Array.isArray(ev.evidenceSummary) && ev.evidenceSummary.every((id) => typeof id === "string") &&
    optionalStringOrNull(ev.expectedNewInformation) && optionalStringOrNull(ev.successCriterion) &&
    optionalStringOrNull(ev.requestedRole) && validRoute(ev.resolvedRoute) &&
    (ev.relativeCostTier === null || typeof ev.relativeCostTier === "number") && validCost(ev.costComparison) &&
    typeof ev.result === "string" && validIntegrity.includes(ev.result) &&
    Array.isArray(ev.sourceGaps) && ev.sourceGaps.every((gap) => typeof gap === "string") &&
    optionalStringOrNull(ev.restoreResult) &&
    (ev.decisionId === undefined || ev.decisionId === null || typeof ev.decisionId === "string") &&
    (ev.payloadHash === undefined || ev.payloadHash === null || typeof ev.payloadHash === "string") &&
    (ev.decisionStatus === undefined || ev.decisionStatus === null || ["accepted", "rejected", "blocked", "source_gap"].includes(String(ev.decisionStatus))) &&
    optionalStringOrNull(ev.decisionReason) &&
    (ev.effectiveAction === undefined || ev.effectiveAction === null || validActions.includes(String(ev.effectiveAction))) &&
    optionalChildren && optionalRoutes && optionalSnapshot
  );
}

/** Structural validation of a persisted session state blob. Never throws. */
export function isValidSessionState(s: unknown): s is SessionStateV1 {
  if (!s || typeof s !== "object") return false;
  const v = s as Record<string, unknown>;
  const efforts = ["medium", "high", "xhigh", "max", "unknown"];
  const phases = ["disabled", "baseline", "executing", "external_exploration", "integrating", "source_gap", "blocked", "completed", "degraded"];
  const routeIntegrity = ["unverified", "confirmed", "source_gap", "failed"];
  const outcomes = ["not_started", "in_progress", "passed", "failed", "partial", "blocked"];
  const validEvidence = (e: unknown): boolean => {
    if (!e || typeof e !== "object") return false;
    const x = e as Record<string, unknown>;
    return typeof x.id === "string" && ["omp_event", "tool_result", "verification", "child_result"].includes(String(x.kind)) && typeof x.summary === "string" && typeof x.observedAt === "string" && typeof x.sourceId === "string" && ["confirmed", "partial"].includes(String(x.integrity));
  };
  const validChild = (c: unknown): boolean => {
    if (!c || typeof c !== "object") return false;
    const x = c as Record<string, unknown>;
    return typeof x.childAgentId === "string" && typeof x.generation === "number" && ["running", "terminal", "detached", "stale"].includes(String(x.status));
  };
  return (
    v.schemaVersion === 1 && typeof v.generation === "number" && Number.isInteger(v.generation) && v.generation >= 1 &&
    typeof v.enabledAtStart === "boolean" && phases.includes(String(v.phase)) &&
    (v.baselineModel === null || typeof v.baselineModel === "string") && efforts.includes(String(v.baselineEffort)) &&
    (v.currentModel === null || typeof v.currentModel === "string") && efforts.includes(String(v.currentEffort)) &&
    typeof v.effortOwnedByExtension === "boolean" && (v.lastEffortRaiseAt === null || typeof v.lastEffortRaiseAt === "string") &&
    (v.selectedDirection === null || typeof v.selectedDirection === "string") && Array.isArray(v.alternativeDirectionIds) && v.alternativeDirectionIds.every((x) => typeof x === "string") &&
    Array.isArray(v.evidence) && v.evidence.every(validEvidence) && [0, 1, 2].includes(Number(v.automaticWavesUsed)) && typeof v.explorationWave === "number" &&
    Array.isArray(v.ownedChildRuns) && v.ownedChildRuns.every(validChild) && (v.manualExplorationGrant === null || typeof v.manualExplorationGrant === "object") &&
    (v.lastDecision === null || typeof v.lastDecision === "object") && routeIntegrity.includes(String(v.routingIntegrity)) && outcomes.includes(String(v.taskOutcome)) &&
    Array.isArray(v.sourceGaps) && v.sourceGaps.every((x) => typeof x === "string") && (v.blockedReason === null || typeof v.blockedReason === "string") &&
    ["not_needed", "pending", "restored", "failed"].includes(String(v.restoreState)) && ["ok", "degraded"].includes(String(v.health))
  );
}

import type { RegistryResult } from "./ledger";

export interface ReplayedDecision {
  scope: string;
  decisionId: string;
  hash: string;
  result: RegistryResult;
}

export interface RebuildResult {
  state: SessionStateV1 | null;
  degraded: boolean;
  errors: string[];
  registryResults: ReplayedDecision[];
}

function markReplayDegraded(state: SessionStateV1): SessionStateV1 {
  const gaps = state.sourceGaps.includes("audit replay integrity") ? state.sourceGaps : [...state.sourceGaps, "audit replay integrity"];
  return {
    ...state,
    phase: "degraded",
    health: "degraded",
    routingIntegrity: "source_gap",
    sourceGaps: gaps,
    blockedReason: state.blockedReason ?? "audit history is missing, corrupt, or conflicting",
  };
}

function inferDecisionStatus(event: AuditEventV1): RegistryResult["status"] | null {
  if (event.decisionStatus) return event.decisionStatus;
  if (event.eventType === "action_terminal") return "accepted";
  if (event.eventType === "decision_blocked") return "blocked";
  if (event.eventType === "decision_source_gap") return "source_gap";
  if (event.eventType === "decision_rejected") return "rejected";
  return null;
}

/**
 * Rebuild session state from persisted audit events + the persisted state blob
 * (SPEC §17.1): validate every event, fold post-event snapshots in append order,
 * require one contiguous session/generation chain, restore idempotent results, then
 * reconcile with OMP actual model/effort. Corruption never falls back to a fresh baseline.
 */
export function rebuildSessionFromAudit(
  events: unknown[],
  storedState: unknown,
  actual: { model: string | null; effort: Effort } | null,
): RebuildResult {
  const errors: string[] = [];
  const validEvents: AuditEventV1[] = [];
  let previousTimestamp = "";
  let previousGeneration = 0;
  let session: string | null = null;
  const generations = new Set<number>();
  let replayedState: SessionStateV1 | null = null;
  for (const raw of events) {
    if (!isValidAuditEvent(raw)) {
      errors.push("audit event failed schema validation");
      continue;
    }
    const event = raw;
    validEvents.push(event);
    if (session === null) session = event.sessionId;
    else if (event.sessionId !== session) errors.push(`audit session conflict at ${event.eventId}`);
    if (event.timestamp < previousTimestamp) errors.push(`audit event order broken at ${event.eventId}`);
    previousTimestamp = event.timestamp;
    if (event.generation < previousGeneration) errors.push(`audit generation order broken at ${event.eventId}`);
    previousGeneration = event.generation;
    generations.add(event.generation);
    if (event.stateSnapshot !== undefined && event.stateSnapshot !== null) {
      if (event.stateSnapshot.generation !== event.generation) errors.push(`audit state snapshot generation conflict at ${event.eventId}`);
      replayedState = event.stateSnapshot;
    }
  }
  if (events.length === 0) errors.push("audit history missing");
  if (generations.size > 0) {
    const ordered = [...generations].sort((a, b) => a - b);
    for (let i = 1; i < ordered.length; i++) if (ordered[i] !== ordered[i - 1] + 1) errors.push("audit generation chain is not contiguous");
  }

  const storedValid = isValidSessionState(storedState);
  let state: SessionStateV1 | null = storedValid ? storedState : replayedState;
  if (!storedValid) errors.push("persisted state missing or invalid schema");
  if (state === null) return { state: null, degraded: true, errors, registryResults: [] };
  if (replayedState !== null) {
    if (storedValid && JSON.stringify(replayedState) !== JSON.stringify(storedState)) errors.push("audit replay conflicts with persisted state");
    state = replayedState;
  }
  if (previousGeneration > state.generation) errors.push(`audit generation ${previousGeneration} ahead of persisted state generation ${state.generation}`);
  if (state.effortOwnedByExtension) {
    const effortConflict = actual === null || actual.effort === "unknown" || actual.effort !== state.currentEffort;
    const modelConflict = actual === null || actual.model !== state.currentModel;
    if (effortConflict) errors.push("persisted effort ownership conflicts with OMP actual readback");
    if (modelConflict) errors.push("persisted model ownership conflicts with OMP actual readback");
  }

  const grouped = new Map<string, AuditEventV1[]>();
  for (const event of validEvents) {
    if (!event.decisionId || !event.payloadHash) continue;
    const key = `${event.sessionId}#${event.generation}#${event.decisionId}`;
    const group = grouped.get(key) ?? [];
    group.push(event);
    grouped.set(key, group);
  }
  const registryResults: ReplayedDecision[] = [];
  for (const [key, group] of grouped) {
    const hashes = [...new Set(group.map((event) => event.payloadHash as string))];
    if (hashes.length !== 1) {
      errors.push(`decision payload conflict in audit ${key}`);
      continue;
    }
    const terminal = [...group].reverse().find((event) => inferDecisionStatus(event) !== null);
    if (!terminal) continue;
    const status = inferDecisionStatus(terminal);
    if (!status) continue;
    const result: RegistryResult = {
      status,
      reason: terminal.decisionReason ?? undefined,
      state: terminal.stateSnapshot ?? state,
      auditEvents: group,
      auditEventId: terminal.eventId,
      decisionId: terminal.decisionId as string,
      generation: terminal.generation,
      createdChildIds: terminal.createdChildIds ?? [],
      effectiveAction: terminal.effectiveAction ?? terminal.action,
      resolvedRoute: terminal.resolvedRoute,
      resolvedRoutes: terminal.resolvedRoutes ?? (terminal.resolvedRoute ? [terminal.resolvedRoute] : []),
      relativeCostTier: terminal.relativeCostTier,
      costComparison: terminal.costComparison,
    };
    const scopeEnd = key.lastIndexOf(`#${result.decisionId}`);
    registryResults.push({ scope: key.slice(0, scopeEnd), decisionId: result.decisionId, hash: hashes[0], result });
  }
  if (errors.length > 0) state = markReplayDegraded(state);
  return { state, degraded: errors.length > 0, errors, registryResults };
}
