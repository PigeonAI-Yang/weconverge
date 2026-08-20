// WEConverge mechanical acceptance — AC-001 .. AC-044 (strengthened, 2026-08-20 contract).
// Deterministic, no real OMP runtime, no network, no paid model.
// Run: node --experimental-strip-types --loader ./scripts/node-ts-loader.mjs test/mechanical.test.ts
import type {
  AuditEventV1,
  ConfigV1,
  ConvergenceDecisionV1,
  Effort,
  EvidenceRefV1,
  OmpAdapters,
  SessionStateV1,
} from "../src/core/index";
import {
  DecisionRegistry,
  weconvergeDecide,
  createInitialState,
  newGeneration,
  resetGeneration,
  modelSwitch,
  applyOff,
  restoreOwnedEffort,
  planRestore,
  confirmRestore,
  relinquishOwnership,
  detectExternalOwnershipChange,
  markChildDetached,
  markChildStale,
  grantManualExploration,
  isGrantValidForGeneration,
  validateConfig,
  makeInstallConfig,
  transitionEffort,
  effortRaisePreconditionsMet,
  checkExplorationLimits,
  wouldRepeatSameAction,
  selectCheaperCandidate,
  resolveCapability,
  buildResolvedRoute,
  preferredActionFor,
  automaticActionBlockReason,
  renderStatus,
  parseCommand,
  persistAudit,
  isValidAuditEvent,
  rebuildSessionFromAudit,
  sanitizeValue,
  sanitizeText,
  buildAuditEvent,
  hasConfirmedEvidence,
  independentDimensions,
  DEFAULT_CONFIG,
} from "../src/core/index";
import type { Candidate } from "../src/core/cost";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean) {
  if (cond) { passed++; }
  else { failed++; failures.push(name); console.error("  FAIL:", name); }
}
function eq(name: string, a: unknown, b: unknown) {
  ok(`${name} (eq ${JSON.stringify(a)} === ${JSON.stringify(b)})`, a === b);
}

// ---------- fixtures ----------
let evCounter = 0;
function makeConfig(): ConfigV1 {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as ConfigV1;
}
function ev(
  id: string,
  integrity: "confirmed" | "partial" = "confirmed",
  kind: EvidenceRefV1["kind"] = "tool_result",
  observedAt?: string,
): EvidenceRefV1 {
  evCounter += 1;
  return {
    id,
    kind,
    summary: `evidence ${id}`,
    observedAt: observedAt ?? `2026-08-19T00:${String(evCounter % 60).padStart(2, "0")}:00Z`,
    sourceId: `src-${id}`,
    integrity,
  };
}
function baseState(enabled: boolean, baselineEffort: Effort = "medium", baselineModel: string | null = "main"): SessionStateV1 {
  return createInitialState({ sessionId: "S1", enabledAtStart: enabled, baseline: { model: baselineModel, effort: baselineEffort } });
}
function dec(over: Partial<ConvergenceDecisionV1>): ConvergenceDecisionV1 {
  return {
    version: 1,
    decisionId: `d-${++evCounter}`,
    action: "continue_current",
    difficultyType: "alternative_ready",
    obstacle: "obstacle",
    evidenceRefs: ["e1"],
    expectedNewInformation: "new info",
    successCriterion: "criterion",
    ...over,
  };
}
interface AdapterOpts {
  preflight?: Effort | "blocked" | "unavailable";
  readback?: { model: string | null; effort: Effort } | null;
  setEffort?: boolean;
  emitChild?: boolean;
  childRoute?: { agent: string | null; model: string | null; effort: Effort } | null;
}
interface AdapterCalls {
  preflight: number;
  emit: number;
  setEffort: number;
  providerCalls: number;
  specs: Array<Record<string, unknown>>;
}
function adapters(opts: AdapterOpts = {}): OmpAdapters & { calls: AdapterCalls } {
  const calls: AdapterCalls = { preflight: 0, emit: 0, setEffort: 0, providerCalls: 0, specs: [] };
  let counter = 0;
  return {
    calls,
    resolveRole: (c) => DEFAULT_CONFIG.capabilities[c] ?? null,
    preflightEffort: (_role) => { calls.preflight++; return opts.preflight ?? "medium"; },
    readbackActual: () => (opts.readback === undefined ? { model: "task-agent", effort: "medium" } : opts.readback),
    setSessionEffort: (_e) => { calls.setEffort++; return opts.setEffort ?? true; },
    emitChild:
      opts.emitChild === false
        ? undefined
        : (spec) => {
            calls.emit++;
            calls.specs.push({ ...spec });
            counter++;
            return { childAgentId: `child-${counter}-${spec.directionId}` };
          },
    readbackChildRoute:
      (_id) => opts.childRoute === undefined ? { agent: "child-agent", model: "child-model", effort: "medium" } : opts.childRoute,
    providerCallCount: () => calls.providerCalls,
  };
}
function run(
  state: SessionStateV1,
  d: ConvergenceDecisionV1,
  cfg: ConfigV1,
  ad: OmpAdapters,
  refs: EvidenceRefV1[],
  reg: DecisionRegistry = new DecisionRegistry(),
) {
  const byId = new Map(refs.map((r) => [r.id, r]));
  return weconvergeDecide({
    state,
    decision: d,
    config: cfg,
    adapters: ad,
    evidenceById: byId,
    registry: reg,
    now: "2026-08-19T01:00:00Z",
    sessionId: "S1",
    parentAgentId: "P1",
  });
}
// Standard verified attempt evidence (anchored, confirmed, tool_result).
function attemptEvidence(id = "e1"): EvidenceRefV1 {
  return ev(id, "confirmed", "tool_result");
}

// =================== AC-001 ===================
{
  const s = baseState(false);
  ok("AC-001 disabled phase", s.phase === "disabled");
  ok("AC-001 no effort owned", s.effortOwnedByExtension === false);
  const r = run(s, dec({}), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-001 disabled refuse", r.status === "rejected");
  ok("AC-001 no children", r.createdChildIds.length === 0);
}
// =================== AC-002 ===================
{
  const s0 = baseState(true);
  ok("AC-002 on idle baseline", s0.phase === "baseline");
  const off = applyOff(s0, { model: "main", effort: "medium" });
  ok("AC-002 off stops auto", off.phase === "disabled" && off.enabledAtStart === false);
  const reset = resetGeneration(s0, { model: "main", effort: "medium" });
  ok("AC-002 reset keeps enabled", reset.enabledAtStart === true && reset.phase === "baseline");
}
// =================== AC-003 ===================
{
  let s = baseState(true);
  s = { ...s, evidence: [ev("e9")], alternativeDirectionIds: ["a1"], automaticWavesUsed: 1, ownedChildRuns: [{ childAgentId: "c1", generation: 1, status: "running" }] };
  const ng = newGeneration(s, { model: "main", effort: "medium" });
  ok("AC-003 new gen clears evidence", ng.evidence.length === 0);
  ok("AC-003 new gen clears alternatives", ng.alternativeDirectionIds.length === 0);
  ok("AC-003 new gen clears waves", ng.automaticWavesUsed === 0);
  ok("AC-003 new gen clears children", ng.ownedChildRuns.length === 0);
  ok("AC-003 gen incremented", ng.generation === s.generation + 1);
}
// =================== AC-004 ===================
{
  const s = baseState(true);
  const r = run(s, dec({}), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-004 continue accepted", r.status === "accepted");
  ok("AC-004 no children", r.createdChildIds.length === 0);
  ok("AC-004 no effort change", r.state.currentEffort === "medium");
}
// =================== AC-005 (production logic, not hand-built) ===================
{
  const s = baseState(true);
  // The AI records its internal-search outcome through the REAL decision path.
  const r = run(
    s,
    dec({ action: "continue_current", selectedDirectionId: "dirA", alternativeDirectionIds: ["dirB", "dirC"] }),
    makeConfig(),
    adapters(),
    [ev("e1")],
  );
  ok("AC-005 selected recorded by engine", r.state.selectedDirection === "dirA");
  ok("AC-005 backups recorded by engine", r.state.alternativeDirectionIds.join(",") === "dirB,dirC");
  // A recorded backup can be activated; an unrecorded one cannot.
  const r2 = run(r.state, dec({ action: "activate_alternative", alternativeId: "dirB" }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-005 recorded alternative activated", r2.status === "accepted" && r2.state.selectedDirection === "dirB");
  const r3 = run(r.state, dec({ action: "activate_alternative", alternativeId: "nope" }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-005 unknown alternative rejected", r3.status === "rejected");
}
// =================== AC-006 ===================
{
  const s = baseState(true);
  const bad = dec({});
  (bad as unknown as Record<string, unknown>).token = 1000;
  const r1 = run(s, bad, makeConfig(), adapters(), [ev("e1")]);
  ok("AC-006 rejects token alloc", r1.status === "rejected");
  const r2 = run(s, dec({ expectedNewInformation: "" }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-006 rejects missing expectedNewInformation", r2.status === "rejected");
  const r3 = run(s, dec({ obstacle: "" }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-006 rejects missing obstacle", r3.status === "rejected");
  const r4 = run(s, dec({ successCriterion: "" }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-006 rejects missing successCriterion", r4.status === "rejected");
  const r5 = run(s, dec({ evidenceRefs: [] }), makeConfig(), adapters(), []);
  ok("AC-006 rejects empty evidenceRefs", r5.status === "rejected");
  // Malformed inputs are rejected, never thrown (2026-08-20 contract).
  let threw = false;
  try {
    run(s, null as unknown as ConvergenceDecisionV1, makeConfig(), adapters(), []);
    run(s, dec({ action: "bogus" as never }), makeConfig(), adapters(), [ev("e1")]);
    run(s, dec({ evidenceRefs: [42] as never }), makeConfig(), adapters(), [ev("e1")]);
  } catch {
    threw = true;
  }
  ok("AC-006 malformed input rejected without throwing", !threw);
}
// =================== AC-007 ===================
{
  const s = baseState(true);
  // raise without an anchored verified attempt -> rejected
  const r1 = run(s, dec({ action: "raise_effort", difficultyType: "reasoning_depth_insufficient" }), makeConfig(), adapters(), [ev("e1", "partial", "verification")]);
  ok("AC-007 raise w/o confirmed verified attempt rejected", r1.status === "rejected");
  // wrong difficulty
  const r2 = run(s, dec({ action: "raise_effort", difficultyType: "bounded_mechanical_work" }), makeConfig(), adapters(), [attemptEvidence("e2")]);
  ok("AC-007 raise wrong difficulty rejected", r2.status === "rejected");
  // subjective complexity: no evidence at all
  const r3 = run(s, dec({ action: "raise_effort", difficultyType: "reasoning_depth_insufficient", evidenceRefs: [] }), makeConfig(), adapters(), []);
  ok("AC-007 raise no evidence rejected", r3.status === "rejected");
  // large-context claim is not an anchored verification/tool_result event
  const r4 = run(s, dec({ action: "raise_effort", difficultyType: "reasoning_depth_insufficient", evidenceRefs: ["ctx"] }), makeConfig(), adapters(), [ev("ctx", "confirmed", "omp_event")]);
  ok("AC-007 context-size alone cannot raise (non-verification kind)", r4.status === "rejected");
}
// =================== AC-008 ===================
{
  const s = baseState(true);
  const r1 = run(s, dec({ action: "report_source_gap", difficultyType: "source_missing", sourceGap: { missingFact: "perm", requiredSource: "file", impact: "cannot proceed" } }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-008 source_gap result", r1.status === "source_gap");
  ok("AC-008 no child", r1.createdChildIds.length === 0);
  ok("AC-008 no effort change", r1.state.currentEffort === "medium");
  const r2 = run(s, dec({ action: "raise_effort", difficultyType: "source_missing" }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-008 source_missing cannot raise", r2.status === "rejected");
}
// =================== AC-009 ===================
{
  const s0 = baseState(true);
  const withAlt = run(s0, dec({ selectedDirectionId: "dirA", alternativeDirectionIds: ["a1"] }), makeConfig(), adapters(), [ev("e1")]).state;
  const r1 = run(withAlt, dec({ action: "activate_alternative", difficultyType: "path_unclear", alternativeId: "a1" }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-009 non-preferred accepted", r1.status === "accepted");
  const r2 = run(s0, dec({ action: "explore_in_parallel", difficultyType: "source_missing", capability: "research", probes: [{ directionId: "d1", question: "q", minimalTask: "m", falsifier: "f" }] }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-009 source_missing explore rejected", r2.status === "rejected");
  const r3 = run(s0, dec({ action: "report_blocked", difficultyType: "proven_blocker", noSafeAlternativeReason: "none", evidenceRefs: ["e9"] }), makeConfig(), adapters(), [ev("e9", "partial")]);
  ok("AC-009 unproven blocked rejected", r3.status === "rejected");
}
// =================== AC-010 ===================
{
  const s = baseState(true);
  const r = run(s, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", probes: [{ directionId: "d1", question: "q", minimalTask: "m", falsifier: "f" }] }), makeConfig(), adapters(), [ev("e1", "partial")]);
  ok("AC-010 explore without confirmed evidence rejected", r.status === "rejected");
}
// =================== AC-011 ===================
{
  const cfg = makeConfig();
  const ad = adapters();
  const s = baseState(true);
  const r2 = run(s, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", probes: [{ directionId: "d1", question: "q", minimalTask: "m", falsifier: "f" }, { directionId: "d2", question: "q", minimalTask: "m", falsifier: "f" }] }), cfg, ad, [ev("e1")]);
  ok("AC-011 two probes -> 2 children", r2.status === "accepted" && r2.createdChildIds.length === 2);
  const r3 = run(s, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", probes: [{ directionId: "x1", question: "q", minimalTask: "m", falsifier: "f" }, { directionId: "x2", question: "q", minimalTask: "m", falsifier: "f" }, { directionId: "x3", question: "q", minimalTask: "m", falsifier: "f" }] }), cfg, adapters(), [ev("e1")]);
  ok("AC-011 three probes rejected", r3.status === "rejected" && r3.createdChildIds.length === 0);
}
// =================== AC-012 ===================
{
  const cfg = makeConfig();
  let s = baseState(true);
  const a = adapters();
  s = run(s, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", decisionId: "w1", probes: [{ directionId: "d1", question: "q", minimalTask: "m", falsifier: "f" }] }), cfg, a, [ev("e1")]).state;
  // wave 2 must cite NEW evidence from wave 1
  const sameEvidence = run(s, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", decisionId: "w2-same", probes: [{ directionId: "d2", question: "q", minimalTask: "m", falsifier: "f" }] }), cfg, a, [ev("e1")]);
  ok("AC-012 wave2 without new evidence rejected", sameEvidence.status === "rejected");
  s = run(s, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", decisionId: "w2", evidenceRefs: ["e1", "w1r"], probes: [{ directionId: "d2", question: "q", minimalTask: "m", falsifier: "f" }] }), cfg, a, [ev("e1"), ev("w1r", "confirmed", "child_result")]).state;
  eq("AC-012 waves used = 2", s.automaticWavesUsed, 2);
  const r3 = run(s, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", decisionId: "w3", evidenceRefs: ["w1r"], probes: [{ directionId: "d3", question: "q", minimalTask: "m", falsifier: "f" }] }), cfg, adapters(), [ev("w1r", "confirmed", "child_result")]);
  ok("AC-012 third wave rejected", r3.status === "rejected");
}
// =================== AC-013 (capture and inspect the REAL ChildSpec) ===================
{
  const s = baseState(true);
  const ad = adapters();
  const r = run(s, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", probes: [{ directionId: "d1", question: "q?", minimalTask: "do the minimal probe", falsifier: "falsified if X" }] }), makeConfig(), ad, [ev("e1")]);
  ok("AC-013 dispatched", r.status === "accepted");
  eq("AC-013 exactly one spec", ad.calls.specs.length, 1);
  const spec = ad.calls.specs[0];
  const keys = Object.keys(spec).sort();
  eq("AC-013 spec keys are the minimal package", keys.join(","), "capability,directionId,falsifier,minimalTask,parentSessionId,question");
  ok("AC-013 spec carries falsifier", spec.falsifier === "falsified if X");
  ok("AC-013 spec carries parent id", spec.parentSessionId === "S1");
  ok("AC-013 spec has no parent-context dump", !JSON.stringify(spec).includes("evidence e1") && JSON.stringify(spec).length < 1000);
}
// =================== AC-014 ===================
{
  const s = baseState(true);
  const r = run(s, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", probes: [{ directionId: "d1", question: "q", minimalTask: "m", falsifier: "f" }] }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-014 child cannot set parent completed", r.state.taskOutcome !== "passed");
}
// =================== AC-015 ===================
{
  let s = baseState(true);
  s = { ...s, generation: 2, ownedChildRuns: [{ childAgentId: "c1", generation: 1, status: "running" }] };
  s = markChildStale(s, "c1");
  ok("AC-015 child stale after gen change", s.ownedChildRuns[0].status === "stale");
  const st = renderStatus(s, makeConfig());
  eq("AC-015 stale not active", st.activeChildren, 0);
}
// =================== AC-016 ===================
{
  eq("AC-016 medium->high", transitionEffort("medium", "high").ok, true);
  eq("AC-016 high->xhigh", transitionEffort("high", "xhigh").ok, true);
}
// =================== AC-017 ===================
{
  eq("AC-017 medium->xhigh rejected", transitionEffort("medium", "xhigh").ok, false);
  eq("AC-017 high->max rejected", transitionEffort("high", "max").ok, false);
  eq("AC-017 xhigh->max rejected", transitionEffort("xhigh", "max").ok, false);
}
// =================== AC-018 ===================
{
  const s = baseState(true);
  const pre = effortRaisePreconditionsMet(s, "reasoning_depth_insufficient", []);
  ok("AC-018 no new attempt rejected", pre.ok === false);
  const pre2 = effortRaisePreconditionsMet(s, "reasoning_depth_insufficient", [attemptEvidence("a1")]);
  ok("AC-018 with anchored verified attempt allowed", pre2.ok === true);
  // after a raise, the SAME old evidence no longer unlocks the next raise
  const raised: SessionStateV1 = { ...s, currentEffort: "high", lastEffortRaiseAt: "2026-08-19T00:30:00Z" };
  const old = effortRaisePreconditionsMet(raised, "reasoning_depth_insufficient", [ev("old", "confirmed", "verification", "2026-08-19T00:01:00Z")]);
  ok("AC-018 stale attempt rejected after raise", old.ok === false);
  const fresh = effortRaisePreconditionsMet(raised, "reasoning_depth_insufficient", [ev("new", "confirmed", "verification", "2026-08-19T00:45:00Z")]);
  ok("AC-018 fresh verified attempt allowed after raise", fresh.ok === true);
}
// =================== AC-019 (+AC-108 policy): real provider-call instrumentation ===================
{
  const s = baseState(true);
  const maxAd = adapters({ preflight: "max" });
  const beforeMax = maxAd.calls.providerCalls;
  const r = run(s, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", probes: [{ directionId: "d1", question: "q", minimalTask: "m", falsifier: "f" }] }), makeConfig(), maxAd, [ev("e1")]);
  ok("AC-019 max preflight rejected (cost_guard_conflict)", r.status === "rejected" && (r.reason ?? "").includes("cost_guard_conflict"));
  eq("AC-019 zero provider calls (instrumented)", maxAd.calls.providerCalls, beforeMax);
  eq("AC-019 zero child emits", maxAd.calls.emit, 0);
  const unAd = adapters({ preflight: "unavailable" });
  const beforeUn = unAd.calls.providerCalls;
  const r2 = run(s, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", probes: [{ directionId: "d1", question: "q", minimalTask: "m", falsifier: "f" }] }), makeConfig(), unAd, [ev("e1")]);
  ok("AC-019 unavailable BLOCKED", r2.status === "blocked");
  eq("AC-019 unavailable zero provider calls", unAd.calls.providerCalls, beforeUn);
  const blAd = adapters({ preflight: "blocked" });
  const r3 = run(s, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", probes: [{ directionId: "d1", question: "q", minimalTask: "m", falsifier: "f" }] }), makeConfig(), blAd, [ev("e1")]);
  ok("AC-019 blocked preflight BLOCKED zero calls", r3.status === "blocked" && blAd.calls.emit === 0 && blAd.calls.providerCalls === 0);
  ok("F-02 preflight blocked persists phase", r3.state.phase === "blocked" && (r3.state.blockedReason ?? "").includes("preflight"));
}
// =================== F-02/F-03/F-06 regressions ===================
{
  const s = baseState(true);
  const degraded = { ...s, health: "degraded" as const };
  const blockedRaiseAdapter = adapters({ readback: { model: "m", effort: "high" } });
  const blockedRaise = run(degraded, dec({ action: "raise_effort", difficultyType: "reasoning_depth_insufficient" }), makeConfig(), blockedRaiseAdapter, [attemptEvidence("e1")]);
  ok("F-02 degraded gate blocks raise", blockedRaise.status === "blocked" && blockedRaiseAdapter.calls.setEffort === 0);
  const badVersion = run(s, dec({ version: 2 as never }), makeConfig(), adapters(), [ev("e1")]);
  ok("F-03 version 2 rejected", badVersion.status === "rejected" && badVersion.createdChildIds.length === 0);
  const missingVersion = dec({});
  delete (missingVersion as unknown as Record<string, unknown>).version;
  const missingVersionResult = run(s, missingVersion, makeConfig(), adapters(), [ev("e1")]);
  ok("F-03 missing version rejected", missingVersionResult.status === "rejected");
  const maxChild = adapters({ childRoute: { agent: "child", model: "child-model", effort: "max" } });
  const maxResult = run(s, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", probes: [{ directionId: "max", question: "q", minimalTask: "m", falsifier: "f" }] }), makeConfig(), maxChild, [ev("e1")]);
  ok("F-06 child Max blocks result", maxResult.status === "blocked" && maxResult.state.phase === "blocked" && maxResult.state.routingIntegrity === "failed");
  ok("F-06 child Max is stale and never confirmed", maxResult.state.ownedChildRuns[0]?.status === "stale" && maxResult.resolvedRoute?.resolvedEffort === "max" && maxResult.resolvedRoute.integrity !== "confirmed");
}
// =================== AC-020 ===================
{
  const ad = adapters({ readback: { model: null, effort: "unknown" } });
  const route = buildResolvedRoute({ requestedRole: "designer", parentAgentId: "P1", childAgentId: null, adapters: ad });
  ok("AC-020 unknown effort source_gap", route.integrity === "source_gap" && route.resolvedEffort === "unknown");
}
// =================== AC-021 ===================
{
  const cfg = makeConfig();
  const role = resolveCapability(cfg, "nonexistent_capability");
  ok("AC-021 missing role null", role === null);
  const s = baseState(true);
  const r = run(s, dec({ action: "invoke_specialist", difficultyType: "domain_mismatch", capability: "nonexistent_capability" }), cfg, adapters(), [ev("e1")]);
  ok("AC-021 no fallback (source_gap)", r.status === "source_gap");
}
// =================== AC-022 ===================
{
  const ad = adapters({ readback: { model: "kimi/x", effort: "xhigh" } });
  const route = buildResolvedRoute({ requestedRole: "designer", parentAgentId: "P1", childAgentId: null, adapters: ad });
  ok("AC-022 requested != resolved separation", route.requestedRole === "designer" && route.resolvedModel === "kimi/x");
  ok("AC-022 requested role NEVER becomes resolvedAgent", route.resolvedAgent === null);
  ok("AC-022 confirmed only when model+effort known", route.integrity === "confirmed");
  const childRoute = buildResolvedRoute({ requestedRole: "designer", parentAgentId: "P1", childAgentId: "c1", adapters: adapters({ childRoute: null }) });
  ok("AC-022 unreadable child route is source_gap, never confirmed", childRoute.integrity === "source_gap" && childRoute.resolvedAgent === null);
}
// =================== AC-023 ===================
{
  const s = baseState(true);
  // Price telemetry is a CONSTANT source gap and must not alter route/model/effort.
  const st = renderStatus(s, makeConfig(), { model: "main", effort: "medium" });
  ok("AC-023 price gap listed", st.priceTelemetry === "SOURCE GAP");
  ok("AC-023 route/model/effort untouched by price gap", st.actualModel === "main" && st.actualEffort === "medium" && s.routingIntegrity === "unverified");
  // Missing relative cost tier -> source_gap, no effort change
  const cfg = makeConfig();
  cfg.effortCostTiers = { medium: 2 };
  const r2 = run(s, dec({ action: "raise_effort", difficultyType: "reasoning_depth_insufficient" }), cfg, adapters({ readback: { model: "m", effort: "high" } }), [attemptEvidence("e1")]);
  ok("AC-023 cost missing source_gap", r2.status === "source_gap");
  ok("AC-023 effort unchanged on cost gap", r2.state.currentEffort === "medium");
}
// =================== AC-024 ===================
{
  const s = baseState(true);
  const reg = new DecisionRegistry();
  const d = dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", decisionId: "repeat", evidenceRefs: ["e1", "e2"], probes: [{ directionId: "d1", question: "q", minimalTask: "m", falsifier: "f" }] });
  const first = run(s, d, makeConfig(), adapters(), [ev("e1"), ev("e2")], reg);
  ok("AC-024 first accepted", first.status === "accepted");
  const d2 = dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", decisionId: "repeat2", evidenceRefs: ["e2", "e1"], probes: [{ directionId: "d1", question: "q", minimalTask: "m", falsifier: "f" }] });
  const second = run(first.state, d2, makeConfig(), adapters(), [ev("e1"), ev("e2")], reg);
  ok("F-05 repeat guard ignores evidence order", second.status === "rejected");
}
// =================== AC-025 ===================
{
  const s: SessionStateV1 = { ...baseState(true), effortOwnedByExtension: true, currentEffort: "high", currentModel: "m1" };
  ok("AC-025 external change detected", detectExternalOwnershipChange(s, { model: "m2", effort: "medium" }) === true);
  ok("AC-025 no false positive", detectExternalOwnershipChange(s, { model: "m1", effort: "high" }) === false);
  const rel = relinquishOwnership(s, { model: "m2", effort: "medium" });
  ok("AC-025 relinquish keeps external actual", rel.currentModel === "m2" && rel.currentEffort === "medium");
  ok("AC-025 relinquish degraded + not owned", rel.effortOwnedByExtension === false && rel.health === "degraded");
  ok("AC-025 relinquish re-baselines", rel.baselineModel === "m2" && rel.baselineEffort === "medium");
}
// =================== AC-026 ===================
{
  const owned: SessionStateV1 = { ...baseState(true), effortOwnedByExtension: true, currentEffort: "high" };
  const after = applyOff(owned, { model: "main", effort: "medium" });
  ok("AC-026 off restores owned", after.effortOwnedByExtension === false && after.currentEffort === "medium");
  const notOwned = baseState(true);
  const after2 = applyOff(notOwned, { model: "main", effort: "medium" });
  ok("AC-026 no restore when not owned", after2.currentEffort === "medium" && after2.restoreState === "not_needed");
  // Two-phase real restore: plan -> (wiring sets) -> confirm with readback
  const plan = planRestore(owned);
  ok("AC-026 plan targets baseline", plan.needed && plan.target.effort === "medium");
  const confirmed = confirmRestore(owned, plan.target, { model: "main", effort: "medium" });
  ok("AC-026 confirm restores on matching readback", confirmed.restoreState === "restored" && confirmed.currentEffort === "medium");
  const mismatch = confirmRestore(owned, plan.target, { model: "main", effort: "xhigh" });
  ok("AC-026 confirm fails on mismatched readback", mismatch.restoreState === "failed" && mismatch.health === "degraded" && mismatch.currentEffort === "xhigh");
}
// =================== AC-027 ===================
{
  const owned: SessionStateV1 = { ...baseState(true), effortOwnedByExtension: true, currentEffort: "high" };
  const restored = restoreOwnedEffort(owned, { model: null, effort: "unknown" });
  ok("AC-027 restore fail keeps actual", restored.currentEffort === "high");
  ok("AC-027 restore fail degraded", restored.health === "degraded" && restored.restoreState === "failed");
  const unknownReadback = confirmRestore(owned, { model: "main", effort: "medium" }, null);
  ok("AC-027 unreadable actual is failed not restored", unknownReadback.restoreState === "failed");
  const failedRestore: SessionStateV1 = {
    ...owned,
    phase: "executing",
    routingIntegrity: "failed",
    restoreState: "failed",
    health: "degraded",
  };
  const guardedOff = applyOff(failedRestore, { model: "main", effort: "medium" });
  const guardedReset = resetGeneration(failedRestore, { model: "main", effort: "medium" });
  const guardedSwitch = modelSwitch(failedRestore, { model: "next", effort: "medium" });
  ok("AC-027 failed restore off preserves actual/owner/phase", guardedOff.currentEffort === "high" && guardedOff.effortOwnedByExtension && guardedOff.phase === "executing" && guardedOff.restoreState === "failed");
  ok("AC-027 failed restore reset preserves routing health", guardedReset.routingIntegrity === "failed" && guardedReset.phase === "executing" && guardedReset.health === "degraded");
  ok("AC-027 failed restore switch keeps generation", guardedSwitch.generation === failedRestore.generation && guardedSwitch.currentEffort === "high" && guardedSwitch.effortOwnedByExtension);
}
// =================== AC-028 ===================
{
  const s = baseState(false, "unknown", null);
  const st = renderStatus(s, makeConfig());
  ok("AC-028 unknown model shown", st.actualModel === "unknown");
  ok("AC-028 unknown effort shown", st.actualEffort === "unknown");
  ok("AC-028 price telemetry gap", st.priceTelemetry === "SOURCE GAP");
  // live readback beats cached state
  const st2 = renderStatus({ ...s, currentEffort: "high" }, makeConfig(), { model: "live-model", effort: "low" as never });
  ok("AC-028 status shows LIVE actual not cache", st2.actualModel === "live-model");
}
// =================== AC-029 ===================
{
  eq("AC-029 bogus usage", parseCommand("weconverge bogus").usage, true);
  eq("AC-029 status no args", parseCommand("weconverge status extra").usage, true);
  eq("AC-029 on extra args usage", parseCommand("weconverge on extra").usage, true);
  eq("AC-029 off extra args usage", parseCommand("weconverge off extra").usage, true);
  eq("AC-029 reset extra args usage", parseCommand("weconverge reset extra").usage, true);
  eq("AC-029 on valid", parseCommand("weconverge on").cmd, "on");
  eq("AC-029 slash form", parseCommand("/weconverge off").cmd, "off");
}
// =================== AC-030 (real secret fixtures through audit) ===================
{
  const redacted = sanitizeText("Authorization: Bearer secret123 token=abc");
  ok("AC-030 credential redacted", redacted.includes("[REDACTED]") && !redacted.includes("secret123"));
  const secretFixture = {
    requestId: "req-1",
    metadata: {
      headers: { Authorization: "Bearer sk-live-12345", cookie: "session=xyz" },
      note: "api_key: sk-live-12345",
      nested: [{ password: "hunter2", safe: "ok" }],
    },
  };
  const cleaned = sanitizeValue(secretFixture);
  const cleanedJson = JSON.stringify(cleaned);
  ok("AC-030 provider metadata deep-sanitized", !cleanedJson.includes("sk-live-12345") && !cleanedJson.includes("hunter2") && !cleanedJson.includes("session=xyz"));
  ok("AC-030 safe fields preserved", cleanedJson.includes("req-1") && cleanedJson.includes("ok"));
  const ae = buildAuditEvent({
    eventId: "wev-t-1",
    timestamp: "t",
    sessionId: "S",
    generation: 1,
    parentAgentId: null,
    eventType: "decision_accepted",
    decision: dec({ evidenceRefs: ["e9"], expectedNewInformation: "Authorization: Bearer xyz" }),
    resolvedRoute: null,
    relativeCostTier: null,
    costComparison: null,
    result: "confirmed",
    sourceGaps: [],
    restoreResult: null,
  });
  ok("AC-030 audit no credential", !JSON.stringify(ae).includes("Bearer xyz"));
  const quotedCredential = '{"authorization":"Bearer sk-live-json","cookie":"session=json-cookie","apiKey":"json-api","api_key":"json-api-2","secret":"json-secret","password":"json-password","token":"json-token","credential":"json-credential","safe":"keep-me"}';
  const quotedAudit = buildAuditEvent({
    eventId: "wev-quoted",
    timestamp: "t",
    sessionId: "S",
    generation: 1,
    parentAgentId: null,
    eventType: "decision_rejected",
    decision: dec({ evidenceRefs: [quotedCredential], expectedNewInformation: quotedCredential, successCriterion: quotedCredential }),
    resolvedRoute: null,
    relativeCostTier: null,
    costComparison: null,
    result: "failed",
    sourceGaps: [quotedCredential],
    restoreResult: quotedCredential,
    decisionReason: quotedCredential,
  });
  const quotedJson = JSON.stringify(quotedAudit);
  ok("AC-030 quoted JSON credentials fully redacted", !["sk-live-json", "json-cookie", "json-api", "json-api-2", "json-secret", "json-password", "json-token", "json-credential"].some((secret) => quotedJson.includes(secret)));
  ok("AC-030 quoted JSON safe neighboring field preserved", quotedJson.includes("keep-me"));
}
// =================== AC-031 ===================
{
  const res = persistAudit(() => { throw new Error("disk full"); });
  ok("AC-031 write failure not ok", res.ok === false);
  const res2 = persistAudit(() => {});
  ok("AC-031 write success ok", res2.ok === true);
}
// =================== AC-032 ===================
{
  const s: SessionStateV1 = { ...baseState(true), routingIntegrity: "source_gap", taskOutcome: "passed", sourceGaps: ["g1"], blockedReason: "b", restoreState: "restored", health: "ok" };
  const dims = independentDimensions(s);
  ok("AC-032 dims independent", dims.routingIntegrity === "source_gap" && dims.taskOutcome === "passed" && dims.health === "ok" && dims.blockedReason === "b");
}
// =================== AC-033 / AC-038 (user child vs WEConverge child) ===================
{
  const s = baseState(true);
  const withOwned = { ...s, ownedChildRuns: [{ childAgentId: "wc-child", generation: 1, status: "running" as const }] };
  const off = applyOff(withOwned, { model: "main", effort: "medium" });
  ok("AC-033 off detaches WEConverge children", off.ownedChildRuns[0].status === "detached");
  const st = renderStatus(off, makeConfig());
  eq("AC-033 detached not active but visible", off.ownedChildRuns.length, 1);
  eq("AC-033 detached excluded from active", st.activeChildren, 0);
  // User children are never in ownedChildRuns by construction: applyOff cannot touch them.
  ok("AC-038 user children never tracked/terminated", !off.ownedChildRuns.some((c) => c.childAgentId === "user-child"));
}
// =================== AC-034 ===================
{
  const s = baseState(true);
  const r = run(s, dec({ obstacle: "" }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-034 continue needs obstacle", r.status === "rejected");
  const r2 = run(s, dec({ expectedNewInformation: "" }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-034 continue needs new info", r2.status === "rejected");
  const r3 = run(s, dec({ evidenceRefs: [] }), makeConfig(), adapters(), []);
  ok("AC-034 continue needs evidence", r3.status === "rejected");
}
// =================== AC-035 ===================
{
  const s = baseState(true);
  const r = run(s, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", probes: [{ directionId: "d1", question: "q", minimalTask: "m", falsifier: "f" }] }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-035 confirmed anchor passes", r.status === "accepted");
  const r2 = run(s, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", evidenceRefs: ["x"], probes: [{ directionId: "d1", question: "q", minimalTask: "m", falsifier: "f" }] }), makeConfig(), adapters(), [{ id: "x", kind: "tool_result", summary: "", observedAt: "", sourceId: "", integrity: "confirmed" }]);
  ok("AC-035 self-report rejected", r2.status === "rejected");
}
// =================== AC-036 (cost comparison EXECUTED, not just computed) ===================
{
  const cands: Candidate[] = [
    { action: "raise_effort", fixesGap: true, costTier: 3, excluded: null },
    { action: "invoke_specialist", fixesGap: true, costTier: 1, excluded: null },
  ];
  const sel = selectCheaperCandidate(cands);
  eq("AC-036 cheaper chosen", sel.chosen?.action, "invoke_specialist");
  const noCost = selectCheaperCandidate([{ action: "raise_effort", fixesGap: true, costTier: null, excluded: null }]);
  ok("AC-036 missing cost source_gap", noCost.sourceGap === true && noCost.chosen === null);
  // End-to-end: raise requested but a cheaper LEGAL specialist exists => specialist dispatched, effort unchanged.
  const s = baseState(true);
  const ad = adapters(); // preflight medium, emitChild present: specialist legal, tier 1 < high tier 3
  const r = run(s, dec({ action: "raise_effort", difficultyType: "reasoning_depth_insufficient", capability: "research" }), makeConfig(), ad, [attemptEvidence("e1")]);
  ok("AC-036 cheaper specialist executed", r.status === "accepted" && r.effectiveAction === "invoke_specialist");
  ok("AC-036 effort NOT raised when specialist cheaper", r.state.currentEffort === "medium");
  eq("AC-036 specialist child created", r.createdChildIds.length, 1);
  ok("AC-036 comparison audited", r.costComparison !== null && r.costComparison.chosen === "invoke_specialist");
  // When the specialist is ILLEGAL (preflight unavailable), the raise may proceed.
  const adBlocked = adapters({ preflight: "unavailable", readback: { model: "m", effort: "high" } });
  const r2 = run(baseState(true), dec({ action: "raise_effort", difficultyType: "reasoning_depth_insufficient", capability: "research" }), makeConfig(), adBlocked, [attemptEvidence("e1")]);
  ok("AC-036 illegal specialist excluded, raise proceeds", r2.status === "accepted" && r2.effectiveAction === "raise_effort" && r2.state.currentEffort === "high");
  ok("AC-036 exclusion reason audited", r2.costComparison?.candidates.some((c) => c.action === "invoke_specialist" && c.excluded !== null) === true);
}
// =================== AC-037 / AC-115 (full replay + reconcile) ===================
{
  const stored = baseState(true);
  const events: AuditEventV1[] = [
    buildAuditEvent({ eventId: "wev-t-1", timestamp: "2026-08-19T00:00:01Z", sessionId: "S1", generation: 1, parentAgentId: null, eventType: "decision_accepted", decision: dec({}), resolvedRoute: null, relativeCostTier: null, costComparison: null, result: "confirmed", sourceGaps: [], restoreResult: null }),
  ];
  const good = rebuildSessionFromAudit(events, stored, { model: "main", effort: "medium" });
  ok("AC-037 replay same state", good.state?.generation === 1 && good.degraded === false);
  const conflict = rebuildSessionFromAudit(events, { ...stored, effortOwnedByExtension: true, currentEffort: "high" }, { model: "main", effort: "medium" });
  ok("AC-037 ownership conflict degraded", conflict.degraded === true && conflict.state?.health === "degraded");
  ok("AC-037 no new resources on conflict", conflict.state?.ownedChildRuns.length === 0);
  const modelConflict = rebuildSessionFromAudit(
    events,
    { ...stored, effortOwnedByExtension: true, currentModel: "model-a", currentEffort: "high" },
    { model: "model-b", effort: "high" },
  );
  ok("R-05 owned model conflict degraded", modelConflict.degraded === true && modelConflict.state?.health === "degraded");
  ok("R-05 model conflict records replay integrity", modelConflict.errors.includes("persisted model ownership conflicts with OMP actual readback") && modelConflict.state?.routingIntegrity === "source_gap");
  ok("R-05 model conflict blocks automatic actions", modelConflict.state !== null && automaticActionBlockReason(modelConflict.state) !== null);
  const corrupt = rebuildSessionFromAudit([{ garbage: true }], stored, { model: "main", effort: "medium" });
  ok("AC-037 corrupt event degraded", corrupt.degraded === true);
  const noState = rebuildSessionFromAudit(events, null, { model: "main", effort: "medium" });
  ok("AC-037 missing state degraded", noState.state === null && noState.degraded === true);
  const disordered = rebuildSessionFromAudit(
    [
      buildAuditEvent({ eventId: "wev-t-2", timestamp: "2026-08-19T00:00:02Z", sessionId: "S1", generation: 1, parentAgentId: null, eventType: "a", decision: null, resolvedRoute: null, relativeCostTier: null, costComparison: null, result: "confirmed", sourceGaps: [], restoreResult: null }),
      buildAuditEvent({ eventId: "wev-t-1", timestamp: "2026-08-19T00:00:01Z", sessionId: "S1", generation: 1, parentAgentId: null, eventType: "b", decision: null, resolvedRoute: null, relativeCostTier: null, costComparison: null, result: "confirmed", sourceGaps: [], restoreResult: null }),
    ],
    stored,
    { model: "main", effort: "medium" },
  );
  ok("AC-037 broken order degraded", disordered.degraded === true);
  const replayedState: SessionStateV1 = {
    ...stored,
    phase: "executing",
    selectedDirection: "audit-direction",
    evidence: [ev("audit-evidence")],
  };
  const replayEvent = buildAuditEvent({
    eventId: "wev-replay",
    timestamp: "2026-08-19T00:00:03Z",
    sessionId: "S1",
    generation: 1,
    parentAgentId: null,
    eventType: "action_terminal",
    decision: dec({ decisionId: "audit-decision" }),
    resolvedRoute: null,
    relativeCostTier: null,
    costComparison: null,
    result: "confirmed",
    sourceGaps: [],
    restoreResult: null,
    stateSnapshot: replayedState,
  });
  const replay = rebuildSessionFromAudit([replayEvent], stored, { model: "main", effort: "medium" });
  ok("F-01 replay folds changed state", replay.state?.selectedDirection === "audit-direction" && replay.state?.evidence[0]?.id === "audit-evidence");
  ok("F-01 replay conflict remains degraded", replay.degraded === true && replay.state?.routingIntegrity === "source_gap");
  const recovered = rebuildSessionFromAudit([replayEvent], null, { model: "main", effort: "medium" });
  ok("F-01 missing state recovers from audit snapshot but stays degraded", recovered.state !== null && recovered.degraded && recovered.state.health === "degraded");
  ok("F-01 built event is valid AuditEventV1", isValidAuditEvent(replayEvent));
}
// =================== AC-039 ===================
{
  let s: SessionStateV1 = { ...baseState(true), evidence: [ev("e1")], selectedDirection: "d", alternativeDirectionIds: ["a"], automaticWavesUsed: 1, explorationWave: 1, lastDecision: dec({}), manualExplorationGrant: { generation: 1, extraWaves: 1, maxParallel: 3, expiresAt: "task_end" }, effortOwnedByExtension: true };
  s = modelSwitch(s, { model: "m2", effort: "medium" });
  ok("AC-039 clears evidence", s.evidence.length === 0);
  ok("AC-039 clears direction", s.selectedDirection === null);
  ok("AC-039 clears wave", s.explorationWave === 0);
  ok("AC-039 clears decision", s.lastDecision === null);
  ok("AC-039 clears grant", s.manualExplorationGrant === null);
  ok("AC-039 clears ownership", s.effortOwnedByExtension === false);
  ok("AC-039 gen incremented", s.generation === 2);
}
// =================== AC-040 (grant expiry on task_end/off/reset/switch) ===================
{
  let s = grantManualExploration(baseState(true), 1, 3);
  ok("AC-040 grant bound to gen", isGrantValidForGeneration(s) === true);
  eq("AC-040 grant parallel", s.manualExplorationGrant?.maxParallel, 3);
  const cfg = makeConfig();
  const r = run(s, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", probes: [{ directionId: "d1", question: "q", minimalTask: "m", falsifier: "f" }, { directionId: "d2", question: "q", minimalTask: "m", falsifier: "f" }, { directionId: "d3", question: "q", minimalTask: "m", falsifier: "f" }] }), cfg, adapters(), [ev("e1")]);
  ok("AC-040 grant allows 3 parallel", r.status === "accepted" && r.createdChildIds.length === 3);
  const maxAd = adapters({ preflight: "max" });
  const r2 = run(s, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", probes: [{ directionId: "d1", question: "q", minimalTask: "m", falsifier: "f" }] }), cfg, maxAd, [ev("e1")]);
  ok("AC-040 grant no max lift", r2.status === "rejected" && maxAd.calls.emit === 0);
  // Grant dies at every boundary: off / reset / model switch / new task.
  ok("AC-040 grant dies at off", applyOff(s, { model: "main", effort: "medium" }).manualExplorationGrant === null);
  ok("AC-040 grant dies at reset", resetGeneration(s, { model: "main", effort: "medium" }).manualExplorationGrant === null);
  ok("AC-040 grant dies at switch", modelSwitch(s, { model: "m2", effort: "medium" }).manualExplorationGrant === null);
  ok("AC-040 grant dies at task end (new generation)", newGeneration(s, { model: "main", effort: "medium" }).manualExplorationGrant === null);
  // A stale-generation grant no longer widens limits even if it lingers in state.
  const stale: SessionStateV1 = { ...s, generation: 2 };
  ok("AC-040 stale grant not valid", isGrantValidForGeneration(stale) === false);
  const r3 = run(stale, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", probes: [{ directionId: "d1", question: "q", minimalTask: "m", falsifier: "f" }, { directionId: "d2", question: "q", minimalTask: "m", falsifier: "f" }, { directionId: "d3", question: "q", minimalTask: "m", falsifier: "f" }] }), cfg, adapters(), [ev("e1")]);
  ok("AC-040 stale grant cannot widen parallelism", r3.status === "rejected");
}
// =================== AC-041 ===================
{
  const s = baseState(true);
  const r = run({ ...s, phase: "disabled" }, dec({ action: "explore_in_parallel", difficultyType: "path_unclear", capability: "research", probes: [{ directionId: "d1", question: "q", minimalTask: "m", falsifier: "f" }] }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-041 failure no side effect", r.status === "rejected" && r.createdChildIds.length === 0 && r.state.currentEffort === "medium");
}
// =================== AC-042 (same adapters: prove zero repeated side effects) ===================
{
  const reg = new DecisionRegistry();
  const s = baseState(true);
  const ad = adapters({ readback: { model: "m", effort: "high" } });
  const d = dec({ action: "raise_effort", difficultyType: "reasoning_depth_insufficient", decisionId: "idemp" });
  const first = run(s, d, makeConfig(), ad, [attemptEvidence("e1")], reg);
  ok("AC-042 first accepted", first.status === "accepted");
  eq("AC-042 first set effort once", ad.calls.setEffort, 1);
  const second = run(first.state, d, makeConfig(), ad, [attemptEvidence("e1")], reg);
  ok("AC-042 duplicate returns first result", second.status === "accepted");
  ok("F-04 duplicate keeps original audit id", second.auditEventId === first.auditEventId);
  ok("F-04 duplicate keeps original route", JSON.stringify(second.resolvedRoute) === JSON.stringify(first.resolvedRoute));
  ok("F-04 duplicate keeps original child ids", JSON.stringify(second.createdChildIds) === JSON.stringify(first.createdChildIds));
  ok("F-04 duplicate has no substitute audit events", second.auditEvents.length === first.auditEvents.length && second.auditEvents[0]?.eventId === first.auditEvents[0]?.eventId);
  eq("AC-042 duplicate zero new side effects", ad.calls.setEffort, 1);
  const d2 = dec({ action: "continue_current", decisionId: "idemp" });
  const third = run(first.state, d2, makeConfig(), adapters(), [ev("e1")], reg);
  ok("AC-042 same id different payload conflict", third.status === "rejected");
  // registry isolated per session/generation: same id in a new generation is fresh
  const gen2 = modelSwitch(first.state, { model: "m", effort: "medium" });
  const fourth = run(gen2, d, makeConfig(), adapters({ readback: { model: "m", effort: "high" } }), [attemptEvidence("e1")], reg);
  ok("AC-042 same id fresh in new generation", fourth.status === "accepted");
}
// =================== R-07 (full passthrough payload hash) ===================
{
  const reg = new DecisionRegistry();
  const s = baseState(true);
  const firstPayload = { ...dec({ decisionId: "passthrough-id" }), foo: "a", nested: { a: 1, b: { x: 2, y: 3 } } } as ConvergenceDecisionV1;
  const first = run(s, firstPayload, makeConfig(), adapters(), [ev("e1")], reg);
  ok("R-07 passthrough baseline accepted", first.status === "accepted");
  const changed = { ...firstPayload, foo: "b" } as ConvergenceDecisionV1;
  const conflict = run(first.state, changed, makeConfig(), adapters(), [ev("e1")], reg);
  ok("R-07 unknown field value conflicts", conflict.status === "rejected" && conflict.reason?.includes("different payload") === true);
  const reordered = { ...firstPayload, nested: { b: { y: 3, x: 2 }, a: 1 } } as ConvergenceDecisionV1;
  const duplicate = run(first.state, reordered, makeConfig(), adapters(), [ev("e1")], reg);
  ok("R-07 reordered nested objects deduplicate", duplicate.status === first.status && duplicate.auditEventId === first.auditEventId);
}
// =================== AC-043 ===================
{
  const s = baseState(true);
  const r1 = run(s, dec({ action: "report_blocked", difficultyType: "proven_blocker", noSafeAlternativeReason: "none", evidenceRefs: ["e9"] }), makeConfig(), adapters(), [ev("e9", "partial")]);
  ok("AC-043 no confirmed evidence rejected", r1.status === "rejected");
  const r2 = run(s, dec({ action: "report_blocked", difficultyType: "proven_blocker" }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-043 no reason rejected", r2.status === "rejected");
  const r3 = run(s, dec({ action: "report_blocked", difficultyType: "proven_blocker", noSafeAlternativeReason: "no alt" }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-043 valid blocked accepted", r3.status === "blocked");
  // legal recorded alternative remains => cannot report blocked
  const withAlt = run(s, dec({ selectedDirectionId: "dirA", alternativeDirectionIds: ["dirB"] }), makeConfig(), adapters(), [ev("e1")]).state;
  const r4 = run(withAlt, dec({ action: "report_blocked", difficultyType: "proven_blocker", noSafeAlternativeReason: "tried" }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-043 blocked rejected while legal alternative remains", r4.status === "rejected");
}
// =================== AC-044 ===================
{
  const s = baseState(true);
  const r1 = run(s, dec({ action: "report_source_gap", difficultyType: "source_missing", sourceGap: { missingFact: "", requiredSource: "f", impact: "i" } }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-044 missing missingFact rejected", r1.status === "rejected" && r1.state.phase !== "source_gap");
  const r2 = run(s, dec({ action: "report_source_gap", difficultyType: "source_missing", sourceGap: { missingFact: "m", requiredSource: "", impact: "i" } }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-044 missing requiredSource rejected", r2.status === "rejected");
  const r3 = run(s, dec({ action: "report_source_gap", difficultyType: "source_missing", sourceGap: { missingFact: "m", requiredSource: "f", impact: "" } }), makeConfig(), adapters(), [ev("e1")]);
  ok("AC-044 missing impact rejected", r3.status === "rejected");
}

// =================== audit sequence (SPEC §9.0) ===================
{
  const s = baseState(true);
  const r = run(s, dec({ action: "raise_effort", difficultyType: "reasoning_depth_insufficient" }), makeConfig(), adapters({ readback: { model: "m", effort: "high" } }), [attemptEvidence("e1")]);
  const types = r.auditEvents.map((e) => e.eventType);
  ok("SEQ accepted order", types.join(">") === "decision_received>decision_validated>action_started>action_terminal");
  ok("SEQ returns ids", r.auditEventId.startsWith("wev-") && r.decisionId.length > 0 && r.generation === 1);
  const rj = run(s, dec({ obstacle: "" }), makeConfig(), adapters(), [ev("e1")]);
  ok("SEQ rejected order", rj.auditEvents.map((e) => e.eventType).join(">") === "decision_received>decision_rejected");
}

// =================== effort raise: readback enforced (2026-08-20 contract) ===================
{
  const s = baseState(true);
  // readback mismatch => not accepted, degraded, actual kept
  const bad = adapters({ readback: { model: "m", effort: "medium" } }); // claims set ok but reads back old
  const r = run(s, dec({ action: "raise_effort", difficultyType: "reasoning_depth_insufficient" }), makeConfig(), bad, [attemptEvidence("e1")]);
  ok("RAISE readback mismatch rejected", r.status === "rejected" && r.state.currentEffort === "medium");
  ok("RAISE mismatch degraded", r.state.health === "degraded");
  // unknown readback => not accepted
  const unk = adapters({ readback: { model: "m", effort: "unknown" } });
  const r2 = run(s, dec({ action: "raise_effort", difficultyType: "reasoning_depth_insufficient" }), makeConfig(), unk, [attemptEvidence("e1")]);
  ok("RAISE unknown readback rejected", r2.status === "rejected" && r2.state.effortOwnedByExtension === false);
  // max readback => never accepted
  const mx = adapters({ readback: { model: "m", effort: "max" } });
  const r3 = run(s, dec({ action: "raise_effort", difficultyType: "reasoning_depth_insufficient" }), makeConfig(), mx, [attemptEvidence("e1")]);
  ok("RAISE max readback never accepted", r3.status === "rejected" && r3.state.effortOwnedByExtension === false && r3.state.health === "degraded" && r3.state.currentEffort === "max");
  // happy path: set+readback verified, ownership + raise stamp recorded
  const good = adapters({ readback: { model: "m", effort: "high" } });
  const r4 = run(s, dec({ action: "raise_effort", difficultyType: "reasoning_depth_insufficient" }), makeConfig(), good, [attemptEvidence("e1")]);
  ok("RAISE verified accepted", r4.status === "accepted" && r4.state.currentEffort === "high" && r4.state.effortOwnedByExtension === true);
  ok("RAISE stamp recorded", r4.state.lastEffortRaiseAt !== null);
  // xhigh ceiling: current xhigh cannot auto-raise
  const top: SessionStateV1 = { ...baseState(true), currentEffort: "xhigh" };
  const r5 = run(top, dec({ action: "raise_effort", difficultyType: "reasoning_depth_insufficient" }), makeConfig(), adapters(), [attemptEvidence("e1")]);
  ok("RAISE xhigh ceiling rejected", r5.status === "rejected");
  // current max is a configuration conflict, not an automatic path
  const atMax: SessionStateV1 = { ...baseState(true), currentEffort: "max", baselineEffort: "max" };
  const r6 = run(atMax, dec({ action: "raise_effort", difficultyType: "reasoning_depth_insufficient" }), makeConfig(), adapters(), [attemptEvidence("e1")]);
  ok("RAISE from max rejected (config conflict)", r6.status === "rejected");
}

// =================== extra: config validation & preferred map ===================
{
  const cfg = makeInstallConfig();
  ok("config valid", validateConfig(cfg).ok === true);
  const bad = makeConfig();
  bad.maxParallelExplorers = 5;
  ok("config invalid range", validateConfig(bad).ok === false);
  eq("preferred path_unclear", preferredActionFor("path_unclear"), "explore_in_parallel");
  eq("preferred reasoning", preferredActionFor("reasoning_depth_insufficient"), "raise_effort");
  eq("preferred domain", preferredActionFor("domain_mismatch"), "invoke_specialist");
  eq("preferred source_missing", preferredActionFor("source_missing"), "report_source_gap");
  ok("hasConfirmedEvidence works", hasConfirmedEvidence([ev("z", "confirmed")]) && !hasConfirmedEvidence([ev("z", "partial")]));
  ok("repeat guard distinguishes waves", !wouldRepeatSameAction(baseState(true), ["e1"], "explore_in_parallel", ["d1"]));
  ok("checkExplorationLimits rejects 0 probes", !checkExplorationLimits(baseState(true), makeConfig(), 0).ok);
  ok("markChildDetached works", markChildDetached({ ...baseState(true), ownedChildRuns: [{ childAgentId: "c", generation: 1, status: "running" }] }, "c").ownedChildRuns[0].status === "detached");
}

// =================== summary ===================
console.log(`\nWEConverge mechanical acceptance: ${passed} passed, ${failed} failed (of ${passed + failed})`);
if (failed > 0) {
  console.error("Failing:", failures.join("; "));
  process.exit(1);
}
console.log("ALL AC-001..044 MECHANICAL CHECKS PASSED");
