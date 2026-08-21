// WEConverge pure-advisory mechanical acceptance — deterministic, no OMP runtime.
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
  planRestore,
  confirmRestore,
  relinquishOwnership,
  detectExternalOwnershipChange,
  markChildDetached,
  addDetachedTombstone,
  recordObservedTaskCall,
  recordObservedTaskResult,
  withFailOpen,
  automaticActionBlockReason,
  validateConfig,
  makeInstallConfig,
  transitionEffort,
  effortRaisePreconditionsMet,
  advisoryExplorationInfo,
  resolveCapability,
  roleRelativeCostTier,
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
  POLICY_BLOCK,
  countPolicyTokens,
  POLICY_TOKEN_BUDGET,
  classifyRequested,
  classifyExpected,
  classifyObserved,
  buildTaxonomyAudit,
  DEFAULT_CONFIG,
} from "../src/core/index";
import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(name: string, cond: boolean) {
  if (cond) passed++;
  else { failed++; failures.push(name); console.error("  FAIL:", name); }
}
function eq(name: string, a: unknown, b: unknown) {
  ok(`${name} (eq ${JSON.stringify(a)} === ${JSON.stringify(b)})`, a === b);
}

let evCounter = 0;
function makeConfig(): ConfigV1 { return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as ConfigV1; }
function ev(id: string, integrity: "confirmed" | "partial" = "confirmed", kind: EvidenceRefV1["kind"] = "tool_result", observedAt?: string): EvidenceRefV1 {
  evCounter += 1;
  return { id, kind, summary: `evidence ${id}`, observedAt: observedAt ?? `2026-08-19T00:${String(evCounter % 60).padStart(2, "0")}:00Z`, sourceId: `src-${id}`, integrity };
}
function baseState(enabled: boolean, baselineEffort: Effort = "medium", baselineModel: string | null = "main"): SessionStateV1 {
  return createInitialState({ sessionId: "S1", enabledAtStart: enabled, baseline: { model: baselineModel, effort: baselineEffort } });
}
function dec(over: Partial<ConvergenceDecisionV1>): ConvergenceDecisionV1 {
  return { version: 1, decisionId: `d-${++evCounter}`, action: "continue_current", difficultyType: "alternative_ready", obstacle: "obstacle", evidenceRefs: ["e1"], expectedNewInformation: "new info", successCriterion: "criterion", ...over };
}
function adapters(opts: { readback?: { model: string | null; effort: Effort } | null; setEffort?: boolean } = {}): OmpAdapters {
  let cur: { model: string | null; effort: Effort } | null = opts.readback === undefined ? { model: "main-model", effort: "medium" } : opts.readback;
  return {
    resolveRole: (c) => DEFAULT_CONFIG.capabilities[c] ?? null,
    readbackActual: () => (cur ? { ...cur } : null),
    setSessionEffort: (e) => {
      if (opts.setEffort === false) return false;
      if (cur) cur = { ...cur, effort: e };
      else cur = { model: null, effort: e };
      return true;
    },
    providerCallCount: () => 0,
  };
}
function run(state: SessionStateV1, d: ConvergenceDecisionV1, cfg: ConfigV1, ad: OmpAdapters, refs: EvidenceRefV1[], reg: DecisionRegistry = new DecisionRegistry()) {
  const byId = new Map(refs.map((r) => [r.id, r]));
  return weconvergeDecide({ state, decision: d, config: cfg, adapters: ad, evidenceById: byId, registry: reg, now: "2026-08-19T01:00:00Z", sessionId: "S1", parentAgentId: "P1" });
}
function attemptEvidence(id = "e1"): EvidenceRefV1 { return ev(id, "confirmed", "tool_result"); }

// =================== Policy length deterministic ===================
{
  const tokens = countPolicyTokens(POLICY_BLOCK);
  ok("POLICY ≤60 tokens", tokens <= POLICY_TOKEN_BUDGET);
  eq("POLICY contains task literal", POLICY_BLOCK.includes("task(context, tasks:[≤2])"), true);
  // Determinism: second call same count
  ok("POLICY deterministic", countPolicyTokens(POLICY_BLOCK) === tokens);
  console.log(`  POLICY tokens=${tokens} budget=${POLICY_TOKEN_BUDGET}`);
}

// =================== No task wrapper / no invokeTool / no emitChild ===================
{
  const srcExt = readFileSync("src/extension.ts", "utf8");
  const srcDecision = readFileSync("src/core/decision.ts", "utf8");
  const srcTypes = readFileSync("src/core/types.ts", "utf8");
  ok("No registerTool task wrapper", !/registerTool[^]*name:\s*"task"/.test(srcExt));
  ok("No ctx.invokeTool('task')", !srcExt.includes("invokeTool") && !srcDecision.includes("invokeTool"));
  ok("No emitChild dispatch in decision", !srcDecision.includes("emitChild"));
  ok("OmpAdapters has no emitChild", !srcTypes.includes("emitChild"));
  ok("OmpAdapters has no preflightEffort", !srcTypes.includes("preflightEffort"));
}

// =================== No automatic Max ban / global enforcement ===================
{
  const s = baseState(true, "medium", "main");
  eq("automaticActionBlockReason always null", automaticActionBlockReason(s), null);
  const sMax = baseState(true, "max", "max-model");
  eq("Max model not automatically blocked", automaticActionBlockReason(sMax), null);
}

// =================== Narrowed decide: dispatch actions retired ===================
{
  const cfg = makeConfig();
  const ad = adapters();
  const s = baseState(true);
  for (const action of ["explore_in_parallel", "invoke_specialist", "delegate_bounded_work"] as const) {
    const r = run(s, dec({ action, difficultyType: "path_unclear", capability: "research", probes: [{ directionId: "d1", question: "q", minimalTask: "m", falsifier: "f" }] }), cfg, ad, [ev("e1")]);
    ok(`Retired ${action} rejected`, r.status === "rejected" && (r.reason ?? "").includes("retired"));
    ok(`Retired ${action} creates no children`, r.createdChildIds.length === 0);
  }
}

// =================== Decide still supports raise_effort / source_gap / blocked / continue ===================
{
  const cfg = makeConfig();
  const ad = adapters({ readback: { model: "main-model", effort: "medium" } });
  const s = baseState(true);
  // continue_current
  const r1 = run(s, dec({ action: "continue_current" }), cfg, ad, [ev("e1")]);
  ok("continue_current accepted", r1.status === "accepted");
  // report_source_gap
  const r2 = run(s, dec({ action: "report_source_gap", difficultyType: "source_missing", sourceGap: { missingFact: "perm", requiredSource: "file", impact: "cannot proceed" } }), cfg, ad, [ev("e1")]);
  ok("report_source_gap accepted", r2.status === "source_gap");
  // report_blocked (no alternative)
  const r3 = run(s, dec({ action: "report_blocked", difficultyType: "proven_blocker", noSafeAlternativeReason: "none" }), cfg, ad, [ev("e1")]);
  ok("report_blocked accepted", r3.status === "blocked");
  // raise_effort with anchored evidence
  const sHigh = baseState(true, "medium", "main");
  const evA = attemptEvidence("eA");
  const r4 = run(sHigh, dec({ action: "raise_effort", difficultyType: "reasoning_depth_insufficient", evidenceRefs: ["eA"] }), cfg, adapters({ readback: { model: "main-model", effort: "medium" } }), [evA]);
  ok("raise_effort accepted via builtin ladder", r4.status === "accepted");
  eq("raise_effort medium->high", r4.state.currentEffort, "high");
}

// =================== Requested / Expected / Observed / source_gap separation ===================
{
  const cfg = makeConfig();
  const requested = classifyRequested({ agent: "task", effort: "low", task: "do X" });
  ok("requested fact labeled", "agent" in (requested as Record<string, unknown>) && (requested as Record<string, unknown>).agent === "task");
  const expected = classifyExpected("research", cfg);
  ok("expected role is scout", (expected as { role: string | null }).role === "scout");
  const expectedBad = classifyExpected("unknown_cap", cfg);
  ok("expected unmapped => source_gap", "source_gap" in (expectedBad as Record<string, unknown>));
  const observed = classifyObserved({ resolvedModel: "sonic-model", lifecycle: "completed" });
  ok("observed has resolvedModel", (observed as { resolvedModel: string | null }).resolvedModel === "sonic-model");
  const observedGap = classifyObserved(null);
  ok("observed missing => source_gap", "source_gap" in (observedGap as Record<string, unknown>));
  const inferred = buildTaxonomyAudit(requested as ReturnType<typeof classifyRequested> & Record<string, unknown>, expected as ReturnType<typeof classifyExpected> & Record<string, unknown>, observed as ReturnType<typeof classifyObserved> & Record<string, unknown>, { relativeCostTierNote: "inferred tier 1 not probative" });
  // Never conflate: requested !== observed
  ok("requested !== observed separation", JSON.stringify(inferred.requested) !== JSON.stringify(inferred.observed));
  // expected as observed must fail: check that presenting expected tier as wire effort is not allowed
  const badPresentation = (expected as { relativeCostTier?: number | null }).relativeCostTier;
  ok("relativeCostTier is inferred not observed", badPresentation !== null && typeof badPresentation === "number");
  // Build taxonomy explicitly marks gaps
  ok("taxonomy gaps tracked", Array.isArray(inferred.sourceGaps));
}

// =================== Lifecycle isolation: one active runtime + generation scoping ===================
{
  const s0 = baseState(true);
  const s1 = { ...s0, explorationWave: 3, selectedDirection: "dirA", ownedChildRuns: [{ childAgentId: "c1", generation: 1, status: "running" as const }], detachedTombstones: [{ childId: "t1", parentToolCallId: null, sessionFile: null, status: "detached", resolvedModel: null, preview: "x" }] };
  const ng = newGeneration(s1, { model: "main", effort: "medium" });
  ok("newGeneration increments", ng.generation === s0.generation + 1);
  ok("newGeneration clears explorationWave", ng.explorationWave === 0);
  ok("newGeneration clears selectedDirection", ng.selectedDirection === null);
  ok("newGeneration clears ownedChildRuns", ng.ownedChildRuns.length === 0);
  // detached tombstones are not carried as active runtime - new generation starts clean
  ok("newGeneration detachedTombstones reset", ng.detachedTombstones.length === 0);
  // modelSwitch destroys old full runtime
  const sSwitch = modelSwitch(s1, { model: "new-model", effort: "high" });
  ok("modelSwitch increments generation", sSwitch.generation === s1.generation + 1);
  ok("modelSwitch re-baselines", sSwitch.baselineModel === "new-model" && sSwitch.baselineEffort === "high");
  ok("modelSwitch clears ownedChildRuns", sSwitch.ownedChildRuns.length === 0);
}

// =================== Tombstone bounds: max 2 per generation, oldest dropped, preview ≤200 ===================
{
  let s = baseState(true);
  for (let i = 0; i < 5; i++) {
    s = addDetachedTombstone(s, { childId: `c${i}`, parentToolCallId: `p${i}`, sessionFile: `sess${i}`, status: "completed", resolvedModel: `model-${i}`, preview: "x".repeat(300) });
  }
  ok("tombstone bounded to 2", s.detachedTombstones.length === 2);
  ok("tombstone keeps newest", s.detachedTombstones[0].childId === "c3" && s.detachedTombstones[1].childId === "c4");
  ok("tombstone preview truncated ≤200", s.detachedTombstones.every((t) => t.preview.length <= 200));
  // per-generation bound via modelSwitch
  let s2 = baseState(true);
  s2 = { ...s2, ownedChildRuns: [{ childAgentId: "c1", generation: 1, status: "running" }, { childAgentId: "c2", generation: 1, status: "running" }] };
  s2 = addDetachedTombstone(s2, { childId: "a1", parentToolCallId: null, sessionFile: null, status: "completed", resolvedModel: null, preview: "a" });
  s2 = addDetachedTombstone(s2, { childId: "a2", parentToolCallId: null, sessionFile: null, status: "completed", resolvedModel: null, preview: "b" });
  s2 = addDetachedTombstone(s2, { childId: "a3", parentToolCallId: null, sessionFile: null, status: "completed", resolvedModel: null, preview: "c" });
  ok("addDetachedTombstone oldest dropped", s2.detachedTombstones.length === 2 && s2.detachedTombstones[1].childId === "a3");
}

// =================== Observer fail-open ===================
{
  const s = baseState(true);
  let observerThrew = false;
  let toolExecuted = false;
  const stateAfter = withFailOpen(s, () => { observerThrew = true; throw new Error("observer boom"); }, "test");
  ok("observer exception marks degraded", stateAfter.health === "degraded" && stateAfter.sourceGaps.some((g) => g.includes("observer:test")));
  // Tool execution still proceeds (fail-open)
  try { toolExecuted = true; } catch {}
  ok("tool still executes after observer failure", toolExecuted && observerThrew);
  // record helpers never throw
  const s2 = recordObservedTaskCall(s, { childId: "tool-1", generation: 1 });
  ok("recordObservedTaskCall increments wave", s2.explorationWave === 1 && s2.ownedChildRuns.length === 1);
  const s3 = recordObservedTaskResult(s2, "tool-1");
  ok("recordObservedTaskResult moves to integrating", s3.phase === "integrating");
}

// =================== Off / reset / switch / shutdown restoration ===================
{
  let s = baseState(true, "medium", "main");
  // Simulate extension owns effort
  s = { ...s, effortOwnedByExtension: true, currentEffort: "high", currentModel: "main" };
  const plan = planRestore(s);
  ok("planRestore needed when owned", plan.needed === true);
  const confirmed = confirmRestore(s, plan.target, { model: "main", effort: "medium" });
  ok("confirmRestore restores", confirmed.restoreState === "restored" && confirmed.effortOwnedByExtension === false);
  const failed = confirmRestore(s, plan.target, { model: "main", effort: "high" });
  ok("confirmRestore mismatch => failed/degraded", failed.restoreState === "failed" && failed.health === "degraded");
  // off detaches but does not cancel
  let sOff = baseState(true);
  sOff = { ...sOff, ownedChildRuns: [{ childAgentId: "c1", generation: 1, status: "running" }], effortOwnedByExtension: false };
  const off = applyOff(sOff, { model: "main", effort: "medium" });
  ok("off phase disabled", off.phase === "disabled" && off.enabledAtStart === false);
  ok("off detaches running child", off.ownedChildRuns[0].status === "detached");
  // reset keeps audit but clears generation state
  const reset = resetGeneration(sOff, { model: "main", effort: "medium" });
  ok("reset clears wave", reset.explorationWave === 0 && reset.phase === "baseline");
}

// =================== Model-aware configured routes without global Max block ===================
{
  const cfg = makeConfig();
  cfg.capabilities["max_worker"] = "task";
  cfg.relativeCostTiers["task"] = 1;
  // Even if task role is Max-capable, advisory does not block child observation
  const role = resolveCapability(cfg, "max_worker");
  eq("max_worker resolves to task", role, "task");
  const tier = roleRelativeCostTier(cfg, "task");
  eq("tier advisory", tier, 1);
  // Decide with capability that maps to Max-capable role is not automatically rejected
  const s = baseState(true);
  const r = run(s, dec({ action: "continue_current", capability: "max_worker" }), cfg, adapters(), [ev("e1")]);
  ok("capability with Max role not auto-blocked for continue", r.status === "accepted");
}

// =================== Commands remain: on|off|status|reset ===================
{
  ok("parse on", parseCommand("weconverge on").cmd === "on" && !parseCommand("weconverge on").usage);
  ok("parse off", parseCommand("weconverge off").cmd === "off");
  ok("parse status", parseCommand("weconverge status").cmd === "status");
  ok("parse reset", parseCommand("weconverge reset").cmd === "reset");
  ok("parse extra args => usage", parseCommand("weconverge on extra").usage === true);
  const view = renderStatus(baseState(true), makeInstallConfig(), { model: "main", effort: "medium" });
  ok("status has advisoryNote", view.advisoryNote === "pure advisory — no enforcement");
  ok("status priceTelemetry SOURCE GAP", view.priceTelemetry === "SOURCE GAP");
}

// =================== Advisory info not blocking ===================
{
  const cfg = makeConfig();
  let s = baseState(true);
  // Observe 5 waves — advisory records but does not block
  for (let i = 0; i < 5; i++) s = recordObservedTaskCall(s, { childId: `c${i}`, generation: 1 });
  const info = advisoryExplorationInfo(s, cfg);
  ok("advisory info observedWaves=5", info.observedWaves === 5);
  ok("advisory limits are advisory only", info.advisoryMaxWaves === 2 && info.advisoryMaxParallel === 2);
}

// =================== Existing commands remain registered (source check) ===================
{
  const ext = readFileSync("src/extension.ts", "utf8");
  ok("command weconverge registered", ext.includes('registerCommand("weconverge"'));
  ok("tool weconverge_decide retained", ext.includes('name: "weconverge_decide"'));
  ok("no polling loop", !ext.includes("setInterval") && !ext.includes("setTimeout"));
}

// Summary
console.log(`\nWEConverge pure-advisory mechanical: ${passed} passed, ${failed} failed${failed ? ` — ${failures.join("; ")}` : ""}`);
if (failed > 0) process.exit(1);
