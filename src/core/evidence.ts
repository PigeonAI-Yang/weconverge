// Evidence validation per SPEC §9.2 / §4.2. Pure.
import type { EvidenceRefV1 } from "./types";

const VALID_KINDS: EvidenceRefV1["kind"][] = ["omp_event", "tool_result", "verification", "child_result"];

export function isValidEvidenceRef(ref: EvidenceRefV1): boolean {
  if (!ref || typeof ref !== "object") return false;
  if (typeof ref.id !== "string" || ref.id.length === 0) return false;
  if (!VALID_KINDS.includes(ref.kind)) return false;
  if (ref.integrity !== "confirmed" && ref.integrity !== "partial") return false;
  // Anchor requirements: a real, readable event/result, not a model assertion.
  if (typeof ref.sourceId !== "string" || ref.sourceId.length === 0) return false;
  if (typeof ref.observedAt !== "string" || ref.observedAt.length === 0) return false;
  if (typeof ref.summary !== "string" || ref.summary.length === 0) return false;
  return true;
}

/** A confirmed anchor is required to pass the convergence gate (SPEC §9.2). */
export function isConfirmedAnchor(ref: EvidenceRefV1): boolean {
  return isValidEvidenceRef(ref) && ref.integrity === "confirmed";
}

export function hasConfirmedEvidence(refs: EvidenceRefV1[]): boolean {
  return refs.some(isConfirmedAnchor);
}

/** Reject decisions that rely solely on unanchored model self-report. */
export function isModelSelfReportOnly(refs: EvidenceRefV1[]): boolean {
  if (refs.length === 0) return true;
  return refs.every((r) => !isValidEvidenceRef(r));
}

/** Normalize a failure signature for duplicate-action detection (SPEC §13). */
export function normalizeFailureSignature(refs: EvidenceRefV1[]): string {
  return refs
    .map((r) => r.failureSignature ?? `${r.kind}:${r.sourceId}`)
    .sort()
    .join("|");
}
