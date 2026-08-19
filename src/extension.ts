/**
 * WEConverge v1 — OMP user-level Extension wiring.
 *
 * This module is the ONLY place that touches the live OMP runtime. It imports the
 * core engine (`src/core`) for all policy logic and implements `OmpAdapters` against
 * the PUBLIC, documented Extension API. It never reads or writes OMP core config,
 * the user's `config.yml`, model/provider credentials, or any other extension's state
 * (the "禁区" is untouched — only `pi.appendEntry` under our own customType is written).
 *
 * Honest runtime limits (proven in CAPABILITY_PROBE.md, CP-003/CP-004/CP-008):
 *  - `preflightEffort` returns "unavailable": the public API cannot prove a route will
 *    NOT resolve to Max before the call, so automatic child dispatch stays BLOCKED
 *    (zero provider calls) rather than risk the Max cost trap.
 *  - `readbackActual` returns effort "unknown": the public API exposes the current Model
 *    but not the resolved effort, so routing integrity is reported as "source_gap"
 *    instead of a false "confirmed".
 *  - `emitChild` is omitted: `ExtensionContext` (tool/event scope) has no `newSession`,
 *    so WEConverge never spawns background children on its own. (Manual user-initiated
 *    dispatch via `ExtensionCommandContext.newSession` is the supported path.)
 */
import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";

import {
  weconvergeDecide,
  createInitialState,
  applyOff,
  resetGeneration,
  renderStatus,
  parseCommand,
  makeInstallConfig,
  validateConfig,
  DecisionRegistry,
} from "./core";
import type {
  ConfigV1,
  ConvergenceDecisionV1,
  EvidenceRefV1,
  OmpAdapters,
  SessionStateV1,
} from "./core";

const STATE_ENTRY = "weconverge_state";
const AUDIT_ENTRY = "weconverge_audit";
const PROVIDER_ENTRY = "weconverge_provider_response";

// ---- session-local runtime state (in-memory for the running session) ----
let state: SessionStateV1 = makeInstallConfigEnabled(false);
let config: ConfigV1 = makeInstallConfig();
const registry = new DecisionRegistry();
let sessionId = "omp-session";
let lastCtx: ExtensionContext | null = null;

function makeInstallConfigEnabled(enabled: boolean): SessionStateV1 {
  return createInitialState({ sessionId: "omp-session", enabledAtStart: enabled, baseline: { model: null, effort: "medium" } });
}

// ---- persistence (uses only our own appendEntry customTypes) ----
function persistState(): void {
  pi.appendEntry(STATE_ENTRY, state);
}
function persistAudit(auditEvent: unknown): void {
  pi.appendEntry(AUDIT_ENTRY, auditEvent);
}

/** Restore latest WEConverge state from the current branch's custom entries. */
function restoreFromBranch(ctx: ExtensionContext): void {
  lastCtx = ctx;
  try {
    const branch = ctx.sessionManager.getBranch();
    for (const entry of branch) {
      const e = entry as { type?: string; customType?: string; data?: unknown };
      if (e.type === "custom" && e.customType === STATE_ENTRY && e.data) {
        state = e.data as SessionStateV1;
      }
    }
  } catch {
    // best-effort; on any read failure keep the in-memory state (fail-closed).
  }
}

// ---- real OMP adapter implementation (public API only) ----
function makeAdapters(ctx: ExtensionContext): OmpAdapters {
  lastCtx = ctx;
  return {
    // Pure: capability -> role via config. Never falls back to a silent default.
    resolveRole: (capability: string) => config.capabilities[capability] ?? null,

    // CP-003: public API cannot preflight the resolved effort. Returning "unavailable"
    // keeps automatic dispatch BLOCKED (zero calls) instead of risking Max.
    preflightEffort: (_role: string) => "unavailable" as const,

    // CP-004: public API exposes the current Model but not the resolved effort.
    readbackActual: () => ({ model: ctx.models.current()?.id ?? null, effort: "unknown" as const }),

    // Best-effort escalation. We cannot verify the result (see readbackActual), so the
    // decision records integrity from readback rather than claiming success.
    setSessionEffort: (effort: string) => {
      try {
        ctx.setThinkingLevel(effort as never);
        return true;
      } catch {
        return false;
      }
    },
    // Omitted on purpose: ExtensionContext has no newSession (CP-004 child preflight
    // is BLOCKED). The core's dispatch path sees `emitChild` undefined -> BLOCKED.
  };
}

export default function weconvergeExtension(pi: ExtensionAPI): void {
  // ---- tool: single decision entry (SPEC §9.0) ----
  pi.registerTool({
    name: "weconverge_decide",
    label: "WEConverge Decide",
    description:
      "Submit a convergence decision (continue / raise effort / explore / invoke specialist / report source_gap / report blocked). " +
      "WEConverge validates evidence, cost guards and the Max ban, then returns the decided action + resolved route.",
    parameters: pi.zod.object({
      decision: pi.zod
        .object({
          decisionId: pi.zod.string(),
          action: pi.zod.string(),
          difficultyType: pi.zod.string(),
          obstacle: pi.zod.string(),
          expectedNewInformation: pi.zod.string(),
          successCriterion: pi.zod.string(),
          evidenceRefs: pi.zod.array(pi.zod.string()).optional(),
          capability: pi.zod.string().optional(),
          probes: pi.zod
            .array(
              pi.zod.object({
                directionId: pi.zod.string(),
                question: pi.zod.string(),
                minimalTask: pi.zod.string(),
                falsifier: pi.zod.string(),
              }),
            )
            .optional(),
          alternativeId: pi.zod.string().optional(),
          noSafeAlternativeReason: pi.zod.string().optional(),
          sourceGap: pi.zod
            .object({
              missingFact: pi.zod.string(),
              requiredSource: pi.zod.string(),
              impact: pi.zod.string(),
            })
            .optional(),
        })
        .passthrough(),
      evidences: pi.zod
        .array(
          pi.zod.object({
            id: pi.zod.string(),
            kind: pi.zod.string(),
            summary: pi.zod.string(),
            observedAt: pi.zod.string(),
            sourceId: pi.zod.string(),
            integrity: pi.zod.string(),
          }),
        )
        .optional(),
      completedNewAttemptSinceLastRaise: pi.zod.boolean().optional(),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const decision = params.decision as unknown as ConvergenceDecisionV1;
      const evidences = (params.evidences ?? []) as EvidenceRefV1[];
      const byId = new Map(evidences.map((r) => [r.id, r]));
      const adapters = makeAdapters(ctx);
      const result = weconvergeDecide({
        state,
        decision,
        config,
        adapters,
        evidenceById: byId,
        registry,
        now: new Date().toISOString(),
        sessionId,
        parentAgentId: ctx.model?.id ?? null,
        completedNewAttemptSinceLastRaise: params.completedNewAttemptSinceLastRaise ?? true,
      });
      state = result.state;
      persistState();
      persistAudit(result.auditEvent);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: result.status,
              reason: result.reason ?? null,
              effectiveAction: result.effectiveAction,
              resolvedRoute: result.resolvedRoute,
              relativeCostTier: result.relativeCostTier,
              createdChildIds: result.createdChildIds,
              state: result.state,
            }),
          },
        ],
      };
    },
  });

  // ---- command: weconverge on|off|status|reset ----
  pi.registerCommand("weconverge", {
    description: "WEConverge scheduling policy: on | off | status | reset",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      lastCtx = ctx;
      const parsed = parseCommand(`weconverge ${args.trim()}`);
      if (parsed.usage) {
        ctx.ui.notify("WEConverge: usage — /weconverge on | off | status | reset", "info");
        return;
      }
      const baseline = { model: ctx.model?.id ?? null, effort: "medium" as const };
      switch (parsed.cmd) {
        case "on":
          state = createInitialState({ sessionId, enabledAtStart: true, baseline });
          persistState();
          ctx.ui.notify("WEConverge: enabled (baseline effort medium, Max ban active).", "info");
          break;
        case "off":
          state = applyOff(state, baseline);
          persistState();
          ctx.ui.notify("WEConverge: disabled; owned effort restored, children detached.", "info");
          break;
        case "reset":
          state = resetGeneration(state, baseline);
          persistState();
          ctx.ui.notify("WEConverge: generation reset, enabled, audit kept.", "info");
          break;
        case "status": {
          const st = renderStatus(state, config);
          persistAudit({ kind: "status_query", status: st });
          ctx.ui.notify(`WEConverge status: ${JSON.stringify(st)}`, "info");
          break;
        }
        default:
          ctx.ui.notify("WEConverge: unknown command.", "warning");
      }
    },
  });

  // ---- lifecycle: restore on start, persist on shutdown ----
  pi.on("session_start", (event, ctx) => {
    sessionId = (event as { sessionId?: string }).sessionId ?? ctx.cwd;
    restoreFromBranch(ctx);
  });
  pi.on("session_shutdown", () => {
    persistState();
  });

  // ---- after_provider_response: audit only, zero routing side effects ----
  // The payload has NO resolved model/effort (CP-003/CP-004), so we record what we
  // have and explicitly flag the missing dimensions as SOURCE GAP — never fabricate.
  pi.on("after_provider_response", (event) => {
    persistAudit({
      kind: "provider_response",
      requestId: event.requestId,
      status: event.status,
      metadata: event.metadata,
      note: "resolved model/effort NOT present in payload -> priceTelemetry/routing SOURCE GAP",
    });
  });

  // Validate install config once at load (does not mutate anything).
  const v = validateConfig(config);
  if (!v.ok) {
    pi.logger.warn("WEConverge: install config invalid", { errors: v.errors });
  }
}
