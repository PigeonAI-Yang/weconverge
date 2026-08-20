// Observation helpers — fact taxonomy: requested / expected / observed / inferred / source_gap.
// Advisory only: never blocks, never mutates tool input, fail-open.
import type { ConfigV1, SessionStateV1 } from "./types";
import { resolveCapability, roleRelativeCostTier } from "./route";

export interface RequestedFact {
  agent?: string | null;
  effort?: string | null;
  taskPreview?: string | null;
}

export interface ExpectedFact {
  role?: string | null;
  relativeCostTier?: number | null;
}

export interface ObservedFact {
  resolvedModel?: string | null;
  lifecycle?: string | null;
  status?: string | null;
}

export interface InferredFact {
  relativeCostTierNote?: string | null;
  maxCapable?: boolean | null;
}

export function classifyRequested(toolArgs: unknown): RequestedFact | { source_gap: string } {
  if (!toolArgs || typeof toolArgs !== "object") return { source_gap: "requested: tool args missing" };
  const r = toolArgs as Record<string, unknown>;
  const agent = typeof r.agent === "string" ? r.agent : null;
  const effort = typeof r.effort === "string" ? r.effort : null;
  const taskRaw = typeof r.task === "string" ? r.task : typeof r.context === "string" ? r.context : null;
  const taskPreview = taskRaw ? taskRaw.slice(0, 200) : null;
  return { agent, effort, taskPreview };
}

export function classifyExpected(capability: string | null, cfg: ConfigV1): ExpectedFact | { source_gap: string } {
  if (!capability) return { source_gap: "expected: capability missing" };
  const role = resolveCapability(cfg, capability);
  if (!role) return { source_gap: `expected: capability ${capability} unmapped` };
  const tier = roleRelativeCostTier(cfg, role);
  return { role, relativeCostTier: tier };
}

export function classifyObserved(progress: unknown): ObservedFact | { source_gap: string } {
  if (!progress || typeof progress !== "object") return { source_gap: "observed: progress not emitted" };
  const p = progress as Record<string, unknown>;
  const resolvedModel = typeof p.resolvedModel === "string" ? p.resolvedModel : typeof p.model === "string" ? p.model : null;
  const lifecycle = typeof p.lifecycle === "string" ? p.lifecycle : null;
  const status = typeof p.status === "string" ? p.status : null;
  if (!resolvedModel && !lifecycle && !status) return { source_gap: "observed: no lifecycle/progress field" };
  return { resolvedModel, lifecycle, status };
}

export function classifyInferred(cfg: ConfigV1, role: string | null): InferredFact {
  if (!role) return { relativeCostTierNote: "inferred: no role", maxCapable: null };
  const tier = roleRelativeCostTier(cfg, role);
  return {
    relativeCostTierNote: tier !== null ? `inferred tier ${tier} not probative of wire effort` : "inferred: tier missing",
    maxCapable: null,
  };
}

/** Build an advisory audit fragment with taxonomy labels — never conflates requested with observed. */
export function buildTaxonomyAudit(
  requested: RequestedFact | { source_gap: string },
  expected: ExpectedFact | { source_gap: string },
  observed: ObservedFact | { source_gap: string },
  inferred: InferredFact,
): { requested: unknown; expected: unknown; observed: unknown; inferred: unknown; sourceGaps: string[] } {
  const gaps: string[] = [];
  if ("source_gap" in requested) gaps.push(requested.source_gap);
  if ("source_gap" in expected) gaps.push(expected.source_gap);
  if ("source_gap" in observed) gaps.push(observed.source_gap);
  return { requested, expected, observed, inferred, sourceGaps: gaps };
}

/** Observer fail-open: catch and mark degraded, never throw. */
export function withFailOpen(state: SessionStateV1, fn: () => void, reason: string): SessionStateV1 {
  try {
    fn();
    return state;
  } catch {
    return { ...state, health: "degraded", sourceGaps: [...state.sourceGaps, `observer:${reason}`] };
  }
}
