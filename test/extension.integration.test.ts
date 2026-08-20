// WEConverge OMP Extension wiring integration acceptance —
// AC-001/002/003/006/016/026/028/029/031/039/041 on the real src/extension.ts wiring.
// In-process fake ExtensionAPI: no real OMP, no network, no paid model.
// Run: node --experimental-strip-types --loader ./scripts/node-ts-loader.mjs test/extension.integration.test.ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import weconvergeExtension from "../src/extension";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  ExtensionHandler,
  RegisteredCommandOptions,
  ThinkingLevel,
  ToolDefinition,
} from "@oh-my-pi/pi-coding-agent";
import { buildAuditEvent, createInitialState, isValidAuditEvent, automaticActionBlockReason, POLICY_BLOCK, countPolicyTokens, POLICY_TOKEN_BUDGET } from "../src/core";
import type { ConvergenceDecisionV1, EvidenceRefV1, SessionStateV1, StatusView } from "../src/core";

const TEST_FILE = fileURLToPath(import.meta.url);

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(name);
    console.error("  FAIL:", name);
  }
}
function eq(name: string, a: unknown, b: unknown) {
  ok(`${name} (eq ${JSON.stringify(a)} === ${JSON.stringify(b)})`, a === b);
}

function deepEq(name: string, a: unknown, b: unknown) {
  ok(name, deepEqual(a, b));
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const aKeys = Object.keys(a);
  const bRecord = b as Record<string, unknown>;
  return aKeys.length === Object.keys(bRecord).length && aKeys.every((key) => key in bRecord && deepEqual((a as Record<string, unknown>)[key], bRecord[key]));
}

// ---------- fake ExtensionAPI + fake session dir harness ----------

interface FakeExtensionApi extends ExtensionAPI {
  entries: Array<{ customType: string; data: unknown }>;
  notifications: string[];
  warnings: string[];
  tools: Record<string, ToolDefinition>;
  commands: Record<string, RegisteredCommandOptions>;
  handlers: Record<string, ExtensionHandler<any, any>>;
  state: { thinkingLevel: ThinkingLevel };
  flags: { throwOnAppend: boolean; thinkingLevelReadback: ThinkingLevel | null; failSetThinkingLevel: boolean };
}

interface Harness {
  pi: FakeExtensionApi;
  ctx: ExtensionContext;
  cmdCtx: ExtensionCommandContext;
  root: string;
  settingsFile: string;
}

function makeHarness(): Harness {
  const root = mkdtempSync(join(tmpdir(), "weconverge-it-"));
  const sessionId = "s1";
  const sessionDir = join(root, "sessions", sessionId);
  mkdirSync(sessionDir, { recursive: true });
  const cwd = join(root, "project");
  mkdirSync(cwd, { recursive: true });
  const settingsFile = join(root, "weconverge", "settings.json");

  const entries: Array<{ customType: string; data: unknown }> = [];
  const notifications: string[] = [];
  const warnings: string[] = [];
  const tools: Record<string, ToolDefinition> = {};
  const commands: Record<string, RegisteredCommandOptions> = {};
  const handlers: Record<string, ExtensionHandler<any, any>> = {};
  const state = { thinkingLevel: "medium" as ThinkingLevel };
  const flags = { throwOnAppend: false, thinkingLevelReadback: null as ThinkingLevel | null, failSetThinkingLevel: false };

  const zodShim = {
    object: () => zodShim,
    string: () => zodShim,
    number: () => zodShim,
    boolean: () => zodShim,
    array: () => zodShim,
    optional: () => zodShim,
    passthrough: () => zodShim,
  } as unknown as ExtensionAPI["zod"];

  const sessionManager = {
    getCwd: () => cwd,
    getSessionDir: () => sessionDir,
    getSessionId: () => sessionId,
    getSessionFile: () => join(sessionDir, "session.jsonl"),
    getSessionName: () => sessionId,
    getEntry: () => undefined,
    getLeafId: () => null,
    getBranch: () => entries.map((entry) => ({ type: "custom", customType: entry.customType, data: entry.data })) as never,
    getEntries: () => [],
  };

  const model = { id: "main" };
  const ctx: ExtensionContext = {
    ui: {
      notify: (message: string) => {
        notifications.push(message);
      },
      confirm: async () => true,
    },
    hasUI: true,
    cwd,
    sessionManager,
    model,
    models: {
      list: () => [model],
      current: () => model,
      resolve: () => model,
      family: () => "main",
    },
    isIdle: () => true,
    abort: () => {},
    getSystemPrompt: () => [],
  };
  const cmdCtx: ExtensionCommandContext = {
    ...ctx,
    waitForIdle: async () => {},
    newSession: async () => ({ cancelled: false }),
  };

  const pi: FakeExtensionApi = {
    zod: zodShim,
    logger: {
      info: () => {},
      warn: (message: string) => {
        warnings.push(message);
      },
      error: () => {},
    },
    on: (event: string, handler: ExtensionHandler<any, any>) => {
      handlers[event] = handler;
    },
    registerTool: <T = unknown>(tool: ToolDefinition<T>) => {
      tools[tool.name] = tool as ToolDefinition;
    },
    registerCommand: (name: string, options: RegisteredCommandOptions) => {
      commands[name] = options;
    },
    appendEntry: <T = unknown>(customType: string, data?: T) => {
      if (flags.throwOnAppend) throw new Error("appendEntry failed (test)");
      entries.push({ customType, data });
    },
    getThinkingLevel: () => flags.thinkingLevelReadback ?? state.thinkingLevel,
    setThinkingLevel: (level: ThinkingLevel) => {
      if (flags.failSetThinkingLevel) throw new Error("setThinkingLevel failed (test)");
      state.thinkingLevel = level;
    },
    sendUserMessage: () => {},
    entries,
    notifications,
    warnings,
    tools,
    commands,
    handlers,
    state,
    flags,
  };

  weconvergeExtension(pi);
  return { pi, ctx, cmdCtx, root, settingsFile };
}

function cleanup(h: Harness): void {
  try {
    rmSync(h.root, { recursive: true, force: true });
  } catch {
    // best-effort temp cleanup
  }
}

async function runCommand(h: Harness, args: string): Promise<void> {
  const cmd = h.pi.commands["weconverge"];
  if (!cmd) throw new Error("weconverge command not registered");
  await cmd.handler(args, h.cmdCtx);
}

async function fire(h: Harness, eventType: string, payload: unknown): Promise<unknown> {
  const handler = h.pi.handlers[eventType];
  if (!handler) throw new Error(`no registered handler for ${eventType}`);
  return handler(payload as never, h.ctx);
}

async function callTool(h: Harness, params: unknown): Promise<Record<string, unknown>> {
  const tool = h.pi.tools["weconverge_decide"];
  if (!tool) throw new Error("weconverge_decide not registered");
  const res = await tool.execute("call-1", params as never, new AbortController().signal, undefined, h.ctx);
  return JSON.parse(res.content[0].text) as Record<string, unknown>;
}

async function getStatus(h: Harness): Promise<StatusView> {
  await runCommand(h, "status");
  const msg = h.pi.notifications[h.pi.notifications.length - 1];
  if (!msg) throw new Error("no status notification");
  return JSON.parse(msg.replace(/^WEConverge status: /, "")) as StatusView;
}

function auditEvents(h: Harness): Array<{ eventType: string; action: string | null; result: string }> {
  const out: Array<{ eventType: string; action: string | null; result: string }> = [];
  for (const e of h.pi.entries) {
    if (e.customType !== "weconverge_audit" || !e.data || typeof e.data !== "object") continue;
    const d = e.data as Record<string, unknown>;
    if (typeof d.eventType !== "string") continue;
    out.push({
      eventType: d.eventType,
      action: typeof d.action === "string" ? d.action : null,
      result: typeof d.result === "string" ? d.result : "",
    });
  }
  return out;
}

function lastStateEntry(h: Harness): Record<string, unknown> {
  const states = h.pi.entries.filter((e) => e.customType === "weconverge_state");
  const last = states[states.length - 1];
  if (!last || !last.data || typeof last.data !== "object") throw new Error("no persisted state entry");
  return last.data as Record<string, unknown>;
}

/** Latest audited real-restore event (wiring writes kind:"restore" via appendEntry). */
function lastRestoreEvent(h: Harness): Record<string, unknown> | undefined {
  for (let i = h.pi.entries.length - 1; i >= 0; i--) {
    const e = h.pi.entries[i];
    if (e.customType !== "weconverge_audit" || !e.data || typeof e.data !== "object") continue;
    const d = e.data as Record<string, unknown>;
    if (d.eventType === "restore") return d;
  }
  return undefined;
}

// ---------- fixtures ----------
let decCounter = 0;
function decision(over: Record<string, unknown> = {}): ConvergenceDecisionV1 {
  decCounter += 1;
  return {
    version: 1,
    decisionId: `d-${decCounter}`,
    action: "continue_current",
    difficultyType: "alternative_ready",
    obstacle: "obstacle",
    evidenceRefs: ["e1"],
    expectedNewInformation: "new info",
    successCriterion: "criterion",
    ...over,
  } as unknown as ConvergenceDecisionV1;
}

function evidence(id = "e1", over: Partial<EvidenceRefV1> = {}): EvidenceRefV1 {
  return {
    id,
    kind: "tool_result",
    summary: "verified attempt",
    observedAt: "2026-08-20T00:00:00Z",
    sourceId: `src-${id}`,
    integrity: "confirmed",
    ...over,
  };
}

function raiseDecision(evidenceId = "e1"): Record<string, unknown> {
  return {
    action: "raise_effort",
    difficultyType: "reasoning_depth_insufficient",
    evidenceRefs: [evidenceId],
  };
}

// =================== AC-001: load disabled ===================
{
  const h = makeHarness();
  try {
    ok("AC-001 no settings file at load", !existsSync(h.settingsFile));
    await fire(h, "session_start", { type: "session_start" });
    ok("AC-001 no settings file after session_start", !existsSync(h.settingsFile));
    const r = await fire(h, "before_agent_start", { type: "before_agent_start", prompt: "p", systemPrompt: ["base"] });
    ok("AC-001 disabled: no policy injected", r === undefined);
    const res = await callTool(h, { decision: decision(), evidences: [evidence()] });
    ok("AC-001 disabled: decision rejected", res.status === "rejected");
    ok("AC-001 disabled: no child created", Array.isArray(res.createdChildIds) && res.createdChildIds.length === 0);
    eq("AC-001 disabled: thinking level untouched", h.pi.state.thinkingLevel, "medium");
  } finally {
    cleanup(h);
  }
}

// =================== AC-002/026/028/029: commands ===================
{
  const h = makeHarness();
  try {
    await fire(h, "session_start", { type: "session_start" });
    ok("AC-002 settings file absent before on", !existsSync(h.settingsFile));

    await runCommand(h, "on");
    ok("AC-002 on writes settings file", existsSync(h.settingsFile));
    const saved = JSON.parse(readFileSync(h.settingsFile, "utf8")) as { schemaVersion: number; enabled: boolean };
    ok("AC-002 on persists enabled=true", saved.schemaVersion === 1 && saved.enabled === true);
    const stOn = await getStatus(h);
    ok("AC-002 on baseline read back from real thinking level", stOn.baselineEffort === "medium" && stOn.actualEffort === "medium" && stOn.enabled === true);
    // Illegal arity is usage-only: no state, settings, audit, or notification mutation beyond usage.
    for (const illegal of ["on extra", "off extra", "reset extra"]) {
      const entriesBeforeIllegal = h.pi.entries.length;
      const settingsBeforeIllegal = readFileSync(h.settingsFile, "utf8");
      const stateBeforeIllegal = JSON.stringify(lastStateEntry(h));
      const notificationsBeforeIllegal = h.pi.notifications.length;
      await runCommand(h, illegal);
      ok(`AC-029 ${illegal} shows usage`, h.pi.notifications.length === notificationsBeforeIllegal + 1 && h.pi.notifications[h.pi.notifications.length - 1]?.includes("usage:") === true);
      eq(`AC-029 ${illegal} leaves entries unchanged`, h.pi.entries.length, entriesBeforeIllegal);
      eq(`AC-029 ${illegal} leaves settings unchanged`, readFileSync(h.settingsFile, "utf8"), settingsBeforeIllegal);
      eq(`AC-029 ${illegal} leaves state unchanged`, JSON.stringify(lastStateEntry(h)), stateBeforeIllegal);
    }


    await runCommand(h, "reset");
    const stReset = await getStatus(h);
    ok("AC-029 reset accepted and stays enabled", stReset.enabled === true && stReset.phase === "baseline");

    const entriesBefore = h.pi.entries.length;
    await runCommand(h, "status");
    eq("AC-028 status strictly read-only (appendEntry count unchanged)", h.pi.entries.length, entriesBefore);
    const stLive = await getStatus(h);
    ok("AC-028 status shows live actual readback", stLive.actualModel === "main" && stLive.actualEffort === "medium");

    await runCommand(h, "off");
    ok("AC-002 off persists enabled=false", JSON.parse(readFileSync(h.settingsFile, "utf8")).enabled === false);
    const stOff = await getStatus(h);
    ok("AC-002 off disables phase", stOff.enabled === false && stOff.phase === "disabled");

    const notifBefore = h.pi.notifications.length;
    await runCommand(h, "bogus");
    ok("AC-029 unknown command shows usage without crash", h.pi.notifications.length > notifBefore);
  } finally {
    cleanup(h);
  }
}

// =================== AC-003: policy injection (bounded, generation-scoped) ===================
{
  const h = makeHarness();
  try {
    await fire(h, "session_start", { type: "session_start" });
    await runCommand(h, "on");
    const r = await fire(h, "before_agent_start", { type: "before_agent_start", prompt: "p", systemPrompt: ["base"] });
    const spRaw = r !== undefined && typeof r === "object" && r !== null && "systemPrompt" in (r as Record<string, unknown>) ? (r as Record<string, unknown>).systemPrompt : null;
    ok("AC-003 enabled: policy object returned", Array.isArray(spRaw) && (spRaw as unknown[]).length === 2);
    const sp = Array.isArray(spRaw) ? (spRaw as string[]) : [];
    ok("AC-003 enabled: last element is exactly POLICY_BLOCK", Array.isArray(spRaw) && sp[sp.length - 1] === POLICY_BLOCK);
    ok("AC-003 enabled: preserves incoming systemPrompt", Array.isArray(spRaw) && sp[0] === "base" && sp.length === 2);
    ok("AC-003 enabled: token budget ≤60", countPolicyTokens(POLICY_BLOCK) <= POLICY_TOKEN_BUDGET);
  } finally {
    cleanup(h);
  }
}
// =================== AC-A18: deterministic official-hook handoff (no Provider readback) ===================
{
  const h = makeHarness();
  try {
    await fire(h, "session_start", { type: "session_start" });
    // Disabled returns no WEConverge policy
    {
      const rDisabled = await fire(h, "before_agent_start", { type: "before_agent_start", prompt: "p", systemPrompt: ["base"] });
      ok("AC-A18 disabled returns no policy (undefined)", rDisabled === undefined);
      const isPolicyLeaked = rDisabled !== undefined && typeof rDisabled === "object" && rDisabled !== null && "systemPrompt" in (rDisabled as Record<string, unknown>) && Array.isArray((rDisabled as Record<string, unknown>).systemPrompt) && ((rDisabled as Record<string, unknown>).systemPrompt as string[]).includes(POLICY_BLOCK);
      ok("AC-A18 disabled does not leak POLICY_BLOCK", !isPolicyLeaked);
    }
    await runCommand(h, "on");
    const base = ["base-system"];
    const entriesBeforeFirst = h.pi.entries.length;
    const auditBeforeFirst = auditEvents(h).length;
    const r1 = await fire(h, "before_agent_start", { type: "before_agent_start", prompt: "p1", systemPrompt: [...base] });
    const sp1 = r1 !== undefined && typeof r1 === "object" && r1 !== null && "systemPrompt" in (r1 as Record<string, unknown>) ? (r1 as Record<string, unknown>).systemPrompt as unknown : null;
    ok("AC-A18 enabled returns policy object with appended POLICY_BLOCK", Array.isArray(sp1) && (sp1 as string[]).length === base.length + 1);
    ok("AC-A18 enabled returns exactly POLICY_BLOCK", Array.isArray(sp1) && (sp1 as string[])[(sp1 as string[]).length - 1] === POLICY_BLOCK);
    ok("AC-A18 enabled preserves incoming systemPrompt content", Array.isArray(sp1) && (sp1 as string[])[0] === base[0]);
    ok("AC-A18 token count ≤60", countPolicyTokens(POLICY_BLOCK) <= POLICY_TOKEN_BUDGET && countPolicyTokens((Array.isArray(sp1) ? (sp1 as string[])[(sp1 as string[]).length - 1] : POLICY_BLOCK) as string) <= POLICY_TOKEN_BUDGET);
    ok("AC-A18 deterministic: repeated token count identical", countPolicyTokens(POLICY_BLOCK) === countPolicyTokens(POLICY_BLOCK));
    // No Provider/tool dispatch occurs on handler invocation
    ok("AC-A18 no Provider dispatch: no new audit entries for provider_response", auditEvents(h).length === auditBeforeFirst || !auditEvents(h).slice(auditBeforeFirst).some((e) => e.eventType === "provider_response"));
    ok("AC-A18 no tool dispatch: entries unchanged except ownership check", h.pi.entries.length === entriesBeforeFirst);
    // Same generation reuses identical content/fingerprint without new variant
    const firstBlock = Array.isArray(sp1) ? (sp1 as string[])[(sp1 as string[]).length - 1] : null;
    const entriesBeforeSecond = h.pi.entries.length;
    const r2 = await fire(h, "before_agent_start", { type: "before_agent_start", prompt: "p2", systemPrompt: [...base] });
    ok("AC-A18 same generation does not duplicate policy (returns undefined)", r2 === undefined);
    ok("AC-A18 same generation no new audit variant", h.pi.entries.length === entriesBeforeSecond);
    ok("AC-A18 fingerprint stable: first block equals POLICY_BLOCK", firstBlock === POLICY_BLOCK);
    // New generation after reset reuses identical POLICY_BLOCK (not a new variant) — advisory reset keeps same generation, so no reinjection
    await runCommand(h, "reset");
    const stAfterReset = await getStatus(h);
    ok("AC-A18 reset keeps enabled and generation stable (advisory reset does not bump generation)", stAfterReset.enabled === true && stAfterReset.generation === 1);
    const r3 = await fire(h, "before_agent_start", { type: "before_agent_start", prompt: "p3", systemPrompt: [...base] });
    ok("AC-A18 same generation after reset does not reinject (policy already injected for this generation)", r3 === undefined);
    ok("AC-A18 fingerprint stable after reset: no new variant, first block still POLICY_BLOCK", firstBlock === POLICY_BLOCK && r3 === undefined);
    // Disabled after off returns no policy again
    await runCommand(h, "off");
    const rDisabled2 = await fire(h, "before_agent_start", { type: "before_agent_start", prompt: "p4", systemPrompt: [...base] });
    ok("AC-A18 disabled after off returns no policy", rDisabled2 === undefined);
  } finally {
    cleanup(h);
  }
}

// =================== AC-041: injection failure degrades, never throws ===================
{
  const h = makeHarness();
  try {
    await fire(h, "session_start", { type: "session_start" });
    await runCommand(h, "on");
    let threw = false;
    let r: unknown;
    try {
      r = await fire(h, "before_agent_start", { type: "before_agent_start", prompt: "p", systemPrompt: null });
    } catch {
      threw = true;
    }
    ok("AC-041 null systemPrompt does not throw", !threw && r === undefined);
    const st = await getStatus(h);
    ok("AC-041 injection failure degrades health", st.health === "degraded");
    ok("AC-041 degraded warning logged", h.pi.warnings.some((w) => w.includes("degraded")));
  } finally {
    cleanup(h);
  }
}

// =================== AC-031: tool audit path ===================
{
  const h = makeHarness();
  try {
    await fire(h, "session_start", { type: "session_start" });
    await runCommand(h, "on");
    const firstDecision = decision();
    const res = await callTool(h, { decision: firstDecision, evidences: [evidence()] });
    ok("AC-031 auditEventId returned", typeof res.auditEventId === "string" && String(res.auditEventId).startsWith("wev-"));
    const seq = auditEvents(h).map((e) => e.eventType);
    eq("AC-031 audit sequence ordered", seq.join(">"), "session_start>command_on>decision_received>decision_validated>action_terminal");
    const terminal = auditEvents(h).filter((e) => e.eventType === "action_terminal");
    ok(
      "AC-031 terminal audit action confirmed",
      terminal.length === 1 && terminal[0].action === "continue_current" && terminal[0].result === "confirmed",
    );
    const entriesBeforeDuplicate = h.pi.entries.length;
    const duplicate = await callTool(h, { decision: firstDecision, evidences: [evidence()] });
    ok("F-04 duplicate returns original audit id", duplicate.auditEventId === res.auditEventId);
    ok("F-04 duplicate does not append state or audit", h.pi.entries.length === entriesBeforeDuplicate);
  } finally {
    const persistedAudits = h.pi.entries.filter((entry) => entry.customType === "weconverge_audit");
    ok("F-01 extension wiring emits only AuditEventV1", persistedAudits.length > 0 && persistedAudits.every((entry) => isValidAuditEvent(entry.data)));
    cleanup(h);
  }
}

// =================== AC-031: appendEntry failure ===================
{
  const h = makeHarness();
  try {
    await fire(h, "session_start", { type: "session_start" });
    await runCommand(h, "on");
    h.pi.flags.throwOnAppend = true;
    const firstDecision = decision({ decisionId: "append-failure-duplicate" });
    const first = await callTool(h, { decision: firstDecision, evidences: [evidence()] });
    ok("R-01 append failure first result remains complete", first.status === "accepted" && typeof first.auditEventId === "string");
    const entriesAfterFirst = h.pi.entries.length;
    const retry = await callTool(h, { decision: firstDecision, evidences: [evidence()] });
    ok("R-01 duplicate after append failure keeps original result", retry.status === first.status && retry.auditEventId === first.auditEventId);
    ok("R-01 duplicate after append failure preserves stored result state", deepEqual(retry.state, first.state));
    eq("R-01 duplicate after append failure has no new entries", h.pi.entries.length, entriesAfterFirst);
    eq("R-01 duplicate after append failure has no decision side effect", h.pi.state.thinkingLevel, "medium");
    const status = await getStatus(h);
    ok("R-01 degraded fuse remains active after duplicate", status.health === "degraded");
  } finally {
    cleanup(h);
  }
}
// =================== R-06: old exact retries preserve later safety state ===================
{
  const h = makeHarness();
  try {
    await fire(h, "session_start", { type: "session_start" });
    await runCommand(h, "on");
    const oldDecision = decision({ decisionId: "old-before-source-gap" });
    const first = await callTool(h, { decision: oldDecision, evidences: [evidence()] });
    ok("R-06 source-gap setup accepted", first.status === "accepted");
    const later = await callTool(h, {
      decision: decision({
        decisionId: "later-source-gap",
        action: "report_source_gap",
        difficultyType: "source_missing",
        sourceGap: { missingFact: "missing-permission", requiredSource: "OMP readback", impact: "cannot continue" },
      }),
      evidences: [evidence()],
    });
    ok("R-06 source-gap state reported", later.status === "source_gap");
    const entriesBeforeRetry = h.pi.entries.length;
    const auditCountBeforeRetry = auditEvents(h).length;
    const actionStateBeforeRetry = h.pi.state.thinkingLevel;
    const retry = await callTool(h, { decision: oldDecision, evidences: [evidence()] });
    deepEq("R-06 source-gap retry exactly repeats complete first response", retry, first);
    ok("R-06 source-gap retry keeps original result", retry.status === first.status && retry.auditEventId === first.auditEventId && retry.decisionId === first.decisionId);
    eq("R-06 source-gap retry does not append", h.pi.entries.length, entriesBeforeRetry);
    eq("R-06 source-gap retry does not audit", auditEvents(h).length, auditCountBeforeRetry);
    eq("R-06 source-gap retry does not act", h.pi.state.thinkingLevel, actionStateBeforeRetry);
    const live = await getStatus(h);
    ok("R-06 source-gap retry preserves phase and gap", live.phase === "source_gap" && live.sourceGaps.includes("missing-permission"));
    ok("R-06 source-gap retry preserves automatic fuse — RETIRED/advisory: no automatic block (pure advisory)", automaticActionBlockReason(lastStateEntry(h) as unknown as SessionStateV1) === null);
  } finally {
    cleanup(h);
  }
}
{
  const h = makeHarness();
  try {
    await fire(h, "session_start", { type: "session_start" });
    await runCommand(h, "on");
    const oldDecision = decision({ decisionId: "old-before-blocked" });
    const first = await callTool(h, { decision: oldDecision, evidences: [evidence()] });
    ok("R-06 blocked setup accepted", first.status === "accepted");
    const later = await callTool(h, {
      decision: decision({
        decisionId: "later-blocked",
        action: "report_blocked",
        difficultyType: "proven_blocker",
        noSafeAlternativeReason: "no safe route remains",
      }),
      evidences: [evidence()],
    });
    ok("R-06 blocked state reported", later.status === "blocked");
    const entriesBeforeRetry = h.pi.entries.length;
    const auditCountBeforeRetry = auditEvents(h).length;
    const actionStateBeforeRetry = h.pi.state.thinkingLevel;
    const retry = await callTool(h, { decision: oldDecision, evidences: [evidence()] });
    deepEq("R-06 blocked retry exactly repeats complete first response", retry, first);
    ok("R-06 blocked retry keeps original result", retry.status === first.status && retry.auditEventId === first.auditEventId && retry.decisionId === first.decisionId);
    eq("R-06 blocked retry does not append", h.pi.entries.length, entriesBeforeRetry);
    eq("R-06 blocked retry does not audit", auditEvents(h).length, auditCountBeforeRetry);
    eq("R-06 blocked retry does not act", h.pi.state.thinkingLevel, actionStateBeforeRetry);
    const live = await getStatus(h);
    const liveState = lastStateEntry(h);
    ok("R-06 blocked retry preserves phase and reason", live.phase === "blocked" && liveState.phase === "blocked" && liveState.blockedReason === "no safe route remains");
    ok("R-06 blocked retry preserves automatic fuse — RETIRED/advisory: no automatic block (pure advisory)", automaticActionBlockReason(lastStateEntry(h) as unknown as SessionStateV1) === null);
  } finally {
    cleanup(h);
  }
}
// =================== AC-016/026: effort lifecycle ===================
{
  const h = makeHarness();
  try {
    await fire(h, "session_start", { type: "session_start" });
    await runCommand(h, "on");
    eq("AC-016 baseline thinking level medium", h.pi.state.thinkingLevel, "medium");
    const res = await callTool(h, { decision: decision(raiseDecision()), evidences: [evidence()] });
    ok("AC-016 raise_effort accepted via wiring", res.status === "accepted");
    eq("AC-016 real thinking level raised to high", h.pi.state.thinkingLevel, "high");
    const raisedState = lastStateEntry(h);
    ok("AC-016 state owns effort", raisedState.effortOwnedByExtension === true && raisedState.currentEffort === "high");
    const seq = auditEvents(h).map((e) => e.eventType);
    ok(
      "AC-016 raise audit includes action_started before terminal",
      seq.join(">") === "session_start>command_on>decision_received>decision_validated>action_started>action_terminal",
    );

    await runCommand(h, "off");
    eq("AC-026 off restores real thinking level to baseline", h.pi.state.thinkingLevel, "medium");
    const st = await getStatus(h);
    ok("AC-026 off releases effort ownership", st.effortOwner === "external/none" && st.health === "ok");
    const restoreEvt = lastRestoreEvent(h);
    ok(
      "AC-026 off real restore audited as restored",
      restoreEvt?.eventType === "restore" && restoreEvt?.restoreResult === "restored",
    );
  } finally {
    cleanup(h);
  }
}

// =================== AC-039: switch lifecycle + shutdown ===================
{
  const h = makeHarness();
  try {
    await fire(h, "session_start", { type: "session_start" });
    await runCommand(h, "on");
    await callTool(h, { decision: decision(raiseDecision("e1")), evidences: [evidence("e1")] });
    await callTool(h, {
      decision: decision({ evidenceRefs: ["e2"], selectedDirectionId: "dirA", alternativeDirectionIds: ["dirB"] }),
      evidences: [evidence("e2")],
    });

    await fire(h, "session_before_switch", { type: "session_before_switch", reason: "new", targetSessionFile: undefined });
    eq("AC-039 session_before_switch restores owned effort", h.pi.state.thinkingLevel, "medium");

    await fire(h, "session_switch", { type: "session_switch", reason: "new", previousSessionFile: undefined });
    const st = await getStatus(h);
    eq("AC-039 session_switch increments generation", st.generation, 2);
    const switched = lastStateEntry(h);
    ok(
      "AC-039 session_switch clears evidence/directions",
      Array.isArray(switched.evidence) &&
        switched.evidence.length === 0 &&
        switched.selectedDirection === null &&
        Array.isArray(switched.alternativeDirectionIds) &&
        switched.alternativeDirectionIds.length === 0,
    );

    await callTool(h, { decision: decision(raiseDecision("e3")), evidences: [evidence("e3")] });
    eq("AC-039 pre-shutdown owned high", h.pi.state.thinkingLevel, "high");
    await fire(h, "session_shutdown", { type: "session_shutdown" });
    eq("AC-039 session_shutdown restores owned effort", h.pi.state.thinkingLevel, "medium");
    const shutdownState = lastStateEntry(h);
    ok(
      "AC-039 session_shutdown persists restored state",
      shutdownState.restoreState === "restored" && shutdownState.effortOwnedByExtension === false,
    );
  } finally {
    cleanup(h);
  }
}

// =================== R-04: failed real restore remains fail-closed ===================
{
  const h = makeHarness();
  try {
    await fire(h, "session_start", { type: "session_start" });
    await runCommand(h, "on");
    const raised = await callTool(h, { decision: decision(raiseDecision("e1")), evidences: [evidence("e1")] });
    ok("R-04 setup owns raised effort", raised.status === "accepted" && h.pi.state.thinkingLevel === "high");
    const beforeFailure = lastStateEntry(h);
    h.pi.flags.thinkingLevelReadback = "high";

    await runCommand(h, "off");
    const failedOff = lastStateEntry(h);
    ok("R-04 off persists configured disable", JSON.parse(readFileSync(h.settingsFile, "utf8")).enabled === false);
    ok("R-04 off failed restore keeps actual and ownership", failedOff.currentEffort === "high" && failedOff.effortOwnedByExtension === true);
    ok("R-04 off failed restore preserves phase/routing health", failedOff.phase === beforeFailure.phase && failedOff.routingIntegrity === beforeFailure.routingIntegrity && failedOff.health === "degraded" && failedOff.restoreState === "failed");
    const restoreEvt = lastRestoreEvent(h);
    ok("R-04 failed restore audit is schema-valid and truthful", restoreEvt?.result === "failed" && restoreEvt.restoreResult === "failed" && isValidAuditEvent(restoreEvt));
    const restoreSnapshot = restoreEvt?.stateSnapshot as Record<string, unknown> | undefined;
    ok("R-04 failed restore snapshot preserves degraded state", restoreSnapshot?.health === "degraded" && restoreSnapshot.restoreState === "failed" && restoreSnapshot.effortOwnedByExtension === true);

    const generationBeforeReset = failedOff.generation;
    await runCommand(h, "reset");
    const failedReset = lastStateEntry(h);
    ok("R-04 reset does not establish clean state after failed restore", failedReset.generation === generationBeforeReset && failedReset.phase === beforeFailure.phase && failedReset.routingIntegrity === beforeFailure.routingIntegrity && failedReset.restoreState === "failed");

    await fire(h, "session_before_switch", { type: "session_before_switch", reason: "new", targetSessionFile: undefined });
    await fire(h, "session_switch", { type: "session_switch", reason: "new", previousSessionFile: undefined });
    const failedSwitch = lastStateEntry(h);
    ok("R-04 model switch does not fold failed restore", failedSwitch.generation === generationBeforeReset && failedSwitch.currentEffort === "high" && failedSwitch.effortOwnedByExtension === true && failedSwitch.restoreState === "failed");

    await fire(h, "session_shutdown", { type: "session_shutdown" });
    const failedShutdown = lastStateEntry(h);
    ok("R-04 task end keeps failed restore truthful", failedShutdown.currentEffort === "high" && failedShutdown.effortOwnedByExtension === true && failedShutdown.restoreState === "failed" && failedShutdown.health === "degraded");
  } finally {
    cleanup(h);
  }
}
// =================== AC-006: malformed tool input ===================
{
  const h = makeHarness();
  try {
    await fire(h, "session_start", { type: "session_start" });
    await runCommand(h, "on");
    let threw = false;
    let r1: Record<string, unknown> | undefined;
    try {
      r1 = await callTool(h, { decision: null });
    } catch {
      threw = true;
    }
    ok("AC-006 null decision rejected without throwing", !threw && r1?.status === "rejected");

    let r2: Record<string, unknown> | undefined;
    try {
      r2 = await callTool(h, { decision: { ...decision(), action: "bogus" } });
    } catch {
      threw = true;
    }
    ok("AC-006 unknown action rejected without throwing", !threw && r2?.status === "rejected");
    const childIds = r2?.createdChildIds;
    ok("AC-006 rejected result has no children", Array.isArray(childIds) && childIds.length === 0);

    let r3: Record<string, unknown> | undefined;
    try {
      r3 = await callTool(h, { decision: decision() });
    } catch {
      threw = true;
    }
    ok("AC-006 missing evidence map rejected without throwing", !threw && r3?.status === "rejected");
  } finally {
    cleanup(h);
  }
}

// =================== F-01/F-02: missing-state recovery ===================
{
  const h = makeHarness();
  try {
    const snapshot = createInitialState({ sessionId: "s1", enabledAtStart: true, baseline: { model: "main", effort: "medium" } });
    const audit = buildAuditEvent({
      eventId: "wev-recovery",
      timestamp: "2026-08-20T00:00:00Z",
      sessionId: "s1",
      generation: 1,
      parentAgentId: null,
      eventType: "action_terminal",
      decision: decision({ decisionId: "recovery" }),
      resolvedRoute: null,
      relativeCostTier: null,
      costComparison: null,
      result: "confirmed",
      sourceGaps: [],
      restoreResult: null,
      stateSnapshot: { ...snapshot, phase: "executing" },
    });
    h.pi.entries.push({ customType: "weconverge_audit", data: audit });
    await fire(h, "session_start", { type: "session_start" });
    const st = await getStatus(h);
    ok("F-01 missing state does not initialize fresh baseline", st.phase === "degraded" && st.health === "degraded" && st.routingIntegrity === "source_gap");
    const before = await fire(h, "before_agent_start", { type: "before_agent_start", prompt: "p", systemPrompt: ["base"] });
    ok("F-02 recovered source gap blocks automatic policy — RETIRED/advisory: degraded does not block official-hook policy (pure advisory)", before !== undefined && typeof before === "object" && before !== null && "systemPrompt" in (before as Record<string, unknown>) && Array.isArray((before as Record<string, unknown>).systemPrompt) && ((before as Record<string, unknown>).systemPrompt as string[]).includes(POLICY_BLOCK));
  } finally {
    cleanup(h);
  }
}

// =================== summary ===================
console.log(
  `\nWEConverge extension integration: ${passed} passed, ${failed} failed (of ${passed + failed}) — ${TEST_FILE}`,
);
if (failed > 0) {
  console.error("Failing:", failures.join("; "));
  process.exit(1);
}
console.log("ALL EXTENSION INTEGRATION CHECKS PASSED");
