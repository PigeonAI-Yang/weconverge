// WEConverge core types — faithful to SPEC §4 / §5.1.
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

/** `max` is only for detection/rejection, never an automatic state-machine target. */
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
  selectedDirection: string | null;
  alternativeDirectionIds: string[];
  evidence: EvidenceRefV1[];
  automaticWavesUsed: 0 | 1 | 2;
  explorationWave: number;
  ownedChildRuns: Array<{
    childAgentId: string;
    generation: number;
    status: "running" | "terminal" | "detached" | "stale";
  }>;
  manualExplorationGrant: {
    generation: number;
    extraWaves: number;
    maxParallel: number;
    expiresAt: "task_end";
  } | null;
  lastDecision: ConvergenceDecisionV1 | null;
  routingIntegrity: "unverified" | "confirmed" | "source_gap" | "failed";
  taskOutcome:
    | "not_started"
    | "in_progress"
    | "passed"
    | "failed"
    | "partial"
    | "blocked";
  sourceGaps: string[];
  blockedReason: string | null;
  restoreState: "not_needed" | "pending" | "restored" | "failed";
  health: "ok" | "degraded";
}

export interface ConfigV1 {
  schemaVersion: 1;
  enabled: boolean;
  maxParallelExplorers: number;
  maxExplorationWaves: number;
  capabilities: Record<string, string>;
  relativeCostTiers: Record<string, number>;
  effortCostTiers: Record<string, number>;
}

export interface AuditEventV1 {
  schemaVersion: 1;
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
  result: Integrity;
  sourceGaps: string[];
  restoreResult: string | null;
}

// ---- Injected OMP adapters (implemented only in wiring layer) ----
export interface ChildSpec {
  capability: string;
  directionId: string;
  question: string;
  minimalTask: string;
  falsifier: string;
  parentSessionId: string;
}

export interface OmpAdapters {
  /** CAP-007: capability -> OMP role name, or null if unmapped. */
  resolveRole(capability: string): string | null;
  /** CP-003: resolve the role's effort BEFORE a provider call. `unavailable` => BLOCKED. */
  preflightEffort(role: string): Effort | "blocked" | "unavailable";
  /** CP-006 / CP-004(main): read back current session actual model/effort. null => SOURCE GAP. */
  readbackActual(): { model: string | null; effort: Effort } | null;
  /** CP-005: session-local effort set, no persistent config change. Returns success. */
  setSessionEffort(effort: Effort): boolean;
  /** CP-001: emit a real OMP child Agent. null => cannot dispatch (BLOCKED). */
  emitChild?(spec: ChildSpec): { childAgentId: string } | null;
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

// Allowed automatic effort targets (REQ-030/REQ-032). `max` excluded.
export const AUTO_EFFORTS: Effort[] = ["medium", "high", "xhigh"];
export const BLOCKED_RESULT: Integrity = "blocked";
