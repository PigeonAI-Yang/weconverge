/**
 * WEConverge v1 — OMP user-level Extension wiring.
 *
 * This module is the ONLY place that touches the live OMP runtime. All OMP access is
 * inside the default-export closure so `pi` is always in scope (2026-08-20 P0 fix:
 * module-level helpers previously referenced a bare `pi` and every command/tool path
 * crashed with "pi is not defined" under real OMP).
 *
 * It imports the core engine (`src/core`) for all policy logic and implements
 * `OmpAdapters` against the PUBLIC, documented Extension API. It never reads or writes
 * OMP core config, the user's `config.yml`, model/provider credentials, or any other
 * extension's state (the "禁区" is untouched — only `pi.appendEntry` under our own
 * customTypes plus our own versioned settings file are written).
 *
 * Honest runtime limits (CAPABILITY_PROBE.md, CP-003/CP-004):
 *  - `preflightEffort` returns "unavailable": the public API cannot prove a route will
 *    NOT resolve to Max before the call, so automatic child dispatch stays BLOCKED
 *    (zero provider calls) rather than risk the Max cost trap.
 *  - `readbackChildRoute` is omitted: a child's actual route is not exposed to the
 *    parent extension, so child routes report SOURCE GAP, never a false "confirmed".
 *  - `emitChild` is omitted: `ExtensionContext` (tool/event scope) has no `newSession`,
 *    so WEConverge never spawns background children on its own.
 */
import type {
  AfterProviderResponseEvent,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ThinkingLevel,
} from "@oh-my-pi/pi-coding-agent";

import {
  weconvergeDecide,
  createInitialState,
  newGeneration,
  applyOff,
  resetGeneration,
  modelSwitch,
  planRestore,
  confirmRestore,
  relinquishOwnership,
  detectExternalOwnershipChange,
  renderStatus,
  parseCommand,
  makeInstallConfig,
  validateConfig,
  rebuildSessionFromAudit,
  buildAuditEvent,
  isValidAuditEvent,
  makeEventId,
  automaticActionBlockReason,
  sanitizeValue,
  persistAudit as safeAuditWrite,
  hashPayload,
  DecisionRegistry,
  USAGE_TEXT,
} from "./core";
import type {
  AuditEventV1,
  ConfigV1,
  ConvergenceDecisionV1,
  DecideResult,
  Effort,
  EvidenceRefV1,
  Integrity,
  OmpAdapters,
  SessionStateV1,
} from "./core";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const STATE_ENTRY = "weconverge_state";
const AUDIT_ENTRY = "weconverge_audit";
const PROVIDER_ENTRY = "weconverge_provider_response";
const SETTINGS_FILE = "settings.json";

/** SPEC §8 policy block, injected once per task via before_agent_start. No LLM call. */
const POLICY_BLOCK = [
  "[WEConverge scheduling policy — active]",
  "Default path: current main model, Medium effort, single agent. No pre-classification.",
  "Non-trivial task: within THIS reasoning pass compare at least two essentially different",
  "directions (different key assumption / evidence source / verification), execute only the",
  "best one, and record the selected + backup direction ids via weconverge_decide.",
  "Simple, closed, once-verifiable tasks may execute directly.",
  "Escalate ONLY with anchored evidence of non-convergence, using weconverge_decide with:",
  "obstacle, evidenceRefs (readable, confirmed), expectedNewInformation, successCriterion.",
  "Never allocate token counts or provider/model ids. Never request max effort.",
  "Missing facts (permissions/files/logs/external state/price telemetry) => report_source_gap.",
  "Full hidden reasoning stays out of audit; submit only short decision summaries.",
].join("\n");

/** Map an OMP thinking level to the SPEC effort enum; unmapped levels are "unknown". */
function mapThinkingLevel(level: ThinkingLevel | undefined): Effort {
  switch (level) {
    case "medium":
    case "high":
    case "xhigh":
    case "max":
      return level;
    default:
      return "unknown";
  }
}

/** Raw tool params: runtime shape is enforced by the zod schema; the core revalidates fail-closed. */
interface DecideToolParams {
  decision: ConvergenceDecisionV1;
  evidences?: EvidenceRefV1[];
}

export default function weconvergeExtension(pi: ExtensionAPI): void {
  // ---- session-local runtime state ----
  let state: SessionStateV1 = createInitialState({
    sessionId: "unstarted",
    enabledAtStart: false,
    baseline: { model: null, effort: "unknown" },
  });
  let config: ConfigV1 = makeInstallConfig();
  const registry = new DecisionRegistry();
  let sessionId = "unstarted";
  let providerCalls = 0;
  let policyInjectedForGeneration = 0;
  let settingsDir: string | null = null;

  // ---- persistence helpers (fail-closed, never crash OMP: REQ-070/AC-031) ----

  function markDegraded(reason: string): void {
    state = { ...state, health: "degraded" };
    pi.logger.warn(`WEConverge degraded: ${reason}`);
  }

  /**
   * Extension-own versioned settings directory. Anchored to the formal session-dir
   * API (never a hardcoded absolute path, never OMP core config): our own namespace
   * sibling of the sessions directory (SPEC §5.1 allows an Extension-owned versioned
   * atomic file).
   *
   * Safety: only the formal `<data>/agent/sessions/<slug>` layout yields a settings
   * dir. Ephemeral (--no-session) or non-standard layouts return null => enabled
   * persistence is unavailable this session (degraded, in-memory only) and NOTHING
   * is ever written into the project/repo tree.
   */
  function ensureSettingsDir(ctx: ExtensionContext): string | null {
    if (settingsDir) return settingsDir;
    try {
      const sessionDir = ctx.sessionManager.getSessionDir();
      const parent = dirname(sessionDir);
      if (!parent || !parent.toLowerCase().endsWith("sessions")) return null;
      const agentDir = dirname(parent);
      const cwd = ctx.cwd.replace(/[\\/]+$/, "").toLowerCase();
      const dir = join(agentDir, "weconverge");
      const dirNorm = dir.replace(/[\\/]+$/, "").toLowerCase();
      if (cwd.length > 0 && (dirNorm === cwd || dirNorm.startsWith(cwd + "\\") || dirNorm.startsWith(cwd + "/"))) {
        return null; // would live inside the working tree — refuse
      }
      mkdirSync(dir, { recursive: true });
      settingsDir = dir;
      return dir;
    } catch {
      return null;
    }
  }

  function loadPersistedEnabled(ctx: ExtensionContext): boolean | null {
    const dir = ensureSettingsDir(ctx);
    if (!dir) return null;
    try {
      const raw = JSON.parse(readFileSync(join(dir, SETTINGS_FILE), "utf8")) as { schemaVersion?: number; enabled?: unknown };
      if (raw.schemaVersion !== 1 || typeof raw.enabled !== "boolean") return null;
      return raw.enabled;
    } catch {
      return null; // missing/corrupt => default off
    }
  }

  function persistEnabled(ctx: ExtensionContext, enabled: boolean): boolean {
    const dir = ensureSettingsDir(ctx);
    if (!dir) return false;
    const file = join(dir, SETTINGS_FILE);
    const tmp = join(dir, `${SETTINGS_FILE}.tmp`);
    try {
      writeFileSync(tmp, JSON.stringify({ schemaVersion: 1, enabled, updatedAt: new Date().toISOString() }), "utf8");
      renameSync(tmp, file);
      return true;
    } catch {
      return false;
    }
  }

  function persistState(): void {
    const r = safeAuditWrite(() => pi.appendEntry(STATE_ENTRY, state));
    if (!r.ok) markDegraded("state appendEntry failed");
  }

  function makeWiringAuditEvent(
    eventType: string,
    result: Integrity,
    extra: { restoreResult?: string | null; resolvedRoute?: AuditEventV1["resolvedRoute"]; relativeCostTier?: number | null } = {},
  ): AuditEventV1 {
    const timestamp = new Date().toISOString();
    return buildAuditEvent({
      eventId: makeEventId(timestamp),
      timestamp,
      sessionId,
      generation: state.generation,
      parentAgentId: null,
      eventType,
      decision: null,
      resolvedRoute: extra.resolvedRoute ?? null,
      relativeCostTier: extra.relativeCostTier ?? null,
      costComparison: null,
      result,
      sourceGaps: state.sourceGaps,
      restoreResult: extra.restoreResult ?? null,
      stateSnapshot: state,
    });
  }

  function persistEvent(event: AuditEventV1, stateAfter: SessionStateV1 = state, decisionResult?: DecideResult): void {
    const snapshotValue = sanitizeValue(stateAfter);
    const snapshot = snapshotValue as SessionStateV1;
    const persisted: AuditEventV1 = { ...event, stateSnapshot: event.stateSnapshot ?? snapshot };
    if (decisionResult && persisted.decisionStatus !== undefined && persisted.decisionStatus !== null) {
      persisted.decisionReason = decisionResult.reason ?? null;
      persisted.effectiveAction = decisionResult.effectiveAction;
      persisted.createdChildIds = decisionResult.createdChildIds;
      persisted.resolvedRoutes = decisionResult.resolvedRoutes;
    }
    if (!isValidAuditEvent(persisted)) {
      markDegraded("invalid audit event refused");
      return;
    }
    const r = safeAuditWrite(() => pi.appendEntry(AUDIT_ENTRY, persisted));
    if (!r.ok) markDegraded("audit appendEntry failed");
  }

  // ---- actual readback (CP-005/CP-006, public API only) ----

  function readbackActual(ctx: ExtensionContext): { model: string | null; effort: Effort } | null {
    try {
      const model = ctx.models.current()?.id ?? ctx.model?.id ?? null;
      const effort = mapThinkingLevel(pi.getThinkingLevel());
      if (model === null && effort === "unknown") return null;
      return { model, effort };
    } catch {
      return null;
    }
  }

  function baselineFromActual(ctx: ExtensionContext): { model: string | null; effort: Effort } {
    return readbackActual(ctx) ?? { model: null, effort: "unknown" };
  }

  /**
   * REAL restore (never memory-only): plan -> setThinkingLevel -> readback -> confirm.
   * Idempotent: once ownership is released, subsequent calls are no-ops.
   */
  function realRestore(ctx: ExtensionContext, why: string): void {
    const plan = planRestore(state);
    if (!plan.needed) return;
    let setOk = false;
    if (plan.target.effort !== "unknown") {
      try {
        pi.setThinkingLevel(plan.target.effort as ThinkingLevel);
        setOk = true;
      } catch {
        setOk = false;
      }
    }
    const actual = setOk ? readbackActual(ctx) : null;
    state = confirmRestore(state, plan.target, actual);
    const restoreIntegrity: Integrity = state.restoreState === "restored" ? "confirmed" : state.restoreState === "failed" ? "failed" : "partial";
    persistEvent(makeWiringAuditEvent("restore", restoreIntegrity, { restoreResult: state.restoreState }));
    if (state.restoreState === "failed") markDegraded(`restore failed (${why})`);
  }

  // ---- session resume: replay persisted state+audit, reconcile with OMP actual ----

  function restoreFromBranch(ctx: ExtensionContext): boolean {
    let hasHistory = true;
    try {
      const branch = ctx.sessionManager.getBranch();
      const states: unknown[] = [];
      const audits: unknown[] = [];
      for (const entry of branch) {
        if (entry.type === "custom" && entry.customType === STATE_ENTRY) states.push(entry.data);
        if (entry.type === "custom" && entry.customType === AUDIT_ENTRY) audits.push(entry.data);
      }
      hasHistory = states.length > 0 || audits.length > 0;
      if (!hasHistory) return false;
      const rebuilt = rebuildSessionFromAudit(audits, states[states.length - 1], readbackActual(ctx));
      if (rebuilt.state) state = rebuilt.state;
      else {
        const reason = rebuilt.errors.join("; ") || "audit replay could not reconstruct state";
        state = {
          ...state,
          phase: "degraded",
          health: "degraded",
          routingIntegrity: "source_gap",
          sourceGaps: [...state.sourceGaps, "audit replay integrity"],
          blockedReason: reason,
          restoreState: "failed",
        };
      }
      for (const replay of rebuilt.registryResults) registry.restore(replay.scope, replay.decisionId, replay.hash, replay.result);
      if (rebuilt.degraded) markDegraded(`resume conflict: ${rebuilt.errors.join("; ")}`);
      return true;
    } catch (e) {
      if (hasHistory) {
        state = {
          ...state,
          phase: "degraded",
          health: "degraded",
          routingIntegrity: "source_gap",
          sourceGaps: [...state.sourceGaps, "audit replay integrity"],
          blockedReason: `resume failed: ${e instanceof Error ? e.message : String(e)}`,
          restoreState: "failed",
        };
        markDegraded("resume failed; baseline initialization suppressed");
        return true;
      }
      return false;
    }
  }

  // ---- real OMP adapter implementation (public API only) ----

  function makeAdapters(ctx: ExtensionContext): OmpAdapters {
    return {
      resolveRole: (capability: string) => config.capabilities[capability] ?? null,
      // CP-003: public API cannot preflight resolved effort => BLOCKED, zero calls.
      preflightEffort: (_role: string) => "unavailable" as const,
      readbackActual: () => readbackActual(ctx),
      // CP-004(child): no per-child route readback on the public API => omitted (SOURCE GAP).
      setSessionEffort: (effort: Effort) => {
        if (effort === "unknown" || effort === "max") return false;
        try {
          pi.setThinkingLevel(effort as ThinkingLevel);
          return mapThinkingLevel(pi.getThinkingLevel()) === effort;
        } catch {
          return false;
        }
      },
      providerCallCount: () => providerCalls,
      // emitChild omitted on purpose: ExtensionContext has no newSession (CP-001 tool scope).
    };
  }

  function newTaskState(ctx: ExtensionContext, enabled: boolean): SessionStateV1 {
    const baseline = baselineFromActual(ctx);
    const fresh = createInitialState({ sessionId, enabledAtStart: enabled, baseline });
    if (enabled && baseline.effort !== "unknown" && baseline.effort !== "medium") {
      // REQ-020: report the deviation, never rewrite persistent config.
      return { ...fresh, sourceGaps: [`baseline effort is ${pi.getThinkingLevel() ?? "unknown"} (target medium)`] };
    }
    return fresh;
  }

  // ---- tool: single decision entry (SPEC §9.0) ----

  const zodWithNumber = pi.zod as typeof pi.zod & { number(): ReturnType<typeof pi.zod.string> };
  pi.registerTool<DecideToolParams>({
    name: "weconverge_decide",
    label: "WEConverge Decide",
    description:
      "Submit a convergence decision (continue / raise effort / explore / invoke specialist / report source_gap / report blocked). " +
      "WEConverge validates evidence, cost guards and the Max ban, then returns the decided action + resolved route.",
    parameters: pi.zod.object({
      decision: pi.zod
        .object({
          version: zodWithNumber.number(),
          decisionId: pi.zod.string(),
          action: pi.zod.string(),
          difficultyType: pi.zod.string(),
          obstacle: pi.zod.string(),
          expectedNewInformation: pi.zod.string(),
          successCriterion: pi.zod.string(),
          evidenceRefs: pi.zod.array(pi.zod.string()),
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
          selectedDirectionId: pi.zod.string().optional(),
          alternativeDirectionIds: pi.zod.array(pi.zod.string()).optional(),
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
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const decision = params.decision as ConvergenceDecisionV1;
      const duplicateScope = `${sessionId}#${state.generation}`;
      const prior = decision && typeof decision === "object" && typeof decision.decisionId === "string" ? registry.lookup(duplicateScope, decision.decisionId) : undefined;
      const duplicate = prior?.result !== undefined && prior.hash === hashPayload(decision);
      const evidences = (params.evidences ?? []) as EvidenceRefV1[];
      const byId = new Map(evidences.map((r) => [r.id, r]));
      const result = weconvergeDecide({
        state,
        decision,
        config,
        adapters: makeAdapters(ctx),
        evidenceById: byId,
        registry,
        now: new Date().toISOString(),
        sessionId,
        parentAgentId: ctx.model?.id ?? null,
      });
      if (!duplicate) {
        state = result.state;
        persistState();
        for (const ev of result.auditEvents) persistEvent(ev, result.state, result);
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: result.status,
              reason: result.reason ?? null,
              generation: result.generation,
              decisionId: result.decisionId,
              auditEventId: result.auditEventId,
              effectiveAction: result.effectiveAction,
              resolvedRoute: result.resolvedRoute,
              resolvedRoutes: result.resolvedRoutes,
              createdChildIds: result.createdChildIds,
              relativeCostTier: result.relativeCostTier,
              costComparison: result.costComparison,
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
      const parsed = parseCommand(`weconverge ${args.trim()}`);
      if (parsed.usage) {
        ctx.ui.notify(`WEConverge: ${USAGE_TEXT}`, "info");
        return;
      }
      switch (parsed.cmd) {
        case "on": {
          if (!persistEnabled(ctx, true)) markDegraded("enabled persistence failed");
          config = { ...config, enabled: true };
          if (ctx.isIdle()) {
            // Idle: safe to establish a fresh baseline for the next task immediately.
            state = newTaskState(ctx, true);
            persistState();
            persistEvent(makeWiringAuditEvent("command_on", "confirmed"));
            ctx.ui.notify(
              `WEConverge: enabled. baseline model=${state.baselineModel ?? "unknown"} effort=${state.baselineEffort} (Max ban active).`,
              "info",
            );
          } else {
            // REQ-010: never take over a running task mid-flight; applies to next tasks.
            persistEvent(makeWiringAuditEvent("command_on", "confirmed"));
            ctx.ui.notify("WEConverge: enabled for subsequent tasks (current task not taken over).", "info");
          }
          break;
        }
        case "off": {
          realRestore(ctx, "command_off");
          if (state.restoreState !== "failed") {
            state = applyOff(state, { model: state.baselineModel, effort: state.baselineEffort });
          }
          if (!persistEnabled(ctx, false)) markDegraded("enabled persistence failed");
          config = { ...config, enabled: false };
          persistState();
          persistEvent(makeWiringAuditEvent("command_off", state.health === "ok" ? "confirmed" : "degraded", { restoreResult: state.restoreState }));
          ctx.ui.notify(
            `WEConverge: disabled; restore=${state.restoreState}; WEConverge children detached (user children untouched).`,
            "info",
          );
          break;
        }
        case "reset": {
          realRestore(ctx, "command_reset");
          if (state.restoreState !== "failed") {
            state = resetGeneration(state, baselineFromActual(ctx));
          }
          persistState();
          persistEvent(makeWiringAuditEvent("command_reset", state.health === "ok" ? "confirmed" : "degraded", { restoreResult: state.restoreState }));
          ctx.ui.notify(`WEConverge: generation reset (enabled=${state.enabledAtStart}); audit kept.`, "info");
          break;
        }
        case "status": {
          // Strictly read-only: NO appendEntry, NO state transition (AC-028).
          const view = renderStatus(state, config, readbackActual(ctx));
          ctx.ui.notify(`WEConverge status: ${JSON.stringify(view)}`, "info");
          break;
        }
        default:
          ctx.ui.notify(`WEConverge: ${USAGE_TEXT}`, "info");
      }
    },
  });

  // ---- lifecycle wiring (formal events only) ----

  pi.on("session_start", (_event, ctx) => {
    try {
      sessionId = ctx.sessionManager.getSessionId();
      const persisted = loadPersistedEnabled(ctx);
      config = { ...config, enabled: persisted ?? false };
      const resumed = restoreFromBranch(ctx);
      if (!resumed) {
        const enabled = config.enabled;
        const hadPriorTask = state.generation > 1 || state.enabledAtStart || state.phase !== "disabled";
        if (hadPriorTask) {
          // New task: generation++, no inheritance of evidence/waves/children (REQ-011).
          const next = newGeneration(state, baselineFromActual(ctx));
          state = { ...next, enabledAtStart: enabled, phase: enabled ? "baseline" : "disabled" };
        } else {
          state = newTaskState(ctx, enabled);
        }
      }
      persistEvent(makeWiringAuditEvent("session_start", state.health === "ok" ? "confirmed" : "degraded"));
    } catch (e) {
      markDegraded(`session_start handling failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  pi.on("before_agent_start", (event, ctx) => {
    try {
      // External ownership detection at a formal readback boundary (CP-007/REQ-013).
      const actual = readbackActual(ctx);
      if (actual && detectExternalOwnershipChange(state, actual)) {
        state = relinquishOwnership(state, actual);
        persistEvent(makeWiringAuditEvent("ownership_lost", "degraded"));
        persistState();
      }
      if (automaticActionBlockReason(state)) return undefined;
      if (!state.enabledAtStart || state.phase === "disabled") return undefined;
      if (policyInjectedForGeneration === state.generation) return undefined;
      policyInjectedForGeneration = state.generation;
      return { systemPrompt: [...event.systemPrompt, POLICY_BLOCK] };
    } catch (e) {
      // AC-041: injection failure degrades WEConverge; ordinary OMP continues.
      markDegraded(`policy injection failed: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  });

  pi.on("session_before_switch", (_event, ctx) => {
    try {
      realRestore(ctx, "session_before_switch");
    } catch (e) {
      markDegraded(`session_before_switch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    return undefined;
  });

  pi.on("session_switch", (_event, ctx) => {
    try {
      sessionId = ctx.sessionManager.getSessionId();
      if (state.restoreState !== "failed") state = modelSwitch(state, baselineFromActual(ctx));
      registry.dropScope(`${sessionId}#${state.generation - 1}`);
      persistState();
      persistEvent(makeWiringAuditEvent("session_switch", state.health === "ok" ? "confirmed" : "degraded"));
    } catch (e) {
      markDegraded(`session_switch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  const terminalRestore = (why: string, ctx: ExtensionContext) => {
    try {
      realRestore(ctx, why);
      persistState();
    } catch (e) {
      markDegraded(`${why} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  pi.on("session_stop", (_event, ctx) => {
    terminalRestore("session_stop", ctx);
    return undefined;
  });

  pi.on("agent_end", (event, ctx) => {
    if (event.willContinue) return; // not a user-visible terminal settle
    terminalRestore("agent_end", ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    try {
      realRestore(ctx, "session_shutdown");
      persistState();
    } catch (e) {
      markDegraded(`session_shutdown failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  // ---- after_provider_response: instrumentation + sanitized audit, zero routing ----

  pi.on("after_provider_response", (_event: AfterProviderResponseEvent) => {
    providerCalls += 1;
    if (!state.enabledAtStart) return;
    // Sanitize BEFORE persistence: credentials/keys never land in audit (AC-030).
    const providerEvent = makeWiringAuditEvent("provider_response", "partial");
    persistEvent({
      ...providerEvent,
      sourceGaps: [...providerEvent.sourceGaps, "priceTelemetry/routing actual not exposed"],
    });
  });

  // Validate install config once at load (does not mutate anything).
  const v = validateConfig(config);
  if (!v.ok) {
    pi.logger.warn("WEConverge: install config invalid", { errors: v.errors });
  }
}
