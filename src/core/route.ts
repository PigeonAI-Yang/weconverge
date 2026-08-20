// Role resolution — advisory only (no preflight blocking, no Max ban).
import type { ConfigV1, DifficultyType, SemanticAction } from "./types";

/** Capability -> OMP role. Missing role => null (SOURCE GAP, never silent fallback). */
export function resolveCapability(cfg: ConfigV1, capability: string): string | null {
  if (!capability) return null;
  const role = cfg.capabilities[capability];
  return role && role.length > 0 ? role : null;
}

/** Preferred difficulty->action map (advisory, not enforced). */
export function preferredActionFor(difficulty: DifficultyType): SemanticAction {
  switch (difficulty) {
    case "path_unclear":
      return "explore_in_parallel";
    case "reasoning_depth_insufficient":
      return "raise_effort";
    case "domain_mismatch":
      return "invoke_specialist";
    case "bounded_mechanical_work":
      return "delegate_bounded_work";
    case "alternative_ready":
      return "activate_alternative";
    case "source_missing":
      return "report_source_gap";
    case "proven_blocker":
      return "report_blocked";
  }
}

export function roleRelativeCostTier(cfg: ConfigV1, role: string): number | null {
  const v = cfg.relativeCostTiers[role];
  return typeof v === "number" ? v : null;
}

/** Advisory annotation: is a model name Max-capable? Inferred, not observed. */
export function isInferredMaxCapable(modelId: string | null): boolean {
  if (!modelId) return false;
  return modelId.toLowerCase().includes("max") || modelId.toLowerCase().includes("cockpit");
}
