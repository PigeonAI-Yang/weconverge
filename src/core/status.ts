// Status rendering. Unknown values must show "unknown"/"SOURCE GAP", never a false "confirmed". (CAP-010/AC-028)
import type { ConfigV1, SessionStateV1 } from "./types";

export interface StatusView {
  enabled: boolean;
  phase: string;
  generation: number;
  baselineModel: string;
  baselineEffort: string;
  currentModel: string;
  currentEffort: string;
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
}

const UNKNOWN = "unknown";

export function renderStatus(state: SessionStateV1, _config: ConfigV1): StatusView {
  return {
    enabled: state.enabledAtStart,
    phase: state.phase,
    generation: state.generation,
    baselineModel: state.baselineModel ?? UNKNOWN,
    baselineEffort: state.baselineEffort === "unknown" ? "unknown" : state.baselineEffort,
    currentModel: state.currentModel ?? UNKNOWN,
    currentEffort: state.currentEffort === "unknown" ? "unknown" : state.currentEffort,
    effortOwner: state.effortOwnedByExtension ? "weconverge" : "external/none",
    selectedDirection: state.selectedDirection,
    wave: state.explorationWave,
    activeChildren: state.ownedChildRuns.filter((c) => c.status === "running").length,
    lastDecision: state.lastDecision?.action ?? null,
    routingIntegrity: state.routingIntegrity,
    restoreState: state.restoreState,
    health: state.health,
    sourceGaps: state.sourceGaps,
    priceTelemetry: "SOURCE GAP", // no price/quota telemetry available (SPEC §13)
  };
}
