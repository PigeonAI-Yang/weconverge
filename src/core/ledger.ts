// Decision idempotency + generation bookkeeping. (CAP-013/§9.0/AC-042)
import type { ConvergenceDecisionV1 } from "./types";

export function hashPayload(d: ConvergenceDecisionV1): string {
  // Stable hash of the decision payload (excludes decisionId which is the key).
  const key = JSON.stringify({
    action: d.action,
    difficultyType: d.difficultyType,
    obstacle: d.obstacle,
    evidenceRefs: [...d.evidenceRefs].sort(),
    expectedNewInformation: d.expectedNewInformation,
    successCriterion: d.successCriterion,
    alternativeId: d.alternativeId ?? null,
    capability: d.capability ?? null,
    sourceGap: d.sourceGap ?? null,
    probes: (d.probes ?? []).map((p) => p.directionId).sort(),
  });
  // Simple deterministic hash (FNV-1a-ish) — not cryptographic, just stable.
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export type IdempotencyResult = "first" | "duplicate_same" | "conflict";

export class DecisionRegistry {
  private map = new Map<string, string>();
  /** Returns the idempotency verdict for (id, payloadHash). Records on first. */
  check(id: string, payloadHash: string): IdempotencyResult {
    const existing = this.map.get(id);
    if (existing === undefined) {
      this.map.set(id, payloadHash);
      return "first";
    }
    return existing === payloadHash ? "duplicate_same" : "conflict";
  }
  has(id: string): boolean {
    return this.map.has(id);
  }
}
