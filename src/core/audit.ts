// Audit construction + desensitization. (CAP-011)
import type { AuditEventV1, ConvergenceDecisionV1, Effort, Integrity, ResolvedRouteV1, SessionStateV1 } from "./types";
import { createInitialState } from "./state";

const CREDENTIAL_RE = /(authorization|bearer\s+[A-Za-z0-9._-]+|cookie\s*[:=]|api[_-]?key|secret|password|token)\s*[:=]?/gi;
const MAX_FREE_TEXT = 2000;

/** Redact credentials and cap length so full hidden reasoning / parent context never lands in audit (REQ-063/AC-030). */
export function sanitizeText(s: string): string {
  if (typeof s !== "string") return "";
  let out = s.replace(CREDENTIAL_RE, "[REDACTED]");
  if (out.length > MAX_FREE_TEXT) out = out.slice(0, MAX_FREE_TEXT) + " …[truncated]";
  return out;
}

export function buildAuditEvent(args: {
  timestamp: string;
  sessionId: string;
  generation: number;
  parentAgentId: string | null;
  eventType: string;
  decision: ConvergenceDecisionV1 | null;
  resolvedRoute: ResolvedRouteV1 | null;
  relativeCostTier: number | null;
  result: Integrity;
  sourceGaps: string[];
  restoreResult: string | null;
}): AuditEventV1 {
  const d = args.decision;
  return {
    schemaVersion: 1,
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
    result: args.result,
    sourceGaps: args.sourceGaps.map(sanitizeText),
    restoreResult: args.restoreResult ? sanitizeText(args.restoreResult) : null,
  };
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

/**
 * Rebuild session state from the persisted audit log (SPEC §17.1 / AC-037).
 * If the replayed generation/effort conflicts with OMP actual, mark degraded and add NO new resources.
 */
export function rebuildSessionFromAudit(
  events: AuditEventV1[],
  baseline: { model: string | null; effort: Effort },
  actual: { model: string | null; effort: Effort },
): { state: SessionStateV1; degraded: boolean } {
  const base = createInitialState({ sessionId: "", enabledAtStart: true, baseline });
  if (events.length === 0) return { state: base, degraded: false };
  const last = events[events.length - 1];
  const replayedGeneration = last.generation;
  const conflict = actual.effort !== "unknown" && actual.effort !== baseline.effort;
  const degraded = conflict;
  const state: SessionStateV1 = {
    ...base,
    generation: replayedGeneration,
    phase: last.result === "blocked" ? "blocked" : last.result === "source_gap" ? "source_gap" : base.phase,
    health: degraded ? "degraded" : "ok",
    sourceGaps: last.sourceGaps,
  };
  return { state, degraded };
}
