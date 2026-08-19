// Role resolution + preflight + resolved-route construction. (CAP-007)
import type { ConfigV1, DifficultyType, OmpAdapters, ResolvedRouteV1, SemanticAction } from "./types";

/** CAP-007.3: capability -> OMP role. Missing role => null (SOURCE GAP, never silent fallback). */
export function resolveCapability(cfg: ConfigV1, capability: string): string | null {
  if (!capability) return null;
  const role = cfg.capabilities[capability];
  return role && role.length > 0 ? role : null;
}

/** SPEC §9.3 preferred difficulty->action map (not a fixed classifier). */
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

/**
 * Preflight the target role's effort BEFORE any provider call (REQ-042/AC-019/CP-003).
 * Returns "unavailable" when the public API cannot resolve effort pre-call => BLOCKED (no call made).
 */
export function preflightEffort(role: string, adapters: OmpAdapters): "medium" | "high" | "xhigh" | "max" | "blocked" | "unavailable" {
  return adapters.preflightEffort(role);
}

/** Build a ResolvedRouteV1 keeping requested vs resolved strictly separate (REQ-064/AC-022). */
export function buildResolvedRoute(args: {
  requestedRole: string | null;
  parentAgentId: string | null;
  childAgentId: string | null;
  adapters: OmpAdapters;
}): ResolvedRouteV1 {
  const { requestedRole, parentAgentId, childAgentId, adapters } = args;
  if (!requestedRole) {
    return {
      requestedRole: null,
      resolvedAgent: null,
      resolvedModel: null,
      resolvedEffort: "unknown",
      parentAgentId,
      childAgentId,
      source: "unavailable",
      integrity: "source_gap",
    };
  }
  const actual = adapters.readbackActual();
  if (!actual) {
    return {
      requestedRole,
      resolvedAgent: null,
      resolvedModel: null,
      resolvedEffort: "unknown",
      parentAgentId,
      childAgentId,
      source: "unavailable",
      integrity: "source_gap",
    };
  }
  return {
    requestedRole,
    resolvedAgent: requestedRole,
    resolvedModel: actual.model,
    resolvedEffort: actual.effort,
    parentAgentId,
    childAgentId,
    source: "omp",
    integrity: actual.model || actual.effort !== "unknown" ? "confirmed" : "source_gap",
  };
}

export function roleRelativeCostTier(cfg: ConfigV1, role: string): number | null {
  const v = cfg.relativeCostTiers[role];
  return typeof v === "number" ? v : null;
}
