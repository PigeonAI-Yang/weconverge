// Status rendering. Unknown values must show "unknown"/"SOURCE GAP", never a false "confirmed". (CAP-010/AC-028)
import type { ConfigV1, Effort, SessionStateV1 } from "./types";

export interface StatusView {
  enabled: boolean;
  phase: string;
  generation: number;
  baselineModel: string;
  baselineEffort: string;
  /** LIVE readback at status time — never a stale cached value (2026-08-20 contract). */
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
}

const UNKNOWN = "unknown";

function fmtModel(m: string | null): string {
  return m ?? UNKNOWN;
}
function fmtEffort(e: Effort): string {
  return e === "unknown" ? UNKNOWN : e;
}

/**
 * Render status. `actual` is the live OMP readback taken at status time:
 *  - object: show its values;
 *  - null: readback failed -> show "unknown";
 *  - undefined (tests/pure contexts): fall back to state values.
 */
export function renderStatus(
  state: SessionStateV1,
  _config: ConfigV1,
  actual?: { model: string | null; effort: Effort } | null,
): StatusView {
  const actualModel = actual === undefined ? fmtModel(state.currentModel) : actual === null ? UNKNOWN : fmtModel(actual.model);
  const actualEffort = actual === undefined ? fmtEffort(state.currentEffort) : actual === null ? UNKNOWN : fmtEffort(actual.effort);
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
    health: state.health,
    sourceGaps: state.sourceGaps,
    priceTelemetry: "SOURCE GAP", // no price/quota telemetry available (SPEC §13)
  };
}
