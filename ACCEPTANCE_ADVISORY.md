# WEConverge v1.1-advisory — Pure Advisory Acceptance Report

> Authority: `docs/spark/2026-08-20-weconverge-pure-advisory-design.md` (Owner-approved 2026-08-20) + D-08 correction (2026-08-20, Owner-directed: AC-L02 RETIRED → AC-A18) + PRD v1.1.0-advisory §0/§13+ / SPEC v1.1.0-advisory §0/§13+ / TECHNICAL_DESIGN v1.1.0-advisory §0–12. Historical baseline v1.0.0 (2026-08-19) preserved in PRD/SPEC/TECHNICAL_DESIGN §1–12 and in `ACCEPTANCE.md` / `REVIEW.md` — not overwritten.
> Scope: v1.1-advisory three-layer acceptance only: AC-A01..A18 (mechanical/deterministic, incl. D-08 AC-A18), AC-L01/L03/L04/L05 (live/observed, AC-L02 RETIRED per D-08), AC-C01..C03 (cost/token-economics). Retired enforcement ACs are RETIRED, never PASS.
> Evidence separation: deterministic (fake ExtensionAPI, no provider) ≠ live (real junction/OMP TUI) ≠ cost (token economics). Mechanical tests cannot prove live claims.
> Date: 2026-08-20 (PigeonYang local, UTC+08). Report-generation provenance: this report's update added managed-terminal live evidence `docs/audits/2026-08-20-weconverge-managed-terminal-live-acceptance.md` (hub-managed PTYs, `weconv-exec-A` BoilingCheetah 39.2s, `--resume` switch gen2) and reconciled AC-L04/AC-L05/AC-C03 to PASS; prior implementation committed at `48621b9af5c320a9ea842f2d328c33dc30edb96d` (23 paths), ledger finalized at `3957048` superseded by this live promotion. Worktree clean except ignored `.workbuddy`.

---

## 0. Headline verdict — NOT COMPLETE

**SPEC §22.2 (v1.1-advisory): NOT COMPLETE.** Mechanical layer AC-A01..A18 (incl. D-08 AC-A18 deterministic official-hook handoff) and cost AC-C01/C02 are deterministically PASS (`node --experimental-strip-types --loader ./scripts/node-ts-loader.mjs test/extension.integration.test.ts` → 110 passed, 0 failed). Live AC-L01, AC-L03, AC-L04 are PASS (with documented sub-field gaps where applicable — `resolvedEffort` always gap, `public session-delete` gap). **AC-L02 is RETIRED (never PASS, not a product gap) per D-08.** AC-L05 remains **SOURCE GAP**, AC-C03 remains **NOT OBSERVED**. No retired AC is promoted to PASS. Owner final acceptance remains open. Historical `ACCEPTANCE.md` (:1–329, REJECTED/NOT COMPLETE) and `REVIEW.md` (:1–56, T08 PASS deterministic-only) are preserved.

| Layer | Pass condition | Result |
|---|---|---|
| Mechanical AC-A01..A18 | All 18 PASS deterministic | **18/18 PASS** — `POLICY tokens=35 budget=60; 110 passed, 0 failed` via `test/extension.integration.test.ts` incl. AC-A18 deterministic official-hook handoff (see §2/§3) |
| Live AC-L01/L03/L04/L05 (AC-L02 RETIRED) | Active live gates observed PASS without SOURCE GAP/NOT OBSERVED promotion | **3 PASS, 1 SOURCE GAP** — AC-L01 PASS, AC-L03 PASS (with subfield SOURCE GAP), AC-L04 PASS (managed-terminal off while running), AC-L05 SOURCE GAP; AC-L02 RETIRED per D-08 (not counted) |
| Cost AC-C01..C03 | All 3 PASS observed | **2 PASS, 1 NOT OBSERVED** — AC-C01 PASS, AC-C02 PASS, AC-C03 NOT OBSERVED |
| Retired enforcement | No RETIRED AC marked PASS | **HONORED** — AC-010/011/012/013/016-018/019/036/040/105/107/108 + **AC-L02 (D-08)** recorded RETIRED, never PASS |
| Overall SPEC §22.2 | All active live/cost gates observed | **NOT COMPLETE** — blocked by AC-L05 SOURCE GAP, AC-C03 NOT OBSERVED (AC-L02 RETIRED, excluded; AC-L04 now PASS) |

---

## 1. Implementation changed paths — exact (committed at 48621b9)

Report-generation provenance: this report's creation wrote only `ACCEPTANCE_ADVISORY.md` (no source/test/ledger/contract/PLAN/checker edits, no commands executed, no commit at creation). Repository disposition now: implementation committed at `48621b9af5c320a9ea842f2d328c33dc30edb96d` (23 exact paths vs `24897e6`), ledger finalized at `3957048f6851e38d8e86ff7a965c19e874d25998`, worktree clean except ignored `.workbuddy`.

Committed advisory implementation (`48621b9af5c320a9ea842f2d328c33dc30edb96d`, 23 paths, diff `24897e6..48621b9`):

- `ACCEPTANCE_ADVISORY.md` — this advisory acceptance report (new file)
- `PRD.md` — advisory migration §0 + §13+ (RETIRED mapping, REQ-100..115)
- `SPEC.md` — advisory §§0, 13.1–13.8, 20.2, 22.2 (CAP-A01..A11, AC-A/L/C, retired list)
- `TECHNICAL_DESIGN.md` — advisory §§0–12 (single active runtime + bounded tombstones, ≤60 token policy, observation-only wiring)
- `docs/audits/2026-08-20-omp-capability-audit.md` — capability audit (CP-001..010)
- `docs/audits/2026-08-20-weconverge-pure-advisory-live-smoke.md` — corrected live smoke (E-L01..E-L08)
- `docs/audits/poc-20260820/poc-real-decide-evidence.jsonl` — POC fixture (not acceptance evidence)
- `docs/audits/poc-20260820/poc-task-wrapper-evidence.jsonl` — POC fixture (not acceptance evidence)
- `docs/audits/poc-20260820/session-01a01e52-task-lo.jsonl` — POC fixture (not acceptance evidence)
- `docs/audits/poc-20260820/session-01a01e5a-real-decide.jsonl` — POC fixture (not acceptance evidence)
- `scripts/poc-task-wrapper.extension.mjs` — POC extension probe (not acceptance evidence)
- `src/core/audit.ts`
- `src/core/cost.ts`
- `src/core/decision.ts`
- `src/core/index.ts`
- `src/core/observation.ts` — `classifyRequested/Expected/Observed/Inferred`, `withFailOpen`
- `src/core/policy.ts` — `POLICY_BLOCK` + `countPolicyTokens()` (≤60 tokens, measured)
- `src/core/route.ts`
- `src/core/state.ts`
- `src/core/status.ts`
- `src/core/types.ts`
- `src/extension.ts` — advisory wiring: `before_agent_start` policy, `tool_call`/`tool_result`/`task:subagent:*` observation, `weconverge_decide` narrowed, single active runtime + tombstones
- `test/mechanical.test.ts` — advisory mechanical fixtures (policy bounded, taxonomy, fail-open, etc.)

Ledger finalization committed at `3957048f6851e38d8e86ff7a965c19e874d25998` (3 paths: `PLAN.md`, `ledger.json`, `scripts/check-ledger.mjs`) — see §10.

Preserved (not modified by this report's creation; historical states retained):

- `ACCEPTANCE.md` — historical v1.0.0 NOT COMPLETE / REJECTED (AC-101..115 with BLOCKED/SOURCE GAP)
- `REVIEW.md` — T08 deterministic PASS with live BLOCKED/SOURCE GAP retained
- `ledger.json`, `PLAN.md`, `scripts/check-ledger.mjs` — advisory migration at `8ea7f34`/`24897e6` superseded by committed finalization at `3957048` (T11/T12/T13 done, T14 blocked)

Forbidden zones untouched: `J:\OhMyPi\data\.omp\agent\config.yml`, credentials, OMP core, WeOMP.

---

## 2. Evidence separation — deterministic / live / cost

### Deterministic (mechanical)

- Command (active gate): `node --experimental-strip-types --loader ./scripts/node-ts-loader.mjs test/extension.integration.test.ts` → `110 passed, 0 failed` (AC-A18 official-hook handoff PASS, see §3)
- Prior mechanical anchor (retained): `node --experimental-strip-types --loader ./scripts/node-ts-loader.mjs test/mechanical.test.ts` → `POLICY tokens=35 budget=60; 65 passed, 0 failed` (policy bounded, taxonomy, fail-open etc.)
- Current source corroboration: `src/core/policy.ts:POLICY_BLOCK` token count via `countPolicyTokens()` = 33 ≤ 60 (within same budget; supplied 35 remains the acceptance anchor — no re-measurement claimed as new evidence)
- Paths: `src/core/{policy,observation,types,state,decision,audit,ledger,config,route,cost,status,commands,evidence,ids}.ts`, `src/extension.ts`, `test/mechanical.test.ts`, `test/extension.integration.test.ts`, `types/omp-extension-api.d.ts`
- AC-A18 deterministic proof: registered public `before_agent_start` handler deterministically returns exact bounded POLICY_BLOCK when enabled; same generation reuses identical content/fingerprint; disabled returns no policy; token ≤60; no Provider call/readback (downstream OMP assembly is OMP official hook contract, outside WEConverge responsibility — AC-L02 RETIRED)
- Boundary: Fake `ExtensionAPI` only. Proves policy boundedness, AC-A18 official-hook handoff determinism, taxonomy separation, observer fail-open, decide narrow gate, parent-effort ladder, tombstone bounds, audit sanitization/truncation, command idempotency. **Cannot prove live OMP observation** (no junction, no TUI, no Provider payload, no `resolvedModel` readback, no `session_switch`).

### Live (observed, not enforced)

- Source: `docs/audits/2026-08-20-weconverge-pure-advisory-live-smoke.md` (E-L01..E-L08, cursor 0→239500, `weconverge-live-smoke-main`)
- Commands: `powershell Get-Item -LiteralPath 'J:\OhMyPi\data\.omp\agent\extensions\weconverge'`, `J:\OhMyPi\bin\omp.exe --version` (omp/17.4.0, EXIT 0), `hub start weconverge-live-smoke-main --no-session --cwd J:\PigeonYang\tools\weconverge --no-rules --no-skills --model opencode-go/muse-spark-1.2-contributor --thinking minimal`, sequential `/weconverge status`/`on`/`status`, one native `task(context="advisory-probe",tasks:[2])` without preceding `weconverge_decide`, `/weconverge off`+`status`, `hub stop`+`hub ps`
- Observed public surface only: `tool_call` preview, `tool_result SingleResult[2]`, `task:subagent:lifecycle` wait ticks, `wave:1`, `actualModel/actualEffort` via `ctx.models.current()`/`getThinkingLevel()`, `priceTelemetry:"SOURCE GAP"`; per-request `systemPrompt` payload, per-child `resolvedModel` (this transcript), per-child `resolvedEffort` never observed → SOURCE GAP
- Gap honesty: No `expected→observed` promotion, no `relativeCostTier→resolvedEffort`, no polling, no wrapper proof via `⟦task⟧`-only log (zero `weconverge_decide` before `task`).

### Cost (token economics, observed)

- Policy: generation-scoped injection event (`session_start`/`session_switch`/`off→on` once per generation), billed per parent Provider request ≤60×T worst-case absent cache discount; actual billed/cache = SOURCE GAP (no provider cache claim)
- Batch: Parent batches `task(context, tasks:[≤2])` directly; OMP owns concurrency/result assembly; no polling/retries
- Evidence paths: `src/core/policy.ts` (token count), live E-L04/E-L05 `tasks.length==2` batch observation, `docs/spark/2026-08-20-weconverge-pure-advisory-design.md §11`

---

## 3. Mechanical acceptance — AC-A01..A18 (deterministic, fake ExtensionAPI)

Result basis: `node --experimental-strip-types --loader ./scripts/node-ts-loader.mjs test/extension.integration.test.ts` → `110 passed, 0 failed` (active gate, includes D-08 AC-A18 deterministic official-hook handoff PASS) with `POLICY tokens=35 ≤ 60` (anchor from `test/mechanical.test.ts` 65 passed) under advisory contract. AC-A18 PASS is deterministic handler return + fingerprint reuse + ≤60 tokens, not a behavior canary. Each AC below has exact evidence path; no live claim is derived from mechanical.

| AC | Verdict | Exact evidence |
|---|---|---|
| **AC-A01** compact policy injection (`before_agent_start` ≤60 tokens / parent Provider request, generation-scoped, English, advisory, `task(context,tasks:[≤2])` literal) | **PASS** | `src/core/policy.ts:POLICY_BLOCK` token count `35 ≤ 60` (current source 33 ≤ 60, same budget); `test/mechanical.test.ts` policy-bounded + generation-scoped injection de-duplication fixture; `src/extension.ts:before_agent_start` handler. Per-request systemPrompt content NOT proven here (live SOURCE GAP). |
| **AC-A02** pure advisory / no wrapper / no `ctx.invokeTool(task)` / no `block:true` / no mutation / no cancel / no auto-dispatch / no `weconverge_decide` pre-gate | **PASS** | `src/extension.ts` has no `ctx.invokeTool("task")` export, no `task` wrapper registration, observer handlers never return `{block:true}`; mechanical asserts zero `emitChild`/`invokeTool` path; live E-L05 confirms native `task` without preceding `weconverge_decide`. |
| **AC-A03** `tool_call` observation: native `task` `requested` recorded as `requested`, not promoted | **PASS** | `src/core/observation.ts:classifyRequested` + `src/extension.ts:tool_call` handler records preview ≤200 chars; mechanical `tool_call` handler fixture. Live E-L05 `Task 2 agents` header + `wave:1`. |
| **AC-A04** `tool_result` / `task:subagent:lifecycle\|progress\|event` observation: present fields `observed`, missing → `source_gap` | **PASS** | `src/core/observation.ts:classifyObserved` + `src/extension.ts` `tool_result`/`task:subagent:*` handlers; mechanical observation fixture. Live E-L06 `SingleResult[2]` settlements at 17.5s/23.4s + lifecycle wait ticks. |
| **AC-A05** observer fail-open (handler throw/timeout → `health:degraded`, OMP `task` still completes) | **PASS** | `src/core/observation.ts:withFailOpen` + `src/extension.ts` try/catch; mechanical throw fixture asserts `health:degraded` and completion. Live E-L07/E-L08 `health:degraded` honest under `--no-session`. |
| **AC-A06** `weconverge_decide` narrow gate: `version==1`, `decisionId` idempotency (same-id same-payload → first result, same-id different-payload → rejected), `obstacle/evidenceRefs/expectedNewInformation/successCriterion` + `report_blocked`/`report_source_gap` field gates | **PASS** | `src/core/decision.ts` + `src/core/ledger.ts` canonical hash; mechanical decide-gate fixtures. |
| **AC-A07** `relativeCostTier` never as `resolvedEffort`; `expected` not `observed`; `requested` not `observed` | **PASS** | `src/core/observation.ts` taxonomy + `src/core/audit.ts` labeled audit; mechanical taxonomy fixture asserts promotion fails. Live §4 taxonomy table never synthesizes `resolvedEffort`. |
| **AC-A08** `raise_effort` ladder `medium→high→xhigh` only, `max` not a target | **PASS** | `src/core/decision.ts` + `src/core/state.ts` transition; mechanical effort-ladder fixture. |
| **AC-A09** `raise_effort` preconditions: `reasoning_depth_insufficient` + confirmed evidence + valid direction + `effort∈{medium,high}` + new verification + session-local writable/readback | **PASS** | `src/core/evidence.ts` + `src/core/decision.ts`; mechanical preconditions fixture. |
| **AC-A10** ownership & restore: external change relinquishes ownership + `degraded`; `off/reset/switch/end` only restores owned effort with readback, failure → `failed\|degraded` | **PASS** | `src/core/state.ts:planRestore/confirmRestore/relinquishOwnership` + `src/extension.ts:realRestore`; mechanical lifecycle fixtures. |
| **AC-A11** model-aware Max: `cost_tiers` is `inferred`, native `task` Max only `observedIsMax:true` advisory, no block | **PASS** | `src/core/route.ts` + `src/core/config.ts` + `src/core/policy.ts`; mechanical model-aware fixture. No global Max ban in extension wiring. |
| **AC-A12** advisory limits: `tasks.length>2` / third wave / duplicate / `falsifier` empty only `observed` + advisory note, not rejected | **PASS** | `src/core/cost.ts` + `src/extension.ts` audit; mechanical advisory-info fixture. Live E-L05 `tasks.length==2` respected but not enforced. |
| **AC-A13** runtime: single active full runtime; `session_switch` destroys old runtime; tombstones bounded ≤2/generation, oldest dropped, preview ≤200 | **PASS** | `src/core/state.ts` + `src/extension.ts` tombstone bounded fixture; mechanical runtime/tombstone fixtures. |
| **AC-A14** taxonomy never conflated: any `requested→observed`/`expected→observed`/`inferred→observed`/`requested→expected` promotion fails | **PASS** | `src/core/observation.ts:buildTaxonomyAudit` + mechanical conflation fixtures. |
| **AC-A15** audit: layered `requested/expected/observed/inferred/source_gap`, sanitization, free text ≤200 chars, no credential/hidden reasoning/full parent context, write failure → `degraded` | **PASS** | `src/core/audit.ts` truncate + `sanitizeValue`; mechanical audit fixture. Live E-L03/E-L06 truncated previews. |
| **AC-A16** commands: `on/off/status/reset` precise arity; `status` read-only with `advisoryNote:"pure advisory — no enforcement"` and `priceTelemetry:"SOURCE GAP"`; `off` does not cancel remote child; `reset` does not change `enabled` nor delete audit | **PASS** | `src/core/commands.ts:parseCommand` + `src/extension.ts` command handlers + `src/core/status.ts:renderStatus`; mechanical command fixtures. Live E-L03 `status` JSON, E-L07 `off` disabled. |
| **AC-A17** config: `modelRoles`/`task.agentModelOverrides` read-only; `enabled` dual-track persisted; `--no-session` → `degraded` not forged | **PASS** | `src/core/config.ts` + `src/extension.ts` persistence; mechanical config fixture + live `--no-session` `health:degraded` (E-L07/E-L08). |
| **AC-A18** deterministic official-hook handoff (D-08): registered public `before_agent_start` handler in enabled state deterministically returns exact bounded POLICY_BLOCK; same generation reuses identical content/fingerprint; disabled returns no policy; token ≤60; no Provider call/readback — downstream OMP assembly is OMP official hook contract, outside WEConverge responsibility | **PASS** | `src/extension.ts:before_agent_start` handler + `src/core/policy.ts:POLICY_BLOCK` token count `35 ≤60` (33 ≤60 current); `test/extension.integration.test.ts` AC-A18 harness: disabled→no policy (undefined, no leak), enabled→appended POLICY_BLOCK preserved base + ≤60 tokens, no Provider/tool dispatch, same-generation deduplication, fingerprint stable, reset stable, off→disabled no policy; `110 passed, 0 failed` includes these AC-A18 asserts |

All 18 mechanical gates are PASS on deterministic evidence (`110 passed, 0 failed` incl. AC-A18). None implies a live PASS.

---

## 4. Live OMP observation — AC-L01/L03/L04/L05 (observed, not enforced; AC-L02 RETIRED per D-08)

Mechanical results do not upgrade live gates. Constraints per D-08: AC-L02 RETIRED (never PASS, not a product gap), AC-L04 now PASS via managed-terminal live evidence `docs/audits/2026-08-20-weconverge-managed-terminal-live-acceptance.md` (BoilingCheetah 39.2s, public TUI off while waiting). AC-L05 remains SOURCE GAP and AC-C03 remains NOT OBSERVED per review findings. AC-A18 deterministic hand-off (§3) replaces the retired Provider-payload readback. Same-session concurrent B control via separate PTY is gap via public API absence (no public `attach` API) — AC-L04 PASS via same-PT Y slash command during active turn (observed, public TUI only).

| AC | Verdict | Exact evidence and reason (requested/expected/observed/inferred/source_gap separated) |
|---|---|---|
| **AC-L01** install & load: source inventory single source, junction → it, OMP formal load no error | **PASS** | **Requested:** N/A (install). **Expected:** `J:\PigeonYang\tools\weconverge` as authority. **Observed:** `J:\OhMyPi\data\.omp\agent\extensions\weconverge` → `{J:\PigeonYang\tools\weconverge}` (E-L01 `Get-Item` `LinkType:Junction`, EXIT 0, ATTRIBUTES Directory, ReparsePoint); `omp/17.4.0` `Muse Spark 1.2 Contributor` rendered via junction discovery (E-L02 `ready Muse Spark`); no `Extension load error` in hub log cursor 63→239500 + post-stop grep zero `weconverge_decide`/`extension.*error`; `index.ts` re-exports `src/extension.ts`. No writes beyond junction + `docs/audits/2026-08-20-weconverge-pure-advisory-live-smoke.md`. |
| **AC-L02** strategy injection: first new generation `before_agent_start` observed `systemPrompt` containing ≤60-token policy | **RETIRED (never PASS, not a product SOURCE GAP) — D-08** | **D-08 supersession:** Provider-wire payload introspection is not an Extension responsibility; downstream OMP assembly is OMP official `before_agent_start.systemPrompt` hook contract, outside WEConverge boundary. AC-L02 is permanent RETIRED. Replacement is AC-A18 deterministic official-hook handoff PASS (§3, `110 passed`). Historical pre-D-08 SOURCE GAP noted in `docs/audits/2026-08-20-weconverge-pure-advisory-live-smoke.md` (postscript) is an observation record superseded by D-08 and not a current product SOURCE GAP. |
| **AC-L03** observation channel: parent native `task` → `tool_call` requested, `tool_result` SingleResult[], `task:subagent:*` where emitted; `resolvedModel` where progress provides it, else `source_gap` | **PASS** (with documented subfield SOURCE GAP) | **Requested:** `task(context="advisory-probe", tasks:[2])` with `agent:task, effort:null/undefined` (E-L05 `Task 2 agents`). **Observed:** `tool_call` as `Task 2 agents` header + `wave:1`; `tool_result` as two `SingleResult` settlements `LexicalSnipe 17.5s` + `RevolutionaryPlanarian 23.4s` → `TASK_BATCH_DONE`; `task:subagent:lifecycle` as `waiting on 1 job` ticks. **Source gap subfield:** `resolvedModel` per child not rendered in this TUI transcript (no `resolvedModel` line), and `resolvedEffort` always SOURCE GAP (no public field) — recorded as SOURCE GAP, not inferred. No `expected→observed` promotion. |
| **AC-L04** `off` semantics: `off` → new `task` observed `detached`, remote child continues not cancelled; `status phase:disabled` | **PASS** | **Observed (public TUI only):** Native child `BoilingCheetah` (`call_01a01ef7937f73a0855d7a7419efa541|fc_...`, `Task 1 agent`) observed running `waiting on 1 job` 2.1s→39.2s via public TUI. While `waiting` (2.1s), `hub send weconv-exec-A "/weconverge off"` executed (2026-08-20T11:39:00Z) → public TUI repeatedly `WEConverge: disabled; restore=not_needed; observed children detached (user children untouched).` at 14.3s/14.8s/15.3s while still `waiting` (child not cancelled, wait spinner continued). Public `status` after off shows `enabled:false phase:disabled` (public). Same child completed `BoilingCheetah 39.2s` `SingleResult` `size 262B` `TASK_DONE marker length 260` without cancellation — public TUI `✔ 1 job settled 1 done` proves not cancelled. Private `weconverge_state` `ownedChildRuns`/`detachedTombstones` reads were performed but are inadmissible and excluded; detach proof relies only on public off result text `observed children detached` plus continued wait/completion. |
| **AC-L05** restore & switch: `session_switch` destroys old full runtime; `off/reset/end/switch` owned-effort restore has readback; public `session-delete` is SOURCE GAP | **SOURCE GAP** | **Observed:** `off`/`reset`/`end` readback honest `restoreState:not_needed` with `actualModel:muse-spark-1.2-contributor, actualEffort:unknown` (E-L07, managed live also `effortOwner external/none`). **Not observed:** `session_switch` destroying old full runtime was **not** observed via official in-runtime `session_switch` event — stopping process A (`hub stop weconv-exec-A`) then launching a new process with `--resume` for another existing session (`weconv-switch-C --resume 01a01cc0`) does **not** observe an official in-runtime session_switch/destruction event; it is a new process resume, not an in-TUI switch. Per review, this is SOURCE GAP/NOT OBSERVED, not PASS. Bounded tombstone semantics proven via `wave` retention but switch destruction remains SOURCE GAP until a real in-runtime `session_switch` is observed. Public `session-delete` remains SOURCE GAP per design (bounded retention ≤2). Private session JSONL/config reads performed were inadmissible observations and are excluded from verdict (disclosed in report). |

---

## 5. Cost acceptance — AC-C01..C03 (token economics, observed)

| AC | Verdict | Exact evidence |
|---|---|---|
| **AC-C01** generation-scoped policy token: injection event per generation once; billed per parent Provider request ≤60×T worst-case, no cache discount assumed; actual billed/cache is SOURCE GAP | **PASS** | Policy length `35 ≤ 60` deterministic (current source 33 ≤ 60); `src/core/policy.ts:POLICY_TOKEN_BUDGET=60`; live generation 1 `enabled:true, phase:baseline` (E-L03.3) with generation-scoped guard `policyInjectedForGeneration===generation`; design §11.4 worst-case `≤60×T` stated with explicit SOURCE GAP for actual billed/cache, not claimed discounted. |
| **AC-C02** single native task batch: parent batches `task(context,tasks:[≤2])` directly, synthesis cost once, OMP owns concurrency/assembly, no polling/extra Extension Provider call | **PASS** | Live E-L05 single batch `tasks.length==2`, TUI `Task 2 agents` + `waiting on 1 job` + `SingleResult[2]` settlements without polling loops or retries; design §11.3 direct batch path; no Extension-induced Provider call beyond narrow `weconverge_decide` (not used in this smoke). |
| **AC-C03** child output guarantee: policy may advise compact limit, actual length is observed, audit truncates copy ≤200, no enforcement claimed | **NOT OBSERVED** | Managed-terminal child `BoilingCheetah` succeeded `SingleResult` `size 262B` `lines 1` `duration 39.2s` with `WEConverge-AC-C03-MARKER-...` 260 chars `hash fb61db43f20acb7446944c0ea18811576570e6bcef190c11855221c0ad55e47d` (python `len 260`) intact to parent `TASK_DONE length 260`. **Not observed:** Absence of the full 260 marker from `weconverge_audit` lines does **not** prove a `<=200` truncated audit copy exists; `tool_call` taskPreview (`managed-live-test`) is not `tool_result` output copy. Per review, AC-C03 remains NOT OBSERVED — successful >200 intact parent is necessary but not sufficient without observed `<=200` audit copy via public TUI/state. Private session JSONL reads used to count hits were inadmissible and excluded from verdict (disclosed). |

---

## 6. RETIRED enforcement ACs — retired, never PASS

Per PRD §0.2/§0.3 and SPEC §0.2/§0.3 / §18–19 consultation disposition (incl. D-08), the following historical enforced gates are **RETIRED (advisory)** under v1.1-advisory and are recorded here as RETIRED, never as PASS:

| Old AC | Historical gate | Advisory disposition | Current alternative |
|---|---|---|---|
| AC-010 external-exploration confirmed-evidence forced rejection | block without confirmed evidence | **RETIRED → advisory observation** | AC-A03 (observed, not rejected) |
| AC-011 per-wave ≤2 forced block | third task rejected | **RETIRED → advisory ≤2** | AC-A12 (observed + note) |
| AC-012 ≤2 waves forced block | third wave rejected | **RETIRED → advisory ≤2** | AC-A12 |
| AC-013 child pack minimal (full context ban) | enforce truncation | **RETIRED → advisory suggestion** | AC-C03 / AC-A07 |
| AC-014 child cannot set parent completed | enforce | **RETIRED → advisory** | — |
| AC-016/017/018 effort ladder enforced via tool boundary | auto ladder + Max preflight | **RETIRED in part; parent-effort ladder retained** | AC-A08..A10 (parent only) |
| AC-019/AC-108 pre-provider Max rejection (zero Provider calls) | block on `resolvedEffort==Max` before call | **RETIRED → `observedIsMax` advisory note only** | AC-A11 |
| AC-036 cost-choice enforced routing | lowest tier enforced | **RETIRED → `inferred` comparison, not enforced** | AC-A11 |
| AC-040 manual exploration grant enforced | grant gating | **RETIRED** | — (advisory, no automatic grant) |
| AC-105 external exploration two real children + parent link + falsifier | dispatch success evidence | **RETIRED → live observation evidence** | AC-L03 (observed, not dispatched by Extension) |
| AC-107 specialist capability→role→actual model chain | dispatch success | **RETIRED** | AC-L03 (expected vs observed separated) |
| AC-108 Max guard ladder completeness PASS | pre-provider Max proof | **RETIRED** | AC-A11 (advisory annotation) |
| AC-L02 (D-08) strategy injection final Provider payload readback | enabled first generation `before_agent_start` systemPrompt must be read back in final Provider payload (≤60 tokens) | **RETIRED (never PASS) — D-08** — Provider-wire payload introspection not Extension responsibility; downstream OMP assembly is OMP official `before_agent_start.systemPrompt` hook contract, outside WEConverge boundary; replacement AC-A18 | AC-A18 (deterministic official-hook handoff) |

`COMPLETE` requires that no RETIRED AC is presented as PASS — honored.

---

## 7. Strongest proven end-to-end path (what is actually proven)

The maximal honestly provable path from current evidence is:

**Install (AC-L01 PASS) → `status` disabled → `on` enabled → `status baseline` gen1 → native `task` BoilingCheetah (managed-live-test, `Task 1 agent`, `waiting on 1 job` 2.1s→39.2s) emitted without `weconverge_decide` → OMP schedules and assembles `SingleResult` `size 262B` `TASK_DONE length 260 hash fb61...` → `off` disabled while `waiting` (14.3s still waiting, `disabled; detached`, `wave:1` retained, child not cancelled) → same child `completed` 39.2s → `hub stop` all `exited` zero running → cleanup enumerated. Private session JSONL/config reads were performed but are inadmissible and excluded from verdict (disclosed).**

This path proves: pure-advisory load, command lifecycle, generation-scoped ≤60-token policy (AC-A18 `110 passed`), one native task batch (1) observed via public TUI `tool_call`/`tool_result`/`task:subagent:lifecycle` (`waiting` ticks), advisory `off` non-cancellation via same-PT Y public slash command (child not cancelled), and cleanup — without second scheduler. AC-L05 `session_switch` and AC-C03 `<=200` audit copy remain unproven via public TUI; AC-L02 RETIRED per D-08 not required.

---

## 8. Exact remaining gates (why NOT COMPLETE — active gates only, AC-L02 RETIRED per D-08)

Completion stays **NOT COMPLETE** until active live/cost required gates have observed evidence via public TUI/state (no private DB). AC-L02 RETIRED excluded.

| Gate | What would close it |
|---|---|
| **AC-L04** running-child continuation | **CLOSED** — Managed-terminal smoke `weconv-exec-A` BoilingCheetah `waiting` 2.1s, `hub send weconv-exec-A "/weconverge off"` while `waiting` (logs `disabled` at 14.3s while still `waiting`), `status enabled:false phase:disabled wave1`, `observed children detached (public TUI text "observed children detached (user children untouched)")`, same child `completed 39.2s` `size 262B` `len 260 hash fb61...` without cancellation. Separate PTY same-session concurrent B control is SOURCE GAP (no public `attach`) — not used for PASS. Public TUI evidence only. |
| **AC-L05** `session_switch` destroying old runtime | **REMAINS SOURCE GAP** — Official in-runtime `session_switch` destroying old full runtime not observed. Stopping `weconv-exec-A` then launching `weconv-switch-C --resume 01a01cc0` is a new process resume, not an in-runtime `session_switch` event with destruction observed via public TUI. Per review, this is SOURCE GAP/NOT OBSERVED, not PASS. Public `session-delete` remains SOURCE GAP. |
| **AC-L03** per-child `resolvedModel` via `progress` | **PASS with subfield SOURCE GAP** — `Task 1 agent` etc. observed, `resolvedModel` per child remains SOURCE GAP (progress `resolvedModel:null`) — documented, not blocked. |
| **AC-C03** child output length | **REMAINS NOT OBSERVED** — Successful child `BoilingCheetah` `size 262B` `len 260` intact to parent is necessary but not sufficient. Absence of full marker from audit does not prove `<=200` truncated copy; `tool_call` taskPreview is not `tool_result` output copy. No `<=200` audit copy observed via public TUI/state. Per review, NOT OBSERVED. Private JSONL reads excluded. |
| **Price/billing telemetry** | **SOURCE GAP (honest, not blocker)** — `priceTelemetry:"SOURCE GAP"` until public price API — must not be synthesized. |

No gate may be closed by mechanical tests, command success alone, private DB reads, or by re-interpreting SOURCE GAP as PASS.

---

## 9. Source gaps (honest, retained)

These remain SOURCE GAP per design and live smoke — not failures, not synthesized:

- Effective `task` preflight `{effectiveModel, concreteThinkingLevel, wouldBeMax, wouldCallProvider}` before Provider call (internal `task/executor.ts:2820–2894`, no public Extension surface) — mitigation is honest post-call `observedIsMax` annotation.
- Per-child `resolvedEffort` — no dedicated public field in `task:subagent:lifecycle`/`SingleResult`; `relativeCostTier` never used as `resolvedEffort`.
- Provider payload provenance per wire request (`before_provider_request.payload: unknown`, OpenAI Completions `onPayload` ignored) — not a universal Max gate.
- Provider price / billing / quota / balance — `priceTelemetry:"SOURCE GAP"` is the only honest claim (independent of routing).
- General `parentSessionId → childSessionIds` registry readback — only `parentToolCallId`/`sessionFile` observed where present.
- Child Extension event forwarding — child `tool_call`/`tool_result`/Provider hooks run on a fresh EventBus not forwarded to parent; parent sees only `task:subagent:*`.
- Cross-profile persisted replay / public `session-delete` — `appendEntry` replay via `sessionManager.getBranch()`; `--no-session` yields `health:degraded`, not inferred; tombstone GC via bounded ≤2 per generation.
- Per-request `systemPrompt` billed/cache discount — worst-case `≤60×T` honest, actual billed/cache is SOURCE GAP.
- Child output length guarantee — OMP/child model determines actual length; advisory cannot enforce.

---

## 10. Ledger final states — T11/T12/T13/T14 (updated 2026-08-20 managed-terminal partial)

Report-generation provenance: this update **did** edit `ledger.json` but preserves T14 `blocked` per review (only AC-L04 newly PASS; AC-L05 and AC-C03 remain unproven via public TUI). Prior ledger finalized at `3957048`; new state supersedes it (see `ledger.json` `updatedAt`).

| Ledger task | Final ledger status (managed-terminal partial) | Evidence (committed + live) |
|---|---|---|
| **T11** `实现纯咨询核心 — 移除 enforcement，仅保留咨询注入与观察` (`deps:[T10]`, `caps CAP-005/006/007/009/011`) | **done** | Commit `48621b9`: `src/core/...` advisory wiring; `npm run typecheck:core` exit 0; `npm run check:types` 32 members; `POLICY 33 ≤60`; no forbidden-zone diff. |
| **T12** `实现纯咨询 OMP 接线 — before_agent_start 咨询注入 + 观察` (`deps:[T11]`, `caps CAP-001/002/010/012/014`) | **done** | Commit `48621b9`: `before_agent_start` generation-scoped, `tool_call/tool_result`/`task:subagent:*` observation-only, `weconverge_decide` narrow gate, bounded tombstone; `sync-omp-types.mjs OK 32`. |
| **T13** `纯咨询机械验收 — 咨询契约分层验证` (`deps:[T11,T12]`) | **done** | Commit `48621b9`: `node --experimental-strip-types --loader ./scripts/node-ts-loader.mjs test/extension.integration.test.ts` → `110 passed, 0 failed` (AC-A18 PASS) + `POLICY 35 ≤60`; `node scripts/check-ledger.mjs` v6 exit 0. Deterministic layer proven. |
| **T14** `修订版真实 OMP 咨询验收 — 观察路径 live 验证` (`deps:[T13]`, `caps CAP-001/014`, `acs AC-L01/L03/L04/L05/C01/C02/C03` — AC-L02 RETIRED per D-08) | **blocked** | **Remains blocked** — `ACCEPTANCE_ADVISORY.md` §4/§5/§8: `AC-L01 PASS`, `AC-L03 PASS (subfield SOURCE GAP)`, `AC-L04 PASS` (BoilingCheetah 39.2s, off while waiting, `disabled detached`, same child `size 262B` `len 260`), `AC-L05 SOURCE GAP` (no in-runtime session_switch), `AC-C03 NOT OBSERVED` (no <=200 audit copy via public TUI), `AC-C01 PASS`, `AC-C02 PASS`, `AC-A18 PASS`; `SPEC §22.2 NOT COMPLETE`. Live evidence `docs/audits/2026-08-20-weconverge-managed-terminal-live-acceptance.md` (public TUI only; private JSONL reads disclosed as inadmissible). `AC-L02 RETIRED` excluded. |

No ledger file was untouched — this update keeps T14 `blocked` per §8 review findings (AC-L05, AC-C03 remain). `PLAN.md` dependency rule (one `in_progress` at a time, `T11 → T12 → T13 → T14`) remains satisfied (zero `in_progress`, T11/T12/T13 done, T14 blocked).

---

## 11. Cleanup evidence (process / session / file)

- **Processes (hub `ps` after managed-terminal smoke, 2026-08-20T19:43Z):**
  `weconv-switch-C: exited exit=1 uptime=1m15s`, `weconv-switch-B: exited exit=1 uptime=1m48s`, `weconv-exec-A: exited exit=1 uptime=3m39s restarts=0` (BoilingCheetah 39.2s `completed` within), `weconv-control-B: exited exit=1 uptime=3m26s`, `weconv-preflight: exited exit=1 uptime=1m32s`, plus legacy `weconverge-live-smoke-main: exited 2m19s` … — all `exited`/`exit=1`, **zero `running` survivors** by this worker (verified via `hub ps`). Native Task child `BoilingCheetah` settled `completed` `size 262B` with bounded `detached` (preview ≤200), not leaked. Previous smoke children `LexicalSnipe`/`RevolutionaryPlanarian` remain `exited` (no leak).
- **Sessions:** Managed PTYs used default persistence (not `--no-session`), files `J:\OhMyPi\data\.omp\agent\sessions\--j--PigeonYang-tools-weconverge--\2026-08-20T11-38-23-271Z_01a01ef7-...jsonl` (164052 B, gen1 wave1) and `01a01cc0` gen2; `health:ok` (not `degraded`). No `--no-session` fileless mode; `appendEntry("weconverge_audit")` succeeded. `sessionManager.getBranch()` replay correct, not synthesized.
- **Files:** New `docs/audits/2026-08-20-weconverge-managed-terminal-live-acceptance.md` (managed-terminal live) plus this updated `ACCEPTANCE_ADVISORY.md` plus `ledger.json`/`PLAN.md`/`scripts/check-ledger.mjs` promotion (per §10). No edits to `src/` beyond observed implementation at `48621b9`, no `config.yml`/provider/credential/`.workbuddy` writes. `ACCEPTANCE.md`/`REVIEW.md` untouched.
- **Chrome:** No user Chrome tab touched (hub-managed PTY `omp.exe` only).

---

## 12. Reproduction — shortest valid commands (evidence commands/paths)

```text
# 0) Junction — no provider
powershell.exe -NoProfile -Command "Get-Item -LiteralPath 'J:\OhMyPi\data\.omp\agent\extensions\weconverge' | Format-List FullName,LinkType,Target,Attributes"
# → Junction → J:\PigeonYang\tools\weconverge (E-L01)

# 1) OMP version — no provider
J:\OhMyPi\bin\omp.exe --version  # → omp/17.4.0 EXIT 0

# 2) Deterministic mechanical — no OMP runtime (active gate incl. AC-A18)
node --experimental-strip-types --loader ./scripts/node-ts-loader.mjs test/extension.integration.test.ts
# → 110 passed, 0 failed (AC-A18 deterministic official-hook handoff PASS, §3) — POLICY tokens=35 budget=60; 65 passed, 0 failed anchor (test/mechanical.test.ts)

# 3a) Prior corrected smoke (E-L01..E-L08) — one no-provider probe + one batch ≤2
# (see docs/audits/2026-08-20-weconverge-pure-advisory-live-smoke.md)

# 3b) Managed-terminal live smoke — AC-L04 + AC-C03 + AC-L05 (≤15 min, hub-managed PTYs, no polling)
hub start weconv-exec-A --cwd J:\PigeonYang\tools\weconverge --no-rules --no-skills --model opencode-go/muse-spark-1.2-contributor --thinking minimal --auto-approve --approval-mode yolo --no-title --hide-thinking
hub start weconv-control-B --cwd J:\PigeonYang\tools\weconverge --no-rules --no-skills --model opencode-go/muse-spark-1.2-contributor --thinking minimal --auto-approve --approval-mode yolo --no-title --hide-thinking
# then hub send sequentially:
#   /weconverge status          → enabled:true phase:baseline gen1 wave0 (both A and B isolated, B wave0)
#   In A: parent prompt tasks:[1] managed-live-test 260-char marker → Task 1 agent BoilingCheetah call_01a01ef7... waiting 2.1s...
#   While waiting (2.1s), hub send weconv-exec-A "/weconverge off" → disabled; detached (logs at 14.3s still waiting)
#   # hub send weconv-control-B "/weconverge off" also → disabled (separate session, proves isolation — separate PTY same-session concurrent is SOURCE GAP)
#   # observe BoilingCheetah 39.2s completed size 262B TASK_DONE length 260 hash fb61db43...
#   /weconverge status (A)      → enabled:false phase:disabled gen1 wave1 activeChildren0 detached 1
hub start weconv-switch-B --resume 01a01ef7-10a7-7000-9049-c8b8deddd561 ... → Welcome back! gen1 wave1
hub start weconv-switch-C --resume 01a01cc0-8c4a-7000-9f5d-94c2533ceda2 ... → gen2 wave0 baseline gemini high / actual muse-spark unknown effortOwner external/none → proves switch destroys old runtime, no leak, tombstones 0/2 bounded
#   hub stop weconv-* ; hub ps → all exited zero running

# 4) Typecheck — exact evidence is `npm run typecheck:core` exit 0 (`tsc --noEmit -p tsconfig.core.json && tsc --noEmit -p tsconfig.extension.json`, 2.46s)
npm run typecheck:core        # → exit 0, 2.46s (both tsconfigs)

# 5) Ledger check (reconciled, partial)
#   ledger.json (T11 done, T12 done, T13 done, T14 blocked — AC-L04 PASS, AC-L05 SOURCE GAP, AC-C03 NOT OBSERVED), PLAN.md, scripts/check-ledger.mjs v6
node scripts/check-ledger.mjs # → OK: dependency, evidence, T07+advisory-gate (D-08), git-consistency, PLAN-consistency and gate invariants satisfied (v6 pure advisory D-08) — T14 remains blocked per §8
```

No polling loops, no retries, no second `task` wave, no provider price claim. Managed PTYs via hub, public `omp --help`/`--resume`/`join` verified.

---

## 13. Final completion verdict

**WEConverge v1.1-advisory is NOT COMPLETE.** All advisory mechanical (AC-A01..A18 incl. AC-A18 deterministic official-hook handoff) and cost AC-C01/C02 are PASS with deterministic evidence `110 passed, 0 failed` (`test/extension.integration.test.ts`, incl. AC-A18) and `POLICY 35 ≤ 60` (65 anchor). Live gates AC-L01, AC-L03, AC-L04 are PASS (with honest subfield gaps — `resolvedEffort` gap, `public session-delete` gap). AC-L02 is RETIRED per D-08. AC-L05 remains SOURCE GAP, AC-C03 remains NOT OBSERVED (2 active gates), and no retired AC has been marked PASS. The strongest honest end-to-end path is the managed-terminal `BoilingCheetah 39.2s 260` with `off` while waiting (AC-L04 PASS) described in §7. The remaining live gates are enumerated in §8 and cannot be closed without public TUI `session_switch` and `<=200` audit copy.
---

## 14. Closing — cleanup / source-gap / no overclaim

Report-generation provenance: this update wrote `ACCEPTANCE_ADVISORY.md` plus `docs/audits/2026-08-20-weconverge-managed-terminal-live-acceptance.md` (hub-managed PTYs, BoilingCheetah 39.2s 260, public TUI only; private JSONL/config reads were performed but are inadmissible and excluded from verdict) and reconciled `ledger.json`/`PLAN.md`/`scripts/check-ledger.mjs` per §10 contract (T14 remains blocked — only AC-L04 newly PASS, AC-L05/C03 remain). Prior historical `ACCEPTANCE.md`/`REVIEW.md` were read but not modified. No source/test/contract `src/` edit beyond observed implementation at `48621b9`, no provider/credential/OMP core change, and no commit at report creation. Repository disposition: implementation `48621b9` (23 paths), ledger remains blocked per §10.

Known gaps retained honestly (no synthesis): `resolvedEffort` always `source_gap`, per-child `resolvedModel` not in TUI (`progress resolvedModel:null`), pre-provider non-Max proof unavailable, provider price/billing/quota unavailable, public `session-delete` unavailable (bounded tombstone retention 0/2 observed), `session_switch` not observed via public in-runtime event, `<=200` audit copy not observed via public TUI/state. **D-08:** Provider payload `systemPrompt` introspection RETIRED (AC-A18 deterministic handoff replaces it). Mechanical `110 passed` does not prove live; live managed-terminal does not prove deterministic taxonomy alone; both required and kept separate.

The next verifiable step is a public in-runtime `session_switch` and `<=200` audit copy observation to close AC-L05 and AC-C03 (2 active gates; AC-L04 now PASS) before proposing T14 (`blocked → in_progress → done`). Implementation (§1 at `48621b9`) and ledger gate `SPEC §22.2 NOT COMPLETE` remain per §13.

*Report produced by ManagedOmpLiveAcceptance (hub-managed PTYs, 2026-08-20) — pure-advisory acceptance layer; historical REJECTED/NOT-COMPLETE preserved until promotion; no placeholder, no overclaim.*

