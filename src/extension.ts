/**
 * WEConverge v1 — pure advisory Extension wiring.
 * One active full runtime per sessionId#generation + bounded detached tombstones.
 * Observation only: no blocking, no dispatch. Native task remains untouched.
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
  validateEffortPolicies,
  rebuildSessionFromAudit,
  buildAuditEvent,
  isValidAuditEvent,
  makeEventId,
  sanitizeValue,
  persistAudit as safeAuditWrite,
  hashPayload,
  DecisionRegistry,
  USAGE_TEXT,
  POLICY_BLOCK,
  addDetachedTombstone,
  recordObservedTaskCall,
  recordObservedTaskResult,
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
const SETTINGS_FILE = "settings.json";

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

interface DecideToolParams {
  decision: ConvergenceDecisionV1;
  evidences?: EvidenceRefV1[];
}

export default function weconvergeExtension(pi: ExtensionAPI): void {
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

  function markDegraded(reason: string): void {
    state = { ...state, health: "degraded" };
    pi.logger.warn(`WEConverge degraded: ${reason}`);
  }

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
        return null;
      }
      mkdirSync(dir, { recursive: true });
      settingsDir = dir;
      return dir;
    } catch {
      return null;
    }
  }

  function loadPersistedConfig(ctx: ExtensionContext): ConfigV1 | null {
    const dir = ensureSettingsDir(ctx);
    if (!dir) return null;
    try {
      const rawText = readFileSync(join(dir, SETTINGS_FILE), "utf8");
      const raw = JSON.parse(rawText) as Record<string, unknown>;
      if (raw.schemaVersion !== 1 || typeof raw.enabled !== "boolean") return null;
      const base = makeInstallConfig();
      const merged: ConfigV1 = { ...base, enabled: raw.enabled as boolean, schemaVersion: 1 };
      if (typeof raw.maxParallelExplorers === "number") merged.maxParallelExplorers = raw.maxParallelExplorers as number;
      if (typeof raw.maxExplorationWaves === "number") merged.maxExplorationWaves = raw.maxExplorationWaves as number;
      if (raw.capabilities && typeof raw.capabilities === "object") merged.capabilities = raw.capabilities as Record<string, string>;
      if (raw.relativeCostTiers && typeof raw.relativeCostTiers === "object") merged.relativeCostTiers = raw.relativeCostTiers as Record<string, number>;
      if (raw.effortCostTiers && typeof raw.effortCostTiers === "object") merged.effortCostTiers = raw.effortCostTiers as Record<string, number>;
      if ("effortPolicies" in raw) {
        merged.effortPolicies = raw.effortPolicies as ConfigV1["effortPolicies"];
      }
      return merged;
    } catch {
      return null;
    }
  }

  function persistEnabled(ctx: ExtensionContext, enabled: boolean): boolean {
    const dir = ensureSettingsDir(ctx);
    if (!dir) return false;
    const file = join(dir, SETTINGS_FILE);
    const tmp = join(dir, `${SETTINGS_FILE}.tmp`);
    try {
      let existing: Record<string, unknown> = {};
      try {
        const txt = readFileSync(file, "utf8");
        const parsed = JSON.parse(txt);
        if (parsed && typeof parsed === "object" && parsed !== null) existing = parsed as Record<string, unknown>;
      } catch {
        existing = {};
      }
      const next: Record<string, unknown> = { ...existing, schemaVersion: 1, enabled, updatedAt: new Date().toISOString() };
      if (!("effortPolicies" in next) && config.effortPolicies !== undefined) {
        next.effortPolicies = config.effortPolicies as unknown as Record<string, unknown>;
      }
      writeFileSync(tmp, JSON.stringify(next), "utf8");
      renameSync(tmp, file);
      config = { ...config, enabled };
      if (typeof existing.maxParallelExplorers === "number") config.maxParallelExplorers = existing.maxParallelExplorers as number;
      if (typeof existing.maxExplorationWaves === "number") config.maxExplorationWaves = existing.maxExplorationWaves as number;
      if (existing.capabilities && typeof existing.capabilities === "object") config.capabilities = existing.capabilities as Record<string, string>;
      if (existing.relativeCostTiers && typeof existing.relativeCostTiers === "object") config.relativeCostTiers = existing.relativeCostTiers as Record<string, number>;
      if (existing.effortCostTiers && typeof existing.effortCostTiers === "object") config.effortCostTiers = existing.effortCostTiers as Record<string, number>;
      if ("effortPolicies" in existing) {
        config.effortPolicies = existing.effortPolicies as ConfigV1["effortPolicies"];
      }
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

  function makeAdapters(ctx: ExtensionContext): OmpAdapters {
    return {
      resolveRole: (capability: string) => config.capabilities[capability] ?? null,
      readbackActual: () => readbackActual(ctx),
      setSessionEffort: (effort: Effort) => {
        if (effort === "unknown") return false;
        try {
          pi.setThinkingLevel(effort as ThinkingLevel);
          return mapThinkingLevel(pi.getThinkingLevel()) === effort;
        } catch {
          return false;
        }
      },
      providerCallCount: () => providerCalls,
    };
  }


  function newTaskState(ctx: ExtensionContext, enabled: boolean): SessionStateV1 {
    const baseline = baselineFromActual(ctx);
    const fresh = createInitialState({ sessionId, enabledAtStart: enabled, baseline });
    if (enabled && baseline.effort !== "unknown" && baseline.effort !== "medium") {
      return { ...fresh, sourceGaps: [`baseline effort is ${pi.getThinkingLevel() ?? "unknown"} (target medium)`] };
    }
    return fresh;
  }

  // ---- tool: narrowed decide (raise_effort / source_gap / blocked / continue) ----
  const zodWithNumber = pi.zod as typeof pi.zod & { number(): ReturnType<typeof pi.zod.string> };
  pi.registerTool<DecideToolParams>({
    name: "weconverge_decide",
    label: "WEConverge Decide",
    description:
      "Pure-advisory decision for parent effort or formal gap. Allowed: raise_effort, report_source_gap, report_blocked, continue_current. Retired dispatch actions use native task directly.",
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

  // ---- commands: on|off|status|reset (advisory) ----
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
            state = newTaskState(ctx, true);
            persistState();
            persistEvent(makeWiringAuditEvent("command_on", "confirmed"));
            ctx.ui.notify(
              `WEConverge: enabled. baseline model=${state.baselineModel ?? "unknown"} effort=${state.baselineEffort} (advisory).`,
              "info",
            );
          } else {
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
            `WEConverge: disabled; restore=${state.restoreState}; observed children detached (user children untouched).`,
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
      const loaded = loadPersistedConfig(ctx);
      if (loaded) {
        config = loaded;
      }
      const resumed = restoreFromBranch(ctx);
      if (!resumed) {
        const enabled = config.enabled;
        const hadPriorTask = state.generation > 1 || state.enabledAtStart || state.phase !== "disabled";
        if (hadPriorTask) {
          const next = newGeneration(state, baselineFromActual(ctx));
          state = { ...next, enabledAtStart: enabled, phase: enabled ? "baseline" : "disabled" };
        } else {
          state = newTaskState(ctx, enabled);
        }
      }
      // Mark degraded if present policy invalid (design §5.2)
      if (config.effortPolicies !== undefined) {
        const vp = validateEffortPolicies(config.effortPolicies);
        if (!vp.ok) state = { ...state, health: "degraded" };
      }
      persistEvent(makeWiringAuditEvent("session_start", state.health === "ok" ? "confirmed" : "degraded"));
    } catch (e) {
      markDegraded(`session_start handling failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  pi.on("before_agent_start", (event, ctx) => {
    try {
      const actual = readbackActual(ctx);
      if (actual && detectExternalOwnershipChange(state, actual)) {
        state = relinquishOwnership(state, actual);
        persistEvent(makeWiringAuditEvent("ownership_lost", "degraded"));
        persistState();
      }
      if (!state.enabledAtStart || state.phase === "disabled") return undefined;
      if (policyInjectedForGeneration === state.generation) return undefined;
      policyInjectedForGeneration = state.generation;
      return { systemPrompt: [...event.systemPrompt, POLICY_BLOCK] };
    } catch (e) {
      markDegraded(`policy injection failed: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  });

  // Observation-only handlers — fail-open, ≤5ms, no await, no I/O
  const tryObserve = (label: string, fn: () => void): void => {
    try {
      fn();
    } catch (e) {
      markDegraded(`observer:${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Generic observation of public tool_call / tool_result / task:subagent:* if available.
  // Use typed as unknown to remain compatible if OMP does not expose these events.
  const maybeOn = pi as unknown as {
    on?: (event: string, handler: (ev: unknown, ctx: ExtensionContext) => unknown) => void;
    events?: { on?: (event: string, handler: (ev: unknown) => void) => void };
  };

  if (typeof maybeOn.on === "function") {
    try {
      // tool_call observation — requested fact
      (pi as unknown as { on: (e: string, h: (ev: unknown, ctx: ExtensionContext) => void) => void }).on("tool_call", (ev: unknown, _ctx: ExtensionContext) => {
        tryObserve("tool_call", () => {
          const e = ev as Record<string, unknown>;
          if (e.toolName !== "task" && e.name !== "task") return;
          const input = (e.input ?? e.args ?? e.params) as unknown;
          const rec = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
          const taskPreview = rec && typeof rec["task"] === "string" ? String(rec["task"]).slice(0, 200) : rec && typeof rec["context"] === "string" ? String(rec["context"]).slice(0, 200) : "";
          const agent = rec && typeof rec["agent"] === "string" ? String(rec["agent"]) : null;
          const effort = rec && typeof rec["effort"] === "string" ? String(rec["effort"]) : null;
          // expected role (inferred from config) — advisory
          const capability = null; // task call itself does not carry capability; advisory maps via agent if needed
          void capability;
          // record observed wave
          const childId = typeof e["toolCallId"] === "string" ? String(e["toolCallId"]) : `task-${Date.now()}`;
          state = recordObservedTaskCall(state, { childId, generation: state.generation });
          // audit taxonomy fragment is persisted as a lightweight advisory event (truncated)
          const requestedPreview = taskPreview;
          void agent; void effort;
          persistEvent(
            buildAuditEvent({
              eventId: makeEventId(new Date().toISOString()),
              timestamp: new Date().toISOString(),
              sessionId,
              generation: state.generation,
              parentAgentId: null,
              eventType: "tool_call_observed",
              decision: null,
              resolvedRoute: null,
              relativeCostTier: null,
              costComparison: null,
              result: "partial",
              sourceGaps: state.sourceGaps,
              restoreResult: null,
              stateSnapshot: state,
              requested: { taskPreview: requestedPreview, agent, effort },
            } as unknown as Parameters<typeof buildAuditEvent>[0]),
          );
        });
      });
    } catch {
      // fail-open: observation not available
    }
    try {
      (pi as unknown as { on: (e: string, h: (ev: unknown, ctx: ExtensionContext) => void) => void }).on("tool_result", (ev: unknown, _ctx: ExtensionContext) => {
        tryObserve("tool_result", () => {
          const e = ev as Record<string, unknown>;
          if (e.toolName !== "task" && e.name !== "task") return;
          const toolCallId = typeof e["toolCallId"] === "string" ? String(e["toolCallId"]) : null;
          if (toolCallId) state = recordObservedTaskResult(state, toolCallId);
          // late result handling: if generation changed, add tombstone instead
          const details = e["details"] as unknown;
          const preview = JSON.stringify(details ?? e["result"] ?? "").slice(0, 200);
          // If child was from prior generation, it becomes tombstone
          const isStale = toolCallId ? !state.ownedChildRuns.some((c) => c.childAgentId === toolCallId) : false;
          if (isStale) {
            state = addDetachedTombstone(state, {
              childId: toolCallId ?? `tomb-${Date.now()}`,
              parentToolCallId: toolCallId,
              sessionFile: null,
              status: "completed",
              resolvedModel: null,
              preview,
            });
          }
          persistEvent(
            buildAuditEvent({
              eventId: makeEventId(new Date().toISOString()),
              timestamp: new Date().toISOString(),
              sessionId,
              generation: state.generation,
              parentAgentId: null,
              eventType: "tool_result_observed",
              decision: null,
              resolvedRoute: null,
              relativeCostTier: null,
              costComparison: null,
              result: "partial",
              sourceGaps: state.sourceGaps,
              restoreResult: null,
              stateSnapshot: state,
            } as unknown as Parameters<typeof buildAuditEvent>[0]),
          );
        });
      });
    } catch {
      // fail-open
    }
  }

  if (maybeOn.events && typeof maybeOn.events.on === "function") {
    for (const evName of ["task:subagent:lifecycle", "task:subagent:progress", "task:subagent:event"]) {
      try {
        maybeOn.events.on(evName, (ev: unknown) => {
          tryObserve(evName, () => {
            const e = ev as Record<string, unknown>;
            const childId = typeof e["childId"] === "string" ? String(e["childId"]) : typeof e["agentId"] === "string" ? String(e["agentId"]) : null;
            const resolvedModel = typeof e["resolvedModel"] === "string" ? String(e["resolvedModel"]) : null;
            if (childId && resolvedModel) {
              // advisory annotation: observedMax
              void resolvedModel;
            }
            persistEvent(
              buildAuditEvent({
                eventId: makeEventId(new Date().toISOString()),
                timestamp: new Date().toISOString(),
                sessionId,
                generation: state.generation,
                parentAgentId: null,
                eventType: evName.split(":").join("_") + "_observed",
                decision: null,
                resolvedRoute: null,
                relativeCostTier: null,
                costComparison: null,
                result: "partial",
                sourceGaps: state.sourceGaps,
                restoreResult: null,
                stateSnapshot: state,
                observed: { resolvedModel },
              } as unknown as Parameters<typeof buildAuditEvent>[0]),
            );
          });
        });
      } catch {
        // fail-open
      }
    }
  }

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
    if (event.willContinue) return;
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

  pi.on("after_provider_response", (_event: AfterProviderResponseEvent) => {
    providerCalls += 1;
    if (!state.enabledAtStart) return;
    const providerEvent = makeWiringAuditEvent("provider_response", "partial");
    persistEvent({
      ...providerEvent,
      sourceGaps: [...providerEvent.sourceGaps, "priceTelemetry/routing actual not exposed"],
    });
  });

  const v = validateConfig(config);
  if (!v.ok) {
    pi.logger.warn("WEConverge: install config invalid", { errors: v.errors });
  }
}
