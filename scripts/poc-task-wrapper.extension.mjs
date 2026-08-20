/**
 * POC Task Wrapper — isolated Extension-only experiment for WEConverge
 * - Exact-name `task` wrapper delegating only via same-name ctx.invokeTool
 * - Bounded evidence capture, no private payload logging
 * - Captures parent tool_call/tool_result + native task:subagent:lifecycle/progress/event
 * - Exercises effort "lo" only, records requested vs observed route
 * - Tests weconverge_decide -> wrapper automatic invocation boundary
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const EVIDENCE_FILE = process.env.POC_EVIDENCE_FILE || "J:/tmp/weconverge-poc-evidence.jsonl";
const TOOL_TRUNCATE = 200;

function ensureDir(file) {
  try { mkdirSync(dirname(file), { recursive: true }); } catch {}
}

function truncate(s, n = TOOL_TRUNCATE) {
  if (typeof s !== "string") return String(s ?? "");
  if (s.length <= n) return s;
  return s.slice(0, n) + "…[" + (s.length - n) + " more]";
}

function safeAppend(obj) {
  try {
    ensureDir(EVIDENCE_FILE);
    appendFileSync(EVIDENCE_FILE, JSON.stringify({ ts: new Date().toISOString(), ...obj }) + "\n", "utf8");
  } catch {}
}

export default function pocTaskWrapper(pi) {
  let wrapperInvocations = 0;
  let lastRequested = null;
  let lastObserved = null;

  // --- bounded event capture ---
  const events = [];

  function record(type, payload) {
    const entry = { type, payload };
    events.push(entry);
    if (events.length > 200) events.shift();
    safeAppend({ kind: "event", type, payload });
  }

  // parent tool_call / tool_result (public hooks)
  try {
    pi.on("tool_call", (event, ctx) => {
      try {
        const name = event?.toolName ?? event?.name ?? "unknown";
        const params = event?.params ?? event?.input ?? {};
        // sanitize: only task/agent/effort lengths, not full provider payload
        const sanitized = {
          tool: name,
          taskLen: typeof params.task === "string" ? params.task.length : undefined,
          taskPreview: typeof params.task === "string" ? truncate(params.task, 120) : undefined,
          agent: params.agent ?? null,
          effort: params.effort ?? null,
          tasksCount: Array.isArray(params.tasks) ? params.tasks.length : undefined,
        };
        record("tool_call", sanitized);
      } catch {}
      return undefined;
    });
  } catch {}

  try {
    pi.on("tool_result", (event, ctx) => {
      try {
        const name = event?.toolName ?? event?.name ?? "unknown";
        const details = event?.details ?? event?.result ?? null;
        let resolvedModel = null;
        let status = null;
        try {
          if (details && typeof details === "object") {
            // native Task SingleResult[] has resolvedModel / status
            if (Array.isArray(details)) {
              resolvedModel = details.map((r) => r.resolvedModel ?? r.modelRole ?? null).join(",");
              status = details.map((r) => r.status ?? null).join(",");
            } else if (details.results && Array.isArray(details.results)) {
              resolvedModel = details.results.map((r) => r.resolvedModel ?? null).join(",");
            } else {
              resolvedModel = details.resolvedModel ?? details.modelRole ?? null;
              status = details.status ?? null;
            }
          }
        } catch {}
        record("tool_result", { tool: name, resolvedModelPreview: truncate(String(resolvedModel ?? ""), 120), status });
      } catch {}
      return undefined;
    });
  } catch {}

  // native Task channels via pi.events
  try {
    pi.events?.on?.("task:subagent:lifecycle", (ev) => {
      try {
        const p = ev ?? {};
        record("task:subagent:lifecycle", {
          childId: p.childId ?? p.id ?? null,
          agent: p.agent ?? null,
          status: p.status ?? null,
          sessionFile: p.sessionFile ? truncate(p.sessionFile, 80) : null,
          parentToolCallId: p.parentToolCallId ?? null,
        });
      } catch {}
    });
  } catch {}
  try {
    pi.events?.on?.("task:subagent:progress", (ev) => {
      try {
        const p = ev ?? {};
        record("task:subagent:progress", {
          childId: p.childId ?? p.id ?? null,
          modelRole: p.modelRole ?? null,
          resolvedModel: p.resolvedModel ? truncate(p.resolvedModel, 120) : null,
          status: p.status ?? null,
        });
      } catch {}
    });
  } catch {}
  try {
    pi.events?.on?.("task:subagent:event", (ev) => {
      try {
        const p = ev ?? {};
        // only coarse core event type, not full provider payload
        record("task:subagent:event", {
          childId: p.childId ?? p.id ?? null,
          eventType: p.event?.type ?? p.type ?? "unknown",
        });
      } catch {}
    });
  } catch {}

  // turn_start + getThinkingLevel snapshot (parent current-session effort)
  try {
    pi.on("turn_start", (_event, ctx) => {
      try {
        const lvl = pi.getThinkingLevel?.() ?? "unknown";
        record("turn_start", { thinkingLevel: lvl });
      } catch {}
      return undefined;
    });
  } catch {}

  // observe weconverge_decide calls to test decision->wrapper boundary
  let decideCallCount = 0;
  let decideLast = null;
  try {
    pi.on("tool_call", (event) => {
      if (event?.toolName === "weconverge_decide" || event?.name === "weconverge_decide") {
        decideCallCount++;
        decideLast = { paramsPreview: truncate(JSON.stringify(event.params ?? {}), 500) };
        safeAppend({ kind: "decide_observed", count: decideCallCount, preview: decideLast.paramsPreview });
      }
      return undefined;
    });
  } catch {}

  // --- exact-name task wrapper ---
  pi.registerTool({
    name: "task",
    label: "POC Task Wrapper",
    description: "POC wrapper for native Task — delegates via same-name ctx.invokeTool only",
    parameters: pi.zod.object({
      task: pi.zod.string().optional(),
      agent: pi.zod.string().optional(),
      effort: pi.zod.string().optional(),
      context: pi.zod.string().optional(),
      tasks: pi.zod.array(pi.zod.object({
        task: pi.zod.string(),
        agent: pi.zod.string().optional(),
        effort: pi.zod.string().optional(),
      }).passthrough()).optional(),
    }).passthrough(),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      wrapperInvocations++;
      const requested = {
        taskPreview: truncate(params.task ?? (params.context ? `context:${params.context.slice(0,50)}` : ""), 120),
        taskLen: typeof params.task === "string" ? params.task.length : (params.context ? params.context.length : 0),
        agent: params.agent ?? (Array.isArray(params.tasks) ? params.tasks.map(t=>t.agent).join(",") : null),
        effort: params.effort ?? (Array.isArray(params.tasks) ? params.tasks.map(t=>t.effort).join(",") : null),
        tasksCount: Array.isArray(params.tasks) ? params.tasks.length : undefined,
      };
      lastRequested = requested;
      safeAppend({ kind: "wrapper_enter", invocation: wrapperInvocations, toolCallId, requested, hasInvokeTool: typeof ctx.invokeTool === "function" });
      record("wrapper_enter", { invocation: wrapperInvocations, requested, hasInvokeTool: typeof ctx.invokeTool === "function" });

      if (typeof ctx.invokeTool !== "function") {
        const err = "ctx.invokeTool unavailable — no native task to delegate to";
        safeAppend({ kind: "wrapper_error", invocation: wrapperInvocations, error: err });
        record("wrapper_error", { invocation: wrapperInvocations, error: err });
        return { content: [{ type: "text", text: JSON.stringify({ error: err, wrapperInvocations }) }], isError: true };
      }

      // Validate Max ban: refuse hi/max explicitly (POC safety)
      const eff = (params.effort ?? "").toLowerCase();
      if (eff === "max" || eff === "hi") {
        const err = `refused Max-risk effort "${params.effort}" in POC (only lo allowed)`;
        safeAppend({ kind: "wrapper_refused_max", invocation: wrapperInvocations, effort: params.effort });
        record("wrapper_refused_max", { invocation: wrapperInvocations, effort: params.effort });
        return { content: [{ type: "text", text: JSON.stringify({ error: err, wrapperInvocations }) }], isError: true };
      }

      // Delegate only via same-name ctx.invokeTool, inheriting signal/onUpdate
      let result;
      try {
        result = await ctx.invokeTool(params, { signal, onUpdate });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        safeAppend({ kind: "wrapper_delegate_error", invocation: wrapperInvocations, error: truncate(msg, 300) });
        record("wrapper_delegate_error", { invocation: wrapperInvocations, error: truncate(msg, 300) });
        throw e;
      }

      // Capture observed route from result details (post-call readback only, not preflight proof)
      try {
        const d = result?.details ?? result ?? {};
        let obs = null;
        if (Array.isArray(d)) {
          obs = d.map(r => ({ id: r.id, modelRole: r.modelRole, resolvedModel: r.resolvedModel, status: r.status }));
        } else if (d.results) {
          obs = d.results.map(r => ({ id: r.id, modelRole: r.modelRole, resolvedModel: r.resolvedModel, status: r.status }));
        } else if (d.resolvedModel || d.modelRole) {
          obs = { resolvedModel: d.resolvedModel, modelRole: d.modelRole, status: d.status };
        }
        lastObserved = obs;
        safeAppend({ kind: "wrapper_result", invocation: wrapperInvocations, observed: obs, contentPreview: truncate(JSON.stringify(result).slice(0,500), 500) });
        record("wrapper_result", { invocation: wrapperInvocations, observed: obs });
      } catch {}

      // Return native result unmodified (preserve native bookkeeping)
      return result;
    },
  });

  // expose stats via a hidden command for debugging (not required but useful)
  try {
    pi.registerCommand("poc-stats", {
      description: "POC stats (debug)",
      handler: async (_args, ctx) => {
        ctx.ui.notify(`POC wrapperInvocations=${wrapperInvocations} decideCalls=${decideCallCount} evidence=${EVIDENCE_FILE}`, "info");
      },
    });
  } catch {}

  safeAppend({ kind: "poc_loaded", evidenceFile: EVIDENCE_FILE, pid: process.pid });
}
