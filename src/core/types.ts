// WEConverge core types — pure advisory (2026-08-20).
// Pure types only; no runtime OMP dependency.

export type SemanticAction =
  | "continue_current"
  | "activate_alternative"
  | "delegate_bounded_work"
  | "invoke_specialist"
  | "explore_in_parallel"
  | "raise_effort"
  | "report_source_gap"
  | "report_blocked";

export type DifficultyType =
  | "path_unclear"
  | "reasoning_depth_insufficient"
  | "domain_mismatch"
  | "bounded_mechanical_work"
  | "alternative_ready"
  | "source_missing"
  | "proven_blocker";

/** `max` is only for detection, never an automatic target. */
export type Effort = "medium" | "high" | "xhigh" | "max" | "unknown";

export type Phase =
  | "disabled"
  | "baseline"
  | "executing"
  | "external_exploration"
  | "integrating"
  | "source_gap"
  | "blocked"
  | "completed"
  | "degraded";

export type Integrity =
  | "confirmed"
  | "partial"
  | "source_gap"
  | "blocked"
  | "failed"
  | "stale"
  | "degraded";

export type FactLabel = "requested" | "expected" | "observed" | "inferred" | "source_gap";

export interface EvidenceRefV1 {
  id: string;
  kind: "omp_event" | "tool_result" | "verification" | "child_result";
  summary: string;
  observedAt: string;
  sourceId: string;
  failureSignature?: string;
  integrity: "confirmed" | "partial";
}

export interface ConvergenceDecisionV1 {
  version: 1;
  decisionId: string;
  action: SemanticAction;
  difficultyType: DifficultyType;
  obstacle: string;
  evidenceRefs: string[];
  expectedNewInformation: string;
  successCriterion: string;
  alternativeId?: string;
  capability?: string;
  noSafeAlternativeReason?: string;
  selectedDirectionId?: string;
  alternativeDirectionIds?: string[];
  sourceGap?: {
    missingFact: string;
    requiredSource: string;
    impact: string;
  };
  probes?: Array<{
    directionId: string;
    question: string;
    minimalTask: string;
    falsifier: string;
  }>;
}

export interface ResolvedRouteV1 {
  requestedRole: string | null;
  resolvedAgent: string | null;
  resolvedModel: string | null;
  resolvedEffort: Effort;
  parentAgentId: string | null;
  childAgentId: string | null;
  source: "omp" | "unavailable";
  integrity: "confirmed" | "source_gap";
}

/** Minimal detached tombstone — bounded, ≤200 chars preview, no handlers. */
export interface DetachedTombstone {
  childId: string;
  parentToolCallId: string | null;
  sessionFile: string | null;
  status: string;
  resolvedModel: string | null;
  preview: string; // ≤200 chars
}

export interface SessionStateV1 {
  schemaVersion: 1;
  generation: number;
  enabledAtStart: boolean;
  phase: Phase;
  baselineModel: string | null;
  baselineEffort: Effort;
  currentModel: string | null;
  currentEffort: Effort;
  effortOwnedByExtension: boolean;
  lastEffortRaiseAt: string | null;
  selectedDirection: string | null;
  alternativeDirectionIds: string[];
  evidence: EvidenceRefV1[];
  /** Observed count of task batches emitted by parent (advisory, not enforced). */
  explorationWave: number;
  /** Legacy wave counter kept for compat but not enforced; mirrors explorationWave. */
  automaticWavesUsed: 0 | 1 | 2;
  ownedChildRuns: Array<{
    childAgentId: string;
    generation: number;
    status: "running" | "terminal" | "detached" | "stale";
  }>;
  /** Bounded minimal detached tombstones (max 2 per generation, oldest dropped). */
  detachedTombstones: DetachedTombstone[];
  manualExplorationGrant: {
    generation: number;
    extraWaves: number;
    maxParallel: number;
    expiresAt: "task_end";
  } | null;
  lastDecision: ConvergenceDecisionV1 | null;
  routingIntegrity: "unverified" | "confirmed" | "source_gap" | "failed";
  taskOutcome: "not_started" | "in_progress" | "passed" | "failed" | "partial" | "blocked";
  sourceGaps: string[];
  blockedReason: string | null;
  restoreState: "not_needed" | "pending" | "restored" | "failed";
  health: "ok" | "degraded";
}

export interface ConfigV1 {
  schemaVersion: 1;
  enabled: boolean;
  /** Advisory only — shown in status/audit, not enforced as a block. */
  maxParallelExplorers: number;
  /** Advisory only — not enforced. */
  maxExplorationWaves: number;
  capabilities: Record<string, string>;
  relativeCostTiers: Record<string, number>;
  effortCostTiers: Record<string, number>;
}

/** SPEC §13: candidates, exclusion reasons, cost tiers and final choice. */
export interface CostComparisonV1 {
  candidates: Array<{
    action: SemanticAction;
    costTier: number | null;
    excluded: string | null;
  }>;
  chosen: SemanticAction | null;
}

export interface AuditEventV1 {
  schemaVersion: 1;
  eventId: string;
  timestamp: string;
  sessionId: string;
  generation: number;
  parentAgentId: string | null;
  eventType: string;
  action: SemanticAction | null;
  difficultyType: DifficultyType | null;
  evidenceSummary: string[];
  expectedNewInformation: string | null;
  successCriterion: string | null;
  requestedRole: string | null;
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
  effectiveAction?: SemanticAction | null;
  createdChildIds?: string[];
  resolvedRoutes?: ResolvedRouteV1[];
  stateSnapshot?: SessionStateV1 | null;
  /** Advisory taxonomy fields — explicit requested/expected/observed/inferred/source_gap separation. */
  requested?: { agent?: string | null; effort?: string | null; taskPreview?: string | null } | null;
  expected?: { role?: string | null; relativeCostTier?: number | null } | null;
  observed?: { resolvedModel?: string | null; lifecycle?: string | null } | null;
  inferred?: { relativeCostTierNote?: string | null; maxCapable?: boolean | null } | null;
  isDetachedTombstone?: boolean;
}

// ---- Injected OMP adapters (pure advisory — no dispatch) ----
export interface ChildSpec {
  capability: string;
  directionId: string;
  question: string;
  minimalTask: string;
  falsifier: string;
  parentSessionId: string;
}

export interface ChildRoute {
  agent: string | null;
  model: string | null;
  effort: Effort;
}

export interface OmpAdapters {
  /** capability -> OMP role name, or null if unmapped (SOURCE GAP). */
  resolveRole(capability: string): string | null;
  /** Read back current session actual model/effort. null => SOURCE GAP. */
  readbackActual(): { model: string | null; effort: Effort } | null;
  /** Session-local effort set, no persistent config change. Returns success. */
  setSessionEffort(effort: Effort): boolean;
  /** Provider call count instrumentation (optional). */
  providerCallCount?(): number;
}

export const DEFAULT_CONFIG: ConfigV1 = {
  schemaVersion: 1,
  enabled: false,
  maxParallelExplorers: 2,
  maxExplorationWaves: 2,
  capabilities: {
    cheap_worker: "task",
    mechanical: "sonic",
    research: "scout",
    review: "reviewer",
    frontend: "designer",
  },
  relativeCostTiers: {
    current: 2,
    task: 1,
    sonic: 1,
    scout: 1,
    reviewer: 1,
    designer: 2,
  },
  effortCostTiers: {
    medium: 2,
    high: 3,
    xhigh: 4,
  },
};

// Allowed automatic effort targets. `max` excluded.
export const AUTO_EFFORTS: Effort[] = ["medium", "high", "xhigh"];
export const BLOCKED_RESULT: Integrity = "blocked";
