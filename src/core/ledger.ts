// Decision idempotency + generation bookkeeping. (CAP-013/§9.0/AC-042)
import type { AuditEventV1, CostComparisonV1, Effort, ResolvedRouteV1, SemanticAction, SessionStateV1 } from "./types";

export type RegistryStatus = "accepted" | "rejected" | "blocked" | "source_gap";

/** The complete first result kept for an idempotent retry. */
export interface RegistryResult {
  status: RegistryStatus;
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

/**
 * Stable hash of the decision payload (excludes only top-level decisionId, which is the key).
 * The extension schema is passthrough, so every accepted field must participate. Canonicalize
 * nested object keys recursively while preserving array order and scalar values.
 */
function canonicalizePayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizePayload);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const ordered: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) ordered[key] = canonicalizePayload(record[key]);
    return ordered;
  }
  return value;
}

export function hashPayload(d: object): string {
  const raw = d as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const key of Object.keys(raw).filter((key) => key !== "decisionId").sort()) {
    payload[key] = canonicalizePayload(raw[key]);
  }
  const key = JSON.stringify(payload);
  // Simple deterministic hash (FNV-1a-ish) — not cryptographic, just stable.
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export interface RegistryEntry {
  hash: string;
  status: RegistryStatus;
  /** Always present for entries created by the decision engine. */
  result?: RegistryResult;
}

/**
 * Idempotency registry, isolated per (sessionId, generation): the same decisionId in a
 * different session or generation is a fresh decision, never a conflict. A repeated
 * (scope, id, payload) returns the FIRST complete result and never re-runs side effects;
 * the same id with a different payload is a conflict (AC-042).
 */
export class DecisionRegistry {
  private map = new Map<string, RegistryEntry>();

  lookup(scope: string, id: string): RegistryEntry | undefined {
    return this.map.get(`${scope}:${id}`);
  }

  /** Record once; later writes cannot replace the first result. */
  record(scope: string, id: string, hash: string, status: string, result?: RegistryResult): void {
    const key = `${scope}:${id}`;
    if (this.map.has(key)) return;
    this.map.set(key, { hash, status: status as RegistryStatus, result });
  }

  /** Restore an audited first result without executing any action. */
  restore(scope: string, id: string, hash: string, result: RegistryResult): void {
    this.record(scope, id, hash, result.status, result);
  }

  has(scope: string, id: string): boolean {
    return this.map.has(`${scope}:${id}`);
  }

  /** Drop every entry of a scope (e.g. after a generation is fully retired). */
  dropScope(scope: string): void {
    const prefix = `${scope}:`;
    for (const k of [...this.map.keys()]) {
      if (k.startsWith(prefix)) this.map.delete(k);
    }
  }
}
