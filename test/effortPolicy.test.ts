// WEConverge configurable per-model effort ladder — AC-01..AC-13, post-set mismatch, native task Max unchanged
// Run: node --experimental-strip-types --loader ./scripts/node-ts-loader.mjs test/effortPolicy.test.ts
import type { ConfigV1, Effort, EvidenceRefV1, OmpAdapters, SessionStateV1, ConvergenceDecisionV1 } from "../src/core/index";
import { DEFAULT_CONFIG, createInitialState, weconvergeDecide, DecisionRegistry, recordObservedTaskCall } from "../src/core/index";
import { canonicalizeModelId, globMatch, validateEffortPolicies } from "../src/core/config";
import { renderStatus } from "../src/core/status";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`ok - ${name}`); } else { failed++; failures.push(name); console.log(`not ok - ${name}`); }
}
function eq(name: string, a: unknown, b: unknown) {
  ok(`${name} (eq ${JSON.stringify(a)} === ${JSON.stringify(b)})`, a === b);
}
let evCounter = 0;
function makeConfig(): ConfigV1 { return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as ConfigV1; }
function ev(id: string, observedAt?: string): EvidenceRefV1 {
  evCounter++;
  return { id, kind: "tool_result", summary: `ev ${id}`, observedAt: observedAt ?? `2026-08-21T00:00:${String(evCounter).padStart(2,"0")}Z`, sourceId: `src-${id}`, integrity: "confirmed" };
}
function baseState(enabled: boolean, baselineEffort: Effort = "medium", baselineModel: string | null = "acme/foo"): SessionStateV1 {
  return createInitialState({ sessionId: "S1", enabledAtStart: enabled, baseline: { model: baselineModel, effort: baselineEffort } });
}
function dec(over: Partial<ConvergenceDecisionV1>): ConvergenceDecisionV1 {
  return { version: 1, decisionId: `d-${++evCounter}`, action: "raise_effort", difficultyType: "reasoning_depth_insufficient", obstacle: "need deeper", evidenceRefs: ["e1"], expectedNewInformation: "new", successCriterion: "ok", ...over };
}
function statefulAdapters(initial: { model: string | null; effort: Effort } | null, opts: { setOk?: boolean; readbackMismatch?: boolean } = {}): OmpAdapters & { current: { model: string | null; effort: Effort } | null } {
  let cur: { model: string | null; effort: Effort } | null = initial ? { ...initial } : null;
  return {
    get current() { return cur; },
    resolveRole: (c) => DEFAULT_CONFIG.capabilities[c] ?? null,
    readbackActual: () => {
      if (opts.readbackMismatch && cur) {
        return null;
      }
      return cur ? { ...cur } : null;
    },
    setSessionEffort: (e) => {
      if (opts.setOk === false) return false;
      if (cur) cur = { ...cur, effort: e };
      else cur = { model: null, effort: e };
      return true;
    },
    providerCallCount: () => 0,
  };
}
function runWith(state: SessionStateV1, d: ConvergenceDecisionV1, cfg: ConfigV1, ad: OmpAdapters, refs: EvidenceRefV1[]) {
  const byId = new Map(refs.map(r => [r.id, r]));
  return weconvergeDecide({ state, decision: d, config: cfg, adapters: ad, evidenceById: byId, registry: new DecisionRegistry(), now: "2026-08-21T01:00:00Z", sessionId: "S1", parentAgentId: "P1" });
}
function raisingAdapters(model: string | null, from: Effort): OmpAdapters {
  let cur: Effort = from;
  let curModel = model;
  return {
    resolveRole: (c) => DEFAULT_CONFIG.capabilities[c] ?? null,
    readbackActual: () => ({ model: curModel, effort: cur }),
    setSessionEffort: (e) => { cur = e; return true; },
    providerCallCount: () => 0,
  };
}

// AC-01 Ordered first-match
{
  const cfg = makeConfig();
  cfg.effortPolicies = {
    rules: [
      { match: "acme/f*", automaticEfforts: ["medium", "high"] },
      { match: "acme/*o", automaticEfforts: ["high", "xhigh"] },
    ],
    default: { automaticEfforts: ["medium", "high", "xhigh"] },
  };
  ok("AC-01 validation ok", validateEffortPolicies(cfg.effortPolicies).ok === true);
  const s = baseState(true, "medium", "acme/foo");
  const ad = raisingAdapters("acme/foo", "medium");
  const r = runWith(s, dec({ evidenceRefs: ["e1"] }), cfg, ad, [ev("e1", "2026-08-21T01:00:01Z")]);
  eq("AC-01 first-match high", r.state.currentEffort, "high");
  ok("AC-01 accepted next rung", r.status === "accepted");
  const ae = r.auditEvents.find(e => e.reasonCode === "ACCEPTED_NEXT_RUNG");
  ok("AC-01 reasonCode ACCEPTED_NEXT_RUNG", !!ae);
  ok("AC-01 matchedRule acme/f*", ae?.matchedRule === "acme/f*");
}

// AC-02 fallback default
{
  const cfg = makeConfig();
  cfg.effortPolicies = {
    rules: [{ match: "acme/*", automaticEfforts: ["medium", "high"] }],
    default: { automaticEfforts: ["high", "xhigh"] },
  };
  const s = baseState(true, "high", "other/bar");
  const ad = raisingAdapters("other/bar", "high");
  const r = runWith(s, dec({ evidenceRefs: ["e1"] }), cfg, ad, [ev("e1", "2026-08-21T01:00:01Z")]);
  eq("AC-02 default xhigh", r.state.currentEffort, "xhigh");
  ok("AC-02 ACCEPTED_DEFAULT_NEXT_RUNG", r.auditEvents.some(e => e.reasonCode === "ACCEPTED_DEFAULT_NEXT_RUNG"));
}

// AC-03 case-sensitive
{
  const cfg = makeConfig();
  cfg.effortPolicies = {
    rules: [{ match: "Acme/Foo", automaticEfforts: ["medium", "high"] }],
    default: { automaticEfforts: ["medium", "high", "xhigh"] },
  };
  const s = baseState(true, "medium", "acme/foo");
  const ad = raisingAdapters("acme/foo", "medium");
  const r = runWith(s, dec({ evidenceRefs: ["e1"] }), cfg, ad, [ev("e1", "2026-08-21T01:00:01Z")]);
  eq("AC-03 fallback high", r.state.currentEffort, "high");
  ok("AC-03 matchedRule default", r.auditEvents.some(e => e.matchedRule === "default"));
}

// AC-04 suffix stripping
{
  const cfg = makeConfig();
  cfg.effortPolicies = {
    rules: [{ match: "acme/foo", automaticEfforts: ["medium", "high", "xhigh"] }],
    default: { automaticEfforts: ["medium", "high"] },
  };
  eq("canonical suffix", canonicalizeModelId("acme/foo:xhigh"), "acme/foo");
  eq("canonical no suffix", canonicalizeModelId("acme/foo"), "acme/foo");
  ok("globMatch acme/foo", globMatch("acme/foo", "acme/foo") === true);
  const s = baseState(true, "high", "acme/foo");
  const ad = raisingAdapters("acme/foo:xhigh", "high");
  const r = runWith(s, dec({ evidenceRefs: ["e1"] }), cfg, ad, [ev("e1", "2026-08-21T01:00:01Z")]);
  eq("AC-04 next xhigh", r.state.currentEffort, "xhigh");
}

// AC-05 missing block builtin
{
  const cfg = makeConfig();
  delete (cfg as unknown as Record<string, unknown>).effortPolicies;
  const s = baseState(true, "medium", "any/model");
  const ad = raisingAdapters("any/model", "medium");
  const r = runWith(s, dec({ evidenceRefs: ["e1"] }), cfg, ad, [ev("e1", "2026-08-21T01:00:01Z")]);
  eq("AC-05 builtin high", r.state.currentEffort, "high");
  const view = renderStatus(s, cfg, { model: "any/model", effort: "medium" });
  eq("AC-05 builtin-compat status", view.effortPolicyStatus, "builtin-compat");
  eq("AC-05 effective builtin", view.effective?.source, "builtin-compat");
}

// AC-06 invalid block disables
{
  const cfg = makeConfig();
  cfg.effortPolicies = {
    rules: [{ match: "", automaticEfforts: ["medium", "high"] }],
    default: { automaticEfforts: ["medium", "high"] },
  };
  ok("AC-06 validation fail", validateEffortPolicies(cfg.effortPolicies).ok === false);
  const s = baseState(true, "medium", "acme/foo");
  const ad = raisingAdapters("acme/foo", "medium");
  const r = runWith(s, dec({ evidenceRefs: ["e1"] }), cfg, ad, [ev("e1", "2026-08-21T01:00:01Z")]);
  ok("AC-06 blocked config", r.status === "blocked");
  ok("AC-06 BLOCKED_INVALID_GLOB", (r.reason ?? "").includes("BLOCKED_INVALID_GLOB") || r.auditEvents.some(e => e.reasonCode === "BLOCKED_INVALID_GLOB"));
  const view = renderStatus(s, cfg, { model: "acme/foo", effort: "medium" });
  eq("AC-06 status config_error", view.effortPolicyStatus, "config_error");
  ok("AC-06 health degraded", view.health === "degraded");
  eq("AC-06 effective null", view.effective, null);
}

// AC-07 non-consecutive jump
{
  const cfg = makeConfig();
  cfg.effortPolicies = {
    rules: [{ match: "acme/*", automaticEfforts: ["medium", "xhigh"] }],
    default: { automaticEfforts: ["medium", "high", "xhigh"] },
  };
  const s = baseState(true, "medium", "acme/bar");
  const ad = raisingAdapters("acme/bar", "medium");
  const r = runWith(s, dec({ evidenceRefs: ["e1"] }), cfg, ad, [ev("e1", "2026-08-21T01:00:01Z")]);
  eq("AC-07 jump xhigh", r.state.currentEffort, "xhigh");
}

// AC-08 max configurable
{
  const cfg = makeConfig();
  cfg.effortPolicies = {
    rules: [{ match: "acme/*", automaticEfforts: ["high", "xhigh", "max"] }],
    default: { automaticEfforts: ["medium", "high", "xhigh"] },
  };
  const s = baseState(true, "xhigh", "acme/bar");
  const ad = raisingAdapters("acme/bar", "xhigh");
  const r = runWith(s, dec({ evidenceRefs: ["e1"] }), cfg, ad, [ev("e1", "2026-08-21T01:00:01Z")]);
  eq("AC-08 max", r.state.currentEffort, "max");
  ok("AC-08 accepted", r.status === "accepted");
  const cfg2 = makeConfig();
  cfg2.effortPolicies = {
    rules: [{ match: "acme/*", automaticEfforts: ["medium", "high", "xhigh"] }],
    default: { automaticEfforts: ["medium", "high", "xhigh"] },
  };
  const s2 = baseState(true, "xhigh", "acme/bar");
  const ad2 = raisingAdapters("acme/bar", "xhigh");
  const r2 = runWith(s2, dec({ evidenceRefs: ["e1"] }), cfg2, ad2, [ev("e1", "2026-08-21T01:00:01Z")]);
  ok("AC-08 ceiling rejected", r2.status === "rejected");
  ok("AC-08 REJECTED_NO_NEXT_RUNG", r2.auditEvents.some(e => e.reasonCode === "REJECTED_NO_NEXT_RUNG"));
}

// AC-09 policy conflict
{
  const cfg = makeConfig();
  cfg.effortPolicies = {
    rules: [{ match: "acme/*", automaticEfforts: ["medium", "xhigh"] }],
    default: { automaticEfforts: ["medium", "xhigh"] },
  };
  const s = baseState(true, "high", "acme/bar");
  const ad = raisingAdapters("acme/bar", "high");
  const r = runWith(s, dec({ evidenceRefs: ["e1"] }), cfg, ad, [ev("e1", "2026-08-21T01:00:01Z")]);
  ok("AC-09 blocked conflict", r.status === "blocked");
  ok("AC-09 POLICY_CONFLICT", r.auditEvents.some(e => e.reasonCode === "POLICY_CONFLICT_CURRENT_NOT_IN_LADDER"));
  const view = renderStatus(s, cfg, { model: "acme/bar", effort: "high" });
  eq("AC-09 status policy_conflict", view.effortPolicyStatus, "policy_conflict");
}

// AC-10 source_gap model unreadable
{
  const cfg = makeConfig();
  cfg.effortPolicies = {
    rules: [{ match: "acme/*", automaticEfforts: ["medium", "high"] }],
    default: { automaticEfforts: ["medium", "high"] },
  };
  const s = baseState(true, "medium", "acme/foo");
  const ad: OmpAdapters = {
    resolveRole: (c) => DEFAULT_CONFIG.capabilities[c] ?? null,
    readbackActual: () => null,
    setSessionEffort: () => true,
    providerCallCount: () => 0,
  };
  const r = runWith(s, dec({ evidenceRefs: ["e1"] }), cfg, ad, [ev("e1", "2026-08-21T01:00:01Z")]);
  ok("AC-10 source_gap", r.status === "source_gap");
  ok("AC-10 SOURCE_GAP_MODEL", r.auditEvents.some(e => e.reasonCode === "SOURCE_GAP_ACTUAL_MODEL_UNREADABLE"));
  const s2 = baseState(true, "medium", "acme/foo");
  const ad2: OmpAdapters = {
    resolveRole: (c) => DEFAULT_CONFIG.capabilities[c] ?? null,
    readbackActual: () => ({ model: "acme/foo", effort: "unknown" }),
    setSessionEffort: () => true,
    providerCallCount: () => 0,
  };
  const r2 = runWith(s2, dec({ evidenceRefs: ["e1"] }), cfg, ad2, [ev("e1", "2026-08-21T01:00:01Z")]);
  ok("AC-10 effort unknown source_gap", r2.status === "source_gap");
}

// AC-11 model switch rematch
{
  const cfg = makeConfig();
  cfg.effortPolicies = {
    rules: [
      { match: "acme/*", automaticEfforts: ["medium", "high"] },
      { match: "other/*", automaticEfforts: ["high", "xhigh", "max"] },
    ],
    default: { automaticEfforts: ["medium", "high", "xhigh"] },
  };
  let s = baseState(true, "medium", "acme/foo");
  let ad = raisingAdapters("acme/foo", "medium");
  let r = runWith(s, dec({ evidenceRefs: ["e1"] }), cfg, ad, [ev("e1", "2026-08-21T01:00:01Z")]);
  eq("AC-11 first high", r.state.currentEffort, "high");
  s = r.state;
  ad = raisingAdapters("other/bar", "high");
  const r2 = runWith(s, dec({ decisionId: `d-${++evCounter}`, evidenceRefs: ["e2"] }), cfg, ad, [ev("e2", "2026-08-21T01:00:02Z")]);
  eq("AC-11 second xhigh", r2.state.currentEffort, "xhigh");
  ok("AC-11 matchedRule other/*", r2.auditEvents.some(e => e.matchedRule === "other/*"));
}

// AC-12 ? and * zero
{
  const cfg = makeConfig();
  cfg.effortPolicies = {
    rules: [
      { match: "acme/fo?", automaticEfforts: ["medium", "high"] },
      { match: "acme/*", automaticEfforts: ["high", "xhigh"] },
    ],
    default: { automaticEfforts: ["medium", "high", "xhigh"] },
  };
  ok("AC-12 validation ok", validateEffortPolicies(cfg.effortPolicies).ok === true);
  const s1 = baseState(true, "medium", "acme/foo");
  const ad1 = raisingAdapters("acme/foo", "medium");
  const r1 = runWith(s1, dec({ evidenceRefs: ["e1"] }), cfg, ad1, [ev("e1", "2026-08-21T01:00:01Z")]);
  eq("AC-12 fo? high", r1.state.currentEffort, "high");
  const s2 = baseState(true, "high", "acme/");
  const ad2 = raisingAdapters("acme/", "high");
  const r2 = runWith(s2, dec({ decisionId: `d-${++evCounter}`, evidenceRefs: ["e2"] }), cfg, ad2, [ev("e2", "2026-08-21T01:00:02Z")]);
  eq("AC-12 star zero xhigh", r2.state.currentEffort, "xhigh");
}

// AC-13 duplicate / shadow
{
  const cfgDup = makeConfig();
  cfgDup.effortPolicies = {
    rules: [
      { match: "acme/*", automaticEfforts: ["medium", "high"] },
      { match: "acme/*", automaticEfforts: ["high", "xhigh"] },
    ],
    default: { automaticEfforts: ["medium", "high"] },
  };
  ok("AC-13 duplicate invalid", validateEffortPolicies(cfgDup.effortPolicies).ok === false);
  ok("AC-13 duplicate code", validateEffortPolicies(cfgDup.effortPolicies).errors[0].code === "BLOCKED_DUPLICATE_OR_SHADOWED_RULE");
  const cfgShadow = makeConfig();
  cfgShadow.effortPolicies = {
    rules: [
      { match: "acme/*", automaticEfforts: ["medium", "high"] },
      { match: "acme/foo", automaticEfforts: ["high", "xhigh"] },
    ],
    default: { automaticEfforts: ["medium", "high"] },
  };
  ok("AC-13 shadow invalid", validateEffortPolicies(cfgShadow.effortPolicies).ok === false);
  const s = baseState(true, "medium", "acme/foo");
  const ad = raisingAdapters("acme/foo", "medium");
  const r = runWith(s, dec({ evidenceRefs: ["e1"] }), cfgShadow, ad, [ev("e1", "2026-08-21T01:00:01Z")]);
  ok("AC-13 blocked on shadowed config", r.status === "blocked");
}

// Post-set mismatch
{
  const cfg = makeConfig();
  cfg.effortPolicies = {
    rules: [{ match: "acme/*", automaticEfforts: ["medium", "high"] }],
    default: { automaticEfforts: ["medium", "high"] },
  };
  const s = baseState(true, "medium", "acme/foo");
  let readCount = 0;
  const ad: OmpAdapters = {
    resolveRole: (c) => DEFAULT_CONFIG.capabilities[c] ?? null,
    readbackActual: () => {
      readCount++;
      if (readCount === 1) return { model: "acme/foo", effort: "medium" };
      return { model: "acme/foo", effort: "medium" };
    },
    setSessionEffort: () => true,
    providerCallCount: () => 0,
  };
  const r = runWith(s, dec({ evidenceRefs: ["e1"] }), cfg, ad, [ev("e1", "2026-08-21T01:00:01Z")]);
  ok("post-set mismatch rejected", r.status === "rejected");
  ok("post-set health degraded", r.state.health === "degraded");
  ok("post-set restore failed", r.state.restoreState === "failed");
}

// Native task Max unchanged (observation only)
{
  let s = baseState(true, "medium", "acme/foo");
  s = recordObservedTaskCall(s, { childId: "task-1", generation: s.generation });
  ok("native task observed wave", s.explorationWave === 1);
  ok("native task not blocked", s.phase !== "blocked");
  const cfg = makeConfig();
  const ad = raisingAdapters("acme/max-model", "medium");
  const r = runWith(s, dec({ action: "continue_current", evidenceRefs: ["e1"] }), cfg, ad, [ev("e1", "2026-08-21T01:00:01Z")]);
  ok("native task max not blocked for continue", r.status === "accepted");
}

console.log(`\nWEConverge effort policy: ${passed} passed, ${failed} failed${failed ? ` — ${failures.join("; ")}` : ""}`);
if (failed > 0) process.exit(1);
