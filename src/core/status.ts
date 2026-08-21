// Status rendering — pure advisory (unknown => "unknown"/"SOURCE GAP").
import type { ConfigV1, Effort, SessionStateV1, StatusEffortPolicyView } from "./types";
import { BUILTIN_COMPAT_EFFORTS } from "./types";
import { canonicalizeModelId, getEffectivePolicy, globMatch, validateEffortPolicies } from "./config";

export interface StatusView {
  enabled: boolean;
  phase: string;
  generation: number;
  baselineModel: string;
  baselineEffort: string;
  actualModel: string;
  actualEffort: string;
  effortOwner: string;
  selectedDirection: string | null;
  wave: number;
  activeChildren: number;
  lastDecision: string | null;
  routingIntegrity: string;
  restoreState: string;
  health: string;
  sourceGaps: string[];
  priceTelemetry: string;
  advisoryNote: string;
  effortPolicyStatus: StatusEffortPolicyView["effortPolicyStatus"];
  healthDetail: string | null;
  effective: StatusEffortPolicyView["effective"];
  validationErrors: StatusEffortPolicyView["validationErrors"];
}

const UNKNOWN = "unknown";

function fmtModel(m: string | null): string {
  return m ?? UNKNOWN;
}
function fmtEffort(e: Effort): string {
  return e === "unknown" ? UNKNOWN : e;
}

function computeEffortPolicyView(
  state: SessionStateV1,
  config: ConfigV1,
  actual: { model: string | null; effort: Effort } | null | undefined,
): StatusEffortPolicyView {
  // Determine actual effort/model for view: prefer passed actual, else state
  const actModel = actual === undefined ? state.currentModel : actual === null ? null : actual.model;
  const actEffort = actual === undefined ? state.currentEffort : actual === null ? "unknown" as Effort : actual.effort;
  // Missing block => builtin-compat
  if (config.effortPolicies === undefined) {
    const nextIdx = BUILTIN_COMPAT_EFFORTS.indexOf(actEffort as typeof BUILTIN_COMPAT_EFFORTS[number]);
    const nextEffort = nextIdx >= 0 && nextIdx < BUILTIN_COMPAT_EFFORTS.length - 1 ? BUILTIN_COMPAT_EFFORTS[nextIdx + 1] : null;
    // source_gap if actual unreadable
    if (actModel == null || actEffort === "unknown") {
      return {
        effortPolicyStatus: "source_gap",
        healthDetail: null,
        effective: null,
        validationErrors: [],
      };
    }
    // builtin never has policy_conflict because builtin contains medium/high/xhigh only; but if actualEffort is max or unknown => conflict handled above
    if (!BUILTIN_COMPAT_EFFORTS.includes(actEffort as typeof BUILTIN_COMPAT_EFFORTS[number])) {
      return {
        effortPolicyStatus: "policy_conflict",
        healthDetail: `POLICY_CONFLICT_CURRENT_NOT_IN_LADDER: ${actEffort} not in builtin ladder`,
        effective: null,
        validationErrors: [],
      };
    }
    return {
      effortPolicyStatus: "builtin-compat",
      healthDetail: null,
      effective: {
        matchedRule: "builtin-compat",
        automaticEfforts: [...BUILTIN_COMPAT_EFFORTS],
        nextEffort,
        source: "builtin-compat",
      },
      validationErrors: [],
    };
  }
  const validation = validateEffortPolicies(config.effortPolicies);
  if (!validation.ok) {
    const first = validation.errors[0];
    return {
      effortPolicyStatus: "config_error",
      healthDetail: `CONFIG ERROR: ${first.code}: ${first.message}`,
      effective: null,
      validationErrors: validation.errors,
    };
  }
  // Valid block
  if (actModel == null) {
    return {
      effortPolicyStatus: "source_gap",
      healthDetail: null,
      effective: null,
      validationErrors: [],
    };
  }
  if (actEffort === "unknown") {
    return {
      effortPolicyStatus: "source_gap",
      healthDetail: null,
      effective: null,
      validationErrors: [],
    };
  }
  const canonical = canonicalizeModelId(actModel);
  let matchedRule: string | null = null;
  let automaticEfforts: typeof BUILTIN_COMPAT_EFFORTS | null = null;
  let source: "rule" | "default" | null = null;
  for (const r of config.effortPolicies.rules) {
    if (canonical != null && globMatch(r.match, canonical)) {
      matchedRule = r.match;
      automaticEfforts = r.automaticEfforts;
      source = "rule";
      break;
    }
  }
  if (automaticEfforts == null) {
    matchedRule = "default";
    automaticEfforts = config.effortPolicies.default.automaticEfforts;
    source = "default";
  }
  if (!automaticEfforts.includes(actEffort as typeof automaticEfforts[number])) {
    return {
      effortPolicyStatus: "policy_conflict",
      healthDetail: `POLICY_CONFLICT_CURRENT_NOT_IN_LADDER: ${actEffort} not in [${automaticEfforts.join(",")}]`,
      effective: null,
      validationErrors: [],
    };
  }
  const idx = automaticEfforts.indexOf(actEffort as typeof automaticEfforts[number]);
  const nextEffort = idx >= 0 && idx < automaticEfforts.length - 1 ? automaticEfforts[idx + 1] : null;
  return {
    effortPolicyStatus: "ok",
    healthDetail: null,
    effective: {
      matchedRule,
      automaticEfforts: [...automaticEfforts],
      nextEffort,
      source,
    },
    validationErrors: [],
  };
}

export function renderStatus(
  state: SessionStateV1,
  config: ConfigV1,
  actual?: { model: string | null; effort: Effort } | null,
): StatusView {
  const actualModel = actual === undefined ? fmtModel(state.currentModel) : actual === null ? UNKNOWN : fmtModel(actual.model);
  const actualEffort = actual === undefined ? fmtEffort(state.currentEffort) : actual === null ? UNKNOWN : fmtEffort(actual.effort);
  const view = computeEffortPolicyView(state, config, actual);
  // Derive health: config_error or policy_conflict => degraded
  let health = state.health;
  if (view.effortPolicyStatus === "config_error" || view.effortPolicyStatus === "policy_conflict") {
    health = "degraded";
  }
  return {
    enabled: state.enabledAtStart,
    phase: state.phase,
    generation: state.generation,
    baselineModel: fmtModel(state.baselineModel),
    baselineEffort: fmtEffort(state.baselineEffort),
    actualModel,
    actualEffort,
    effortOwner: state.effortOwnedByExtension ? "weconverge" : "external/none",
    selectedDirection: state.selectedDirection,
    wave: state.explorationWave,
    activeChildren: state.ownedChildRuns.filter((c) => c.status === "running").length,
    lastDecision: state.lastDecision?.action ?? null,
    routingIntegrity: state.routingIntegrity,
    restoreState: state.restoreState,
    health,
    sourceGaps: state.sourceGaps,
    priceTelemetry: "SOURCE GAP",
    advisoryNote: "pure advisory — no enforcement",
    effortPolicyStatus: view.effortPolicyStatus,
    healthDetail: view.healthDetail,
    effective: view.effective,
    validationErrors: view.validationErrors,
  };
}
