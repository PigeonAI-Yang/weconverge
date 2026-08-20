# WEConverge Pure-Extension Design — Adversarial Audit (2026-08-20)

- **Scope:** Proposed reduced architecture: no OMP patch; compact `before_agent_start` policy; expensive parent model directly issues one native `task(tasks=[≤2 probes])` call; `pi.on('tool_call')` zero-LLM mechanical governance; OMP owns execution; `tool_result` + `task:subagent:*` provide audit; child outputs compact; no polling; `weconverge_decide` optional before Task (retained only for parent-effort / source_gap / blocked / manual). Effort model-aware per-capability; no global Max ban; main-model tokens are primary cost.
- **Authority order:** `docs/spark/2026-08-19-weconverge-design.md` > `PRD.md` > `SPEC.md` > `TECHNICAL_DESIGN.md` > `PLAN.md`. This audit never lowers them; `BLOCKED`/`SOURCE GAP` are design outcomes, not implementation bugs.
- **Evidence principle:** `FACT` = public OMP source/doc proves it. `SOURCE GAP` = required fact not available via public Extension surface. `BLOCKED` = proven unavailable via public surface, must fail-closed. All OMP citations rooted at `J:/PigeonYang/github/oh-my-pi/`; WEConverge citations rooted at `J:/PigeonYang/tools/weconverge/`.
- **Method:** Read `PRD.md` v1.0.0, `SPEC.md` v1.0.0, `TECHNICAL_DESIGN.md` v1.0.0, `src/extension.ts` + `src/core/*`, `types/omp-extension-api.d.ts`, `CAPABILITY_PROBE.md`, `ACCEPTANCE.md` (SPEC §22 NOT COMPLETE/REJECTED), `REVIEW.md` (T08 PASS only deterministic; live BLOCKED/SOURCE GAP retained), `docs/audits/2026-08-20-omp-capability-audit.md` + isolated POC evidence (`poc-20260820/` – wrapper 1 child completed via `ctx.invokeTool`; real `weconverge_decide` explore blocked before Task with `routing integrity=source_gap`).
- **Constraint:** No implementation or contract edits in this audit. Maximum 15-minute window; report is partial only if truncated. Full report written to this file before return; no OMP patch, no mandatory pre-Task `weconverge_decide` reintroduced unless a fatal blocker forces it.

---

## Executive Verdict

**REVISE — not STOP, not GO.**

The reduced pure-Extension composition (parent-issued `task` + `tool_call` governance + OMP execution) is the correct fallback after the `weconverge_decide`-gated child design proved `BLOCKED` before Task. Same-name `task` wrapper entering native execution via `ctx.invokeTool` **is real** (`docs/extensions.md:319-337`; `extensions/types.ts:469-482`; `extensions/runner.ts:432-475`; POC `task` `effort:lo` → `SemanticHerring` completed in isolated profile `weconverge-poc-20260820-tmp`). `tool_call`/`tool_result` + `task:subagent:*` **are public observation surfaces** (`extensions/types.ts:824-880, 1124-1178`; `task/types.ts:58-104`).

It is **not** a drop-in that satisfies the original PRD/SPEC verbatim. Three fatal blockers and five design corrections separate the sketch from a shippable Extension:

**Fatal (must fix or accept BLOCKED):**
1. **Pre-provider non-Max proof unavailable** — no public `task.preflight` returning effective `model` + concrete `effort` after agent overrides, auth fallback, spawn policy, and ceiling mapping (`task/executor.ts:2820-2894` internal only; public `ctx.models.resolve('@task')` returns base model per `docs/extensions.md` and `extensions/types.ts:390-406`). `hi` can map to Max; `lo` is “lowest on eventual model,” not universal safe; live `@task` is Luna:max (`J:/OhMyPi/data/.omp/agent/config.yml:2-10`).
2. **Governed task ≠ accepted decision** — governance fires only when the model *chooses* to emit `task`; if the model never emits it (or emits malformed `task`), no child runs. The proposal’s “parent decides, no decide-tool gate” therefore trades one gate (`weconverge_decide` BLOCKED) for another **model-cooperation gate** (`task` not emitted). Same-name `ctx.invokeTool` also cannot be reached from `weconverge_decide` — it only wraps the native `task` of that same name (`docs/extensions.md:319-337`; `extensions/types.ts:493-504`; audit poc-real-decide `taskWrapperInvocations 0`).
3. **Child route/effort isolation** — `task:subagent:lifecycle` has no `resolvedModel`/`effort` (`task/types.ts:87-104`; `executor.ts:3100-3113`); `progress`/`SingleResult` expose `modelRole`/`resolvedModel` but **no dedicated effort field** (`task/types.ts:395-434, 471-539`); child Extension Provider hooks run on a fresh `EventBus` not forwarded to parent (`task/executor.ts:2984-3040`, `3147-3218`; `session/agent-session-events.ts:11-65`); `turn_start`+`getThinkingLevel()` is parent-session only (`agent-session.ts:5283-5292`; `agent-loop.ts:1158-1181`).

**Correctable (Revise):** wave ledger & concurrency, duplicate/evidence deduplication, recursive delegation, enabled/off/reset, audit truthfulness, and the SPEC Max-ban deletion all need explicit contract changes before approval.

Net: **approve the pure-Extension direction with a narrowed contract** (see Required Corrections). No OMP core patch is justified yet, but the current draft cannot be approved as-written — it silently removes guarantees that were fail-closed on purpose.

---

## Claim Matrix

Each claim classified `PASS` / `PARTIAL` / `BLOCKED` / `SOURCE GAP`. Severity: **FATAL** = blocks go-live until resolved; **MAJOR** = must be fixed to match PRD/SPEC or documented as explicit contract deltas; **MINOR** = maintainability/false-guarantee risk.

| # | Claimed Property | Verdict | Severity | One-line Why |
|---|---|---|---|---|
| C01 | No OMP patch needed | **PARTIAL** | MAJOR | Same-name `task` wrapper is real; `weconverge_decide→task` auto-dispatch and public preflight are still unavailable. No patch, but original SPEC §6.1 CP-001..004 remain BLOCKED for the exact v1 clauses. |
| C02 | Compact `before_agent_start` policy satisfies G-001/G-002/CAP-003 | **PARTIAL** | MAJOR | Injection itself is public and cheap (`extensions/types.ts:1037-1039` `BeforeAgentStartEventResult.systemPrompt`); parent must still *obey* it. No enforcement — if model ignores policy and never calls `task`, governance never runs. Also mutates system prompt every turn (hidden token cost — see Cost). |
| C03 | Expensive parent issues one native `task(tasks=[≤2])` and OMP owns all child scheduling/results | **PASS** | — | Executed via same-name `task` wrapper + `ctx.invokeTool` (`docs/extensions.md:319-337`; `extensions/runner.ts:432-475`); `task/index.ts:659-725`, `885-1037`; `task/executor.ts:2984-3056` creates the child and assembles `SingleResult[]`. POC wrapper proved one `lo` child lifecycle + verifiable output. |
| C04 | `pi.on('tool_call')` can enforce zero-LLM mechanical governance (wave, concurrency, Max per-capability, duplicate, evidence) | **PARTIAL** | **FATAL** (for Max) / MAJOR | `tool_call` is public, synchronous, can `block` or revise `input` before scheduling (`extensibility/shared-events.ts:294-316`; `extensions/runner.ts:1087-1141`; `wrapper.ts:145-395`). Wave/concurrency/duplicate can be enforced **at that boundary** with a ledger. **Pre-provider effective effort cannot** be proven there — `input.effort` is coarse `lo|med|hi` mapped *after* model resolution (`task/executor.ts:2878-2894`); `hi`→Max. So per-capability Max ban remains unprovable. |
| C05 | `tool_result` + `task:subagent:lifecycle|progress|event` give complete audit without polling | **PARTIAL** | MAJOR | Events are public (`extensions/types.ts:1345-1346`; `utils/event-bus.ts:3-32`); `tool_result` content/details rewritable (`extensions/runner.ts:1029-1070`). But lifecycle lacks resolved route/effort; progress lacks effort; child tool/provider hooks not forwarded. No polling needed is **true** (`pi.events` + `tool_result details`), but “complete audit” is false. |
| C06 | Child outputs compact, parent does not copy full context | **PASS** | — | Proposed passes `context` + per-item `task`; children receive minimal prompt. OMP executor stores only bounded `SingleResult.output` (no full parent transcript replay). Existing per-item `task` string is already truncated to LLM view (`docs/audits/...-omp-capability-audit.md` “120 chars” discipline). No full-copy on this path. |
| C07 | No polling — results assemble via native completion | **PASS** | — | `ctx.invokeTool` with `onUpdate` streams progress; `task:subagent:progress` is push, not poll; final assembly is `SingleResult[]` returned as `tool_result details`. `pi.events` is synchronous subscription, no query/replay needed (`utils/event-bus.ts`). |
| C08 | `weconverge_decide` not required before Task (retained only for parent-effort / source_gap / blocked / manual) | **PARTIAL** | **FATAL** (if treated as satisfaction of SPEC §9.0/CAP-005 dispatch gate) | Mechanically feasible (don’t call the tool). But SPEC §9.0/CAP-004/CAP-005 require *before* Task: evidence-anchored decision, `blocked`/`source_gap` gating, duplicate set, cost comparison, and `Max` gate — all currently BLOCKED behind `weconverge_decide`. Dropping it without replacement **deletes** those gates. Acceptable only with an explicit PRD/SPEC delta (see Required Corrections). |
| C09 | Effort model-aware per capability; no global Max ban; Max enforced per configured expected effort | **BLOCKED** | **FATAL** | No public per-child effective effort preflight exists to enforce “expected model = X ⇒ not Max.” `relativeCostTier` is user config, not probative of actual effort (`SPEC.md:432-446` explicitly warns this). Relaxing global Max ban to per-capability without a public proof **weakens** REQ-032/REQ-042/CAP-008. |
| C10 | Main-model tokens are primary cost objective; cheap children secondary | **PARTIAL** | MAJOR | Correct cost intuition, but proposal hides main-model token costs (see Cost section). `lo` children are not free — output tokens + parent synthesis still count and can dominate if parent is invoked repeatedly. |
| C11 | Session/child isolation preserves parent state, no cross-session bleed | **PARTIAL** | MAJOR | Parent session is isolated on current ExtensionAPI (`ExtensionAPI` carries one `ctx`/one `appendEntry`). Children run in separate session files (`task/executor.ts:2984-3040`). However extension memory (`state`, wave ledger) is per-process/per-session object — if not keyed by `sessionId/generation`, stale writes and off/reset races leak. `session_switch`/`session_shutdown` boundaries exist (`extensions/types.ts:1133-1146`). |
| C12 | Wave accounting (≤2 waves, ≤2 probes/wave) enforceable without polling | **PARTIAL** | MAJOR | Enforceable only with explicit durable ledger (`appendEntry`) + in-memory counter + `tool_call` block. Without that, parent can re-issue `task` in a second turn and evade counting (parent owns when to call again). `task:subagent:progress` does not count waves itself. |
| C13 | Duplicate task detection / evidence dedup | **SOURCE GAP** | MAJOR | Proposal has no `evidenceRefs` gate before Task. Same probe set reissued with trivial wording (`minimalTask` rephrased) is indistinguishable to `tool_call` unless the extension hashes normalized prompt. `wouldRepeatSameAction` (`src/core/cost.ts:76-102`) is dropped with `weconverge_decide`. |
| C14 | Recursive delegation (child can itself `task` again) contained | **PARTIAL** | MAJOR | `tool_call` fires for the parent session only. Child session gets its own ExtensionRunner with fresh handlers — intended design (`task/executor.ts:3147-3218`). Parent handler does not see child’s `task` calls. So parent wrapper **cannot** block child-recursive `task` from parent. Child must inherit a blocking policy or the executor’s `task.spawn` policy (`config/settings-schema.ts`) must disallow unbounded nesting. |
| C15 | Enabled / off / reset semantics preserved | **PARTIAL** | MAJOR | `before_agent_start` and `tool_call` can check `state.enabledAtStart`. `off` must: (1) stop policy injection, (2) stop new `task` dispatch, (3) detach running `task` children (cannot cancel them without executor policy). Concrete `setThinkingLevel`/`getThinkingLevel` exist for parent effort only (`extensions/types.ts:1279-1286`). No built-in “cancel all WEConverge children on off” API — only `task:subagent:lifecycle` cancellation per tool (`task/executor.ts:2175-2224` via Task cancel). |
| C16 | Audit truthfulness — requested vs resolved route cleanly separated, no phantom `resolvedEffort` | **PARTIAL** | MAJOR | `tool_result details` can record `requested {agent, effort}` faithfully (PASS). `resolvedModel` via `progress.resolvedModel` + `formatModelStringWithRouting` (`task/executor.ts:2884-2888`) is partial; `resolvedEffort` remains unknown without a public contract. Proposal must write `unknown`/`source_gap` honestly, not synthesize effort from model suffix. |

---

## Severity-Ranked Findings

Each finding states claim, attack, exact evidence, affected requirements, and required stance.

### F-01 — Pre-provider non-Max invariant still absent (FATAL)

**Claim attacked:** “Per-capability expected effort is enough; no global Max ban; `tool_call` can enforce Max before execution.”

**Reality:** No public `task.preflight` exists delivering `effective {model, effort}` before a Provider call. `ctx.models.resolve('@task')` explicitly returns base `Model`, not effective route; docs say suffix handling must be passed separately (`extensions/types.ts:390-406`; `docs/extensions.md` model resolution note). Effective effort for `task` is derived only during execution after auth-aware model resolution and coarse mapping (`task/executor.ts:2820-2894`): `options.effort` → `resolveTaskEffortLevel(model, effort, ceiling)` → `effectiveThinkingLevel`. `task/types.ts:195-277` shows `TaskEffort` is `lo|med|hi`; `executor.ts:2872-2894` maps that to lowest/middle/highest supported level of the *eventually resolved* model, so `hi` can be Max and `lo` is “lowest on that model,” not globally safe. Live config `J:/OhMyPi/data/.omp/agent/config.yml:2-35` already binds `@task→cockpit-gpt/gpt-5.6-luna:max`; legitimate isolated POC avoided Max only by running an *isolated* profile with `opencode-go-responses/muse-spark-1.2-contributor` (`reasoning:false`, no ladder — `models.yml:62-67`).

`tool_call` handler receives raw `input` with requested `effort: "lo"|"med"|"hi"` (`extensibility/shared-events.ts:294-316` `input?: Record<string,unknown>`; `task/types.ts:286-305`), but the *actual* Max outcome depends on resolution not yet performed. Blocking at `tool_call` on “requested `hi` → deny” is correct defense, but blocking on “requested `lo` ⇒ safe” is unsound — auth fallback can still produce Max (`executor.ts:2846-2853` fallback to parent model). Category-2 use is provider-specific and not a transport guarantee (capability audit: OpenAI Completions `onPayload` not awaited).

**Requirements:** PRD REQ-032 (never auto Max), REQ-042 (preflight Max rejection with zero Provider calls), SPEC CAP-006/CAP-007/CAP-008, AC-108, AC-105/AC-107.

**Verdict:** **BLOCKED.** Must remain fail-closed. See Required Corrections R-01.

### F-02 — Model-cooperation gate replaces decision gate; `tool_call` never fires if model omits `task` (FATAL)

**Claim attacked:** “Expensive parent directly issues one native `task`; `weconverge_decide` not required ⇒ cheaper and more reliable.”

**Reality:** `tool_call` is an *observation* gate, not a *scheduling* gate. It fires only when the parent LLM emits a call for `task` (`extensions/runner.ts:1087-1141` — handler iterates `tool_call` handlers; `wrapper.ts:145-395` wraps execution). If the LLM produces ordinary text, a different tool, or malformed `task` JSON (which schema validation rejects `before` the wrapper), nothing delegates. The prior design’s `weconverge_decide` gate at least forced a structured predicate check (evidence, difficulty mapping, Max ban) before dispatch; the reduced design’s success condition is “LLM cooperates with our policy doc.” POC Scenario A required `"Call the task tool now with agent='task' effort='lo'"` explicit instruction; Scenario B proved the real Extension path **never invoked** `task` at all — `taskWrapperInvocations 0`, `decide` `blocked: routing integrity=source_gap` (`docs/audits/poc-20260820/poc-real-decide-evidence.jsonl:…`).

**Requirements:** SPEC §9.0/CAP-004/CAP-005 dispatch gate, CAP-013/CAP-014 external exploration semantics.

**Verdict:** **PARTIAL → FATAL if relied upon for convergence.** Governance is opportunistic, not compulsory. Correction: retain a degraded path (if `task` not emitted within N turns, parent stays on current path; no silent success). See R-02.

### F-03 — `tool_call` mutability order and timeout fail-closed (FATAL if mis-assumed non-blocking)

**Claim attacked:** “Governance is zero-cost, always non-blocking, last write wins.”

**Reality:** `emitToolCall` iterates extensions sequentially; any handler returning `{block: true}` short-circuits (`extensions/runner.ts:1122-1124`); timeout is 30 s and **returns** `{block:true}` with reason (`runner.ts:1098-1118` citing issue #3948). Multiple handlers see original `event.input`, last `input` wins but **no handler sees another’s revision** (`shared-events.ts:299-313` comment “handlers do not observe each other's revisions”). A hanging handler **freezes** `ExtensionToolWrapper.execute` forever if not timed out. `tool_result` handlers similarly chain; last write wins but no compound visibility (`runner.ts:1034-1070`).

**Requirements:** PRD REQ-070 (extension failure degrades to ordinary OMP), SPEC AC-033/AC-041.

**Verdict:** **PARTIAL** — zero-LLM is true, non-blocking is **false**. Handler must be ≤ few ms synchronous, no `await` on I/O, no network. See R-03.

### F-04 — Session / child isolation & enabled semantics (MAJOR, easily missed)

**Claim attacked:** “Extension state is naturally per-session; `off`/`reset` just flip a flag.”

**Reality:** Extension instance lives per OMP process; `ExtensionContext` carries `sessionManager`/`cwd`/`model` but `src/extension.ts:112-124` keeps `state` as a closure singleton keyed by `sessionId` and `generation`. The proposal’s ledger must explicitly key by `sessionId#generation`; otherwise a second task in same profile reuses wave count. `session_start`/`session_switch`/`session_shutdown` are public (`extensions/types.ts:1133-1150`) but `off` is an Extension *command*, not a lifecycle event — children in `task` executor are not automatically cancelled on `off`; cancellation is per-ToolCallId via executor (`task/executor.ts:2175-2224`). Parent Extension cannot enumerate or kill arbitrary session files without a public API — only `task` tool cancellation scope.

**Requirements:** SPEC REQ-010..013, CAP-002/CAP-012, AC-002/AC-038/AC-110/AC-111.

**Verdict:** **PARTIAL** — isolation is achievable but must be coded explicitly. See R-04.

### F-05 — Wave / concurrency accounting bypasses (MAJOR)

**Claim attacked:** “`tool_call` enforces ≤2 probes / task and ≤2 waves / task automatically.”

**Reality:** `task` batch schema `tasks: TaskItem[]` has **no server-side max-item enforcement** (`task/types.ts:195-234` — `tasks: item.array()` unbounded; concurrency is executor-side policy `task.spawn`). Nothing stops parent LLM from calling `task` with `tasks: [5 items]` or calling `task` again in a follow-up turn, inventing an unbounded third wave. `tool_call` can block on `tasks.length > 2`, but it cannot prevent a second `task` invocation in the next agent turn — that is a new `tool_call`. Counting must be stateful across turns (persisted via `appendEntry` or extension-owned file, `extensions/types.ts:1262`), otherwise reload loses it.

**Requirements:** REQ-044, SPEC §10.3/CAP-008 `maxParallelExplorers 1..2`, `maxExplorationWaves 1..2` (`SPEC.md:228-239`).

**Verdict:** **PARTIAL** — enforceable only with explicit ledger. See R-05.

### F-06 — Duplicate / evidence-anchor loss (MAJOR)

**Claim attacked:** “Duplicate detection and evidence gating are not needed — task input itself is the evidence.”

**Reality:** Original `weconverge_decide` demanded `obstacle`, `evidenceRefs` (confirmed, non-empty), `expectedNewInformation`, `successCriterion`, and cross-wave new-evidence (`SPEC.md:329-389`, `src/core/cost.ts:76-102` `wouldRepeatSameAction`). The reduced design drops all of these; `task(context, tasks[].task)` is free-form. A trivially reworded `task` string embedding identical intent will not be recognized as duplicate by `tool_call` string compare. Without a canonical hash (as `src/core/ledger.ts:24-55` does for decisions), parent can waste children retrying identical probe.

**Requirements:** REQ-022/REQ-026/REQ-050, SPEC §9.1/§9.2/§10, AC-007/AC-010/AC-024.

**Verdict:** **SOURCE GAP** without ledger. See R-06.

### F-07 — Recursive delegation / cost amplification (MAJOR)

**Claim attacked:** “OMP owns execution, so cost is bounded.”

**Reality:** OMP’s `task` children themselves run an agent loop. Their ExtensionRunner is a **separate** instance with its own policy file (if parent injected via `before_agent_start`, children inherit the on-disk Extension but get fresh `ExtensionContext`). Nothing in the sketch prevents child prompt from itself issuing `task` (a second level), nested under the executor’s unlimited depth until `task.maxEffort`/`task.spawn` caps. Executor’s `spawnEffortCeiling` (`task/executor.ts:2877`) rides into the child session for retry fallback, not as a recursion depth cap. Cost amplification is unbounded in draft.

**Requirements:** REQ-004/REQ-027/CAP-008 no-infinite-spawn, AC-033.

**Verdict:** **PARTIAL** — must forbid recursion by policy or explicitly scope it. See R-07.

### F-08 — Audit truthfulness: phantom `resolvedEffort` and synthetic cost tiers (MAJOR)

**Claim attacked:** “`tool_result` + `task:subagent:*` give full requested→resolved route + cost tier.”

**Reality:** `progress.resolvedModel` is proven (`task/types.ts:502-503` → formatted with `formatModelStringWithRouting`; `executor.ts:2884-2888` stores it). But `resolvedEffort` has **no public field** anywhere (`task/types.ts:395-434, 471-539`; audit table row 2026-08-20 shows `resolvedEffort` GAP). The proposal’s “effort model-aware” would tempt writing `actual.effort = config.relativeCostTiers[agent]` — a synthetic `relativeCostTier` from `src/core/config.ts:228-239` explicitly warned “is not probative of actual effort” (`SPEC.md:432-446`). Truthful audit must write `unknown`/`source_gap` for effort unless a public event proves it (`SPEC CAP-011` `sanitize`, `AC-022`).

**Requirements:** REQ-041/REQ-064, SPEC §4.4 `ResolvedRouteV1` separation (`SPEC.md:149-165`), CAP-011.

**Verdict:** **PARTIAL** — audit is usable only if `unknown` is preserved. See R-08.

### F-09 — Hidden main-model token costs (MAJOR — the primary cost-risk of the proposal)

**Claim attacked:** “Compact policy makes main-model cost dominant but bounded; `tool_call` is zero LLM.”

**Reality:**

| Cost source | Where billed | Why draft undercounts |
|---|---|---|
| `before_agent_start` policy block | Added to `systemPrompt[]` on **every turn** (`extensions/types.ts:1037` returns `systemPrompt?: string[]`). For a long task with 20 turns, that is 20 × policy tokens (even if cheap per turn, it exceeds the `weconverge_decide` payload it claims to save). `src/extension.ts:78-90` `POLICY_BLOCK` is ~9 lines → ~120 tokens. | Not zero. |
| Parent reasoning to produce 2 probe `tasks` | Parent LLM context + completion. Comparing two directions “in the current pass” (PRD G-002) still consumes parent reasoning tokens inside that pass, even if no second model call. Batch `task` requires synthesizing `context` + per-item `task` strings. | Counts as main-model tokens (correct to charge to main), but draft claims no token budget needed — it still spends them. |
| `tool_call` governance | Zero LLM (true). But retry-on-block (`block:true` reason returned to LLM as tool error) forces parent LLM to re-reason and emit corrected text/tool — another main-model turn. Excessive blocks increase main-model calls. | Not zero total system cost. |
| `weconverge_decide` retention for parent-effort | Still a full LLM tool call (`src/extension.ts:362-461` registers `weconverge_decide` with `toolCallId`). If parent repeatedly reports `source_gap`/`blocked`, that is an extra model call per escalation attempt. | Retained cost not removed, just shifted. |
| Child outputs into parent context | After `task` completes, `SingleResult[].output` is injected as `tool_result` content to parent. Two children × compact output (e.g., 400 tokens each) → 800 tokens of parent input next turn plus synthesis. Original cap of 2 probes already bounds this, but 2-wave scenario (4 children) doubles it. | Child output tokens billed as parent input on synthesis. |

Net: draft’s “main-model tokens primary, children secondary” is the right *budgeting axis*, but the mechanism still adds measurable main-model tokens every turn and per blocked retry. Without a policy-length budget or block-retry limit, long tasks regress.

**Requirements:** PRD G-005 transparency, SPEC AC-103/AC-104 “zero extra Provider call” discipline.

**Verdict:** **PARTIAL** — cost thesis right, metering absent. See R-09.

### F-10 — Maintainability / contract-deletion traps (MINOR → MAJOR depending on Owner intent)

**Claim attacked:** “Sketch is a narrow revision, not a re-architecture; SPEC deltas are trivial.”

**Reality:** Accepting the draft as written silently deletes:

- PRD REQ-032/REQ-042/REQ-030 global Max ban and effort ladder (`SPEC.md:260-290` ladder + `CAP-006` single-rung).
- SPEC §9.1 mandatory `weconverge_decide` fields (`decisionId` uniqueness, `evidenceRefs`, `expectedNewInformation`, `successCriterion`, `sourceGap` shape).
- SPEC AC-010/AC-024/AC-036 evidence gating and cost-comparison audit.
- SPEC §4.3 `ConvergenceDecisionV1` token/provider-id rejection (`FORBIDDEN_ALLOCATION_FIELDS` `src/core/decision.ts:78-85`).
- Any claim that AC-105/AC-107/AC-108 are PASS without preflight readback (already `BLOCKED` in `ACCEPTANCE.md:9-16`).

If Owner intends a *different* product (cost-aware probe dispatcher, not convergence controller), those deletions are acceptable **only** via explicit PRD/SPEC amendment and `SPEC §22` re-closure. Otherwise they are regressions.

**Verdict:** **PARTIAL** — must be explicit. See R-10.

---

## Main-Model Cost Analysis

### What the proposal gets right

- Locating cost control at the **parent turn** (policy injection + `tool_call` block) instead of adding a separate classifier model is the minimum-LLM governance path (`SPEC CAP-008` extra-LLM=0 is already an architectural property, not a measured API).
- Child cost secondary via bounded parallelism (`tasks.length ≤2`, `waves ≤2`) caps worst-case child tokens to 4 × probe budget. Executor’s native concurrency and cancellation (`task/index.ts:659-725`) avoid a second busy-loop.
- `ctx.invokeTool` delegation reuses OMP’s existing retry-fallback and ceiling logic (`executor.ts:2854-2894`) rather than reimplementing model routing.

### What the proposal hides

1. **Policy per turn.** `before_agent_start` returns `BeforeAgentStartEventResult` with `systemPrompt` addition on **every** turn (`extensions/types.ts:1037`; `extensions/runner.ts:966-1027` loop). At ~120 tokens × 25 turns = 3k input tokens purely for governance. Original `weconverge_decide` paid only when exploration was actually attempted.
2. **Probe synthesis is still parent reasoning.** Asking the parent to “compare two essentially different directions and emit `task(context, tasks=[{q, minimalTask, falsifier}…])`” moves the two-direction comparison from a dedicated field set (`selectedDirectionId/alternativeDirectionIds`) into the Task `context` string. Tokens are still spent reasoning + formatting JSON.
3. **Block → retry loop.** Any `tool_call` `block:true` returns `reason` to the LLM as a tool-call error (`shared-events.ts:294-298`; `wrapper.ts:214-218` builds “Tool execution was blocked by an extension: …”). The LLM must then generate a fresh turn to recover. Three blocks → three extra parent calls. Without a retry budget, a strict handler can **increase** main-model calls vs. the original design.
4. **Result synthesis.** Two children → `tool_result` carrying `details: {progress, resolvedModel, artifacts}` plus concatenated `output`. Parent’s next turn ingests all of it. The draft’s “child outputs compact” is necessary but not sufficient — compact must be **enforced** (truncation, e.g., 120-char preview discipline in POC wrapper line 19 `TOOL_TRUNCATE=200`).
5. **`weconverge_decide` for parent-effort.** Retained for `raise_effort` only, but caller must still produce `DifficultyType=reasoning_depth_insufficient` + confirmed evidence, or the call is rejected (`src/core/decision.ts:381-384` fuse). A parent that wants to escalate without evidence still needs an extra LLM tool call to learn it is rejected.

### Quantitative sketch (illustrative, no price assumed)

- Baseline task, no exploration, 10 turns: `10 × 120 ≈ 1,200` policy tokens overhead. Zero child tokens. Net +1.2k over disabled baseline — acceptable if disclosed.
- One-wave exploration, 2 probes, 15 total turns (5 after child): `15 × 120 ≈ 1,800` policy + probe synthesis (~400) + child outputs returned (~800) ≈ 3k main-model overhead to save potentially far larger “continue_current” waste. Trade-off favorable only if probe genuinely prevents a wasted parent fix-loop.
- Two-wave exploration, 25 turns, 1 blocked retry: `25 ×120 ≈3k` + synthesis 800 + outputs 1.6k + blocked retry turn (~600) ≈ 6k overhead. Over budget without strict probe discipline.

### Recommendation for metering

- Cap policy injection to `enabled && generation==1` first turn + refresh only on `generation` change or `enabled` toggle (not every `turn_start`), to cut per-turn multiplier by ~15×. Store generation-scoped `policyInjectedForGeneration` (`src/extension.ts:122` pattern) — keep it, don’t revert to per-turn.
- Limit `tool_call` governance to pure synchronous check (<1 ms) and `block` only on cheap structural predicates (`tasks.length`, unknown capability, stale generation, recursion marker). Let semantic validation failures degrade to recorded `source_gap` in `tool_result` rather than hard-blocking and forcing a retry.

---

## Required Corrections (Narrowest Pure-Extension fix without OMP patch or mandatory `weconverge_decide→task`)

All corrections stay inside the public `ExtensionAPI` (`pi.on`, `appendEntry`, `getThinkingLevel`, `setThinkingLevel`, `ctx.invokeTool`). No OMP code change, no core config patch, no `--extension` injection for children.

### R-01 — Retain fail-closed Max ban; enforce conservatively at `tool_call` (design correction, FATAL)

- Do **not** relax PRD REQ-032/REQ-042 to “per-capability expected effort.” Keep global `max` ban for automatic dispatches.
- `tool_call` rule (zero LLM): allow automatic `task` only when every `tasks[].effort` is `lo` **and** caller-supplied `agent` is in an allow-list whose backing model is proven non-Max in this profile (e.g., `muse-spark-1.2-contributor` in POC). Any `med|hi|auto` or disallowed `agent` → `block:true, reason: cost_guard_conflict: automatic Task Max not provably excluded (SOURCE GAP)`. This preserves `CAPABILITY_PROBE.md:38-50` CP-003 BLOCKED semantics.
- Record `effectiveAction` as `blocked` with `cost_guard_conflict` audit entry via `appendEntry` (prove zero Provider calls before block, `after_provider_response` not emitted). This closes AC-108 without claiming a preflight proof.

SPEC delta explicit: §6.1 CP-003 stays BLOCKED for automatic effective preflight; product waives “prove hi is not Max via public API” and instead constrains automatic surface to `lo` only.

### R-02 — Make governance trigger explicit; handle model non-cooperation (design correction, FATAL)

- Policy text must be **instruction, not guarantee**: “If you need independent verification, you MUST issue a single `task(context, tasks=[≤2])` call; if you do not, WEConverge assumes single-agent progress.” No polling — parent continuation without `task` after N turns is defined as *not blocked*, just unverified single-agent path.
- Document the gate: `tool_call` observes, never schedules. Add to PRD §7 `J-004` a line “external exploration runs only when model emits `task`; omission is not an error.”
- Add lightweight reminder on `turn_end` with `deliverAs: "steer"` (public `SendUserMessageHandler` `options.triggerTurn` not used — only passive notice) after a confirmable non-convergence turn with no `task`, to avoid silent stall. Not a polling loop — single async notice, no child scheduling.

### R-03 — Make `tool_call` handler synchronous, timeout-safe (design correction, FATAL)

- Handler body: ≤5 ms, no `await`, no `fs`, no `readFileSync`. All persistent state read at `session_start`/`session_switch`/`turn_start` and cached; mutation via in-memory ledger + deferred `appendEntry` outside the handler (post-`tool_result`).
- Requested spec change: extension timeout `extensionHandlerTimeoutMs` documented in `runner.ts:1075-1081` is 30s; handler must be orders of magnitude faster and must never return a promise that can hang — otherwise `Extension ${path} timed out` produces an unintended block.

### R-04 — Session-scoped state & lifecycle restore (design correction, MAJOR, F-04/F-14)

- Key all mutable state by `sessionId#generation` (`src/extension.ts:114-123` generation pattern; `audit.ts:279-330` replay key). Reset on `session_switch` (generation++) and `session_shutdown`.
- `off`: (1) set `config.enabled=false` persisted via `appendEntry` + extension-owned file as today (`src/extension.ts:176-183` pattern); (2) return `undefined` from `before_agent_start` (no injection); (3) `tool_call` handler returns `block:true` for any new `task`; (4) **do not kill** running executor children — executor manages cancellation scope per `ToolCallId`, not per Extension. Mark them `detached` in audit (as current `applyOff` does) and stop feeding their results into wave accounting.
- `reset`: clear wave ledger (`automaticWavesUsed`) but keep audit log; do not clear `health/sourceGaps`.

### R-05 — Wave & concurrency ledger (design correction, MAJOR, F-05)

- In-memory + persisted ledger: `{automaticWavesUsed: 0|1|2, explorationWave: number, ownedChildRuns: [{childAgentId, parentToolCallId, status}]}`.
- `tool_call`: if `tasks.length > maxParallelExplorers (2)` → `block` with `reason: too_many_probes (got N, limit 2)`. If ledger `automaticWavesUsed >= maxExplorationWaves (2)` and no manual grant (`manualExplorationGrant: null` per `types.ts:189-194`) → `block: wave limit exceeded`.
- Wave increment on **accepted** `tool_result` (not on `tool_call`), because `tasks[].agent` scheduling to `progress` happens after `invokeTool`. Second-wave `task` allowed only if prior wave’s `progress`/`tool_result` included ≥1 `source_gap|failed` that satisfies `SPEC §11` new-evidence gate — otherwise block. No manual `weconverge_decide` grant can raise limits except explicit user command per SPEC §5 frontier.

### R-06 — Duplicate / evidence deduplication (design correction, MAJOR, F-06)

- Canonicalize `task` payload before scheduling: `hash(canonicalJSON({context: trimmedContext, tasks: tasks.map(normalizeTask).sortBy('task')}))` using `src/core/ledger.ts:24-55` canonicalization pattern. Prevent the “reworded duplicate” attack: normalize whitespace, collapse zero-width, and reject `context`/`tasks[].task` that are pure rephrase of prior ledger entry (cosine-free, exact hash match only — no embedding, no LLM). Duplicate within same `generation` → `block: evidence set repeat (no new falsifier)`.
- Do **not** claim “evidence confirmed” — drop the SPEC §9.2 evidence-tier for automatic Task; instead require that `tasks[].task` carry an explicit falsifier sentence (e.g., `falsifier: "fails open file X returns EACCES"`). Without literal falsifier marker, block.

### R-07 — Recursive delegation containment (design correction, MAJOR, F-07)

- Add to `tasks[].task` a machine-readable breadcrumb `__weconvergeParentToolCallId: <id>` (last line, trimmed, not user-visible).
- In child sessions, `before_agent_start` policy variant forbids `task` with breadcrumb present: child `tool_call` handler (own instance) returns `block: recursive task not permitted under probe` — containment without parent cross-talk. Alternative simpler: global flag `task.spawn`/`task.maxEffort` via executor policy already bounds child effort but not depth; breadcrumb is deterministic.
- Document as explicit non-goal: no nested probes. Any multi-wave logic stays in parent.

### R-08 — Honest audit (design correction, MAJOR, F-08)

- `tool_result` handler writes `details.resolvedModel` from `ToolExecutionEndEvent`/`Task` details (where available) + truncated `output` (120–200 chars). Effort always written as `unknown` + `sourceGaps: ["resolvedEffort: SOURCE GAP — no public effort field"]` (honest preservation of `SPEC CAP-011`).
- `relativeCostTier` written only as `CostComparisonV1` tier derived from parent config, but audit comment must state “not probative of actual Provider wire effort” (SPEC §13 warning). Do not let `relativeCostTier` masquerade as `resolvedEffort`.
- Append via `pi.appendEntry("weconverge_audit", AuditEventV1)` (proven in `src/extension.ts:219-234` + `types/omp-extension-api.d.ts:187`). Render truncated output with `sanitizeValue` to avoid credential leak (already in `src/core/audit.ts:4-40`).

### R-09 — Token-cost discipline (design correction, MAJOR, F-09)

- Shorten `before_agent_start` policy to ≤60 tokens: one English directive + two bullet rules + the literal string `task(context, tasks:[≤2])`. Fundament: long preambles compound every turn.
- Implement generation-scoped injection (as `src/extension.ts:122 policyInjectedForGeneration` does) — not per-turn injection. Refresh only on `session_start`/`session_switch` or after `off`→`on` toggle.
- Cap blocked-retry turns to 1 per wave; after one `block`, stop injecting the blocked reason verbatim (which would double policy text); write to audit only.

### R-10 — Explicit PRD/SPEC deltas (documentation correction, MINOR→MAJOR for approval)

The reduced design cannot be approved without noting which SPEC clauses it **intentionally waives**:

| Clause | Current SPEC | Delta for Pure-Extension Sketch |
|---|---|---|
| SPEC §6.1 CP-001 “decision→child” | `weconverge_decide` dispatchable | Waived: `weconverge_decide` not dispatchable; governance is on model-emitted `task` instead. Add non-cooperation gap. |
| CAP-003 `before_agent_start` | Short policy + internal two-direction gate | Keep policy; internal two-direction comparison moves into `task.context` synthesis — no longer audited via `selectedDirectionId`. AC-104 coverage changes. |
| CAP-004 / §9.1–9.2 evidence gate | Required `evidenceRefs`, `expectedNewInformation` | Waived for automatic `task`: evidence anchor replaced by `falsifier` line in probe. Keep for `report_source_gap/blocked` paths only. |
| CAP-007 preflight | Formal pre-Member prove non-Max | Waived: prove only `effort:lo + allow-list agent` is safe; all else blocked. Effective `Max` proof remains post-call (`progress.resolvedModel`). |
| REQ-032 Global Max ban | All automatic routes never Max | Narrowed: automatic `task` limited to allow-list `lo`; manual `hi`/`auto` remain user-explicit, not WEConverge automatic. |
| CAP-011 audit shape | `ResolvedRouteV1` with `resolvedEffort` | `resolvedEffort` stays `unknown`/`source_gap` until a public contract exposes it. |
| AC-101..115 complete ladder | All PASS for v1 | No longer claimed complete: AC-105/AC-107 remain BLOCKED for ladder efferv; AC-104/AC-106/AC-111/AC-115 remain SOURCE GAP without persistence/ladder proof. |

Without these deltas, the sketch would be judged as regressions per `SPEC §21` anti-degradation matrix — this audit must instead record them as intentional scope changes.

---

## Explicit Non-Goals & Remaining SOURCE GAPs

Per SPEC contract “missing API is BLOCKED, not PASS,” the following remain SOURCE GAP even after R-01..R-10. They are not to be retrofit via undocumented file reads.

| Area | Remaining Gap | Why Not Fixed Pure-Extension |
|---|---|---|
| Public effective `task` preflight | No `model+effort+ceiling+authFallback` before Provider call | Internal to `executor.ts:2820-2894`; not exposed. Mitigation is conservative allow-list (R-01), not a synthetic preflight. |
| Child `resolvedEffort` | No public per-child effort field in `task:subagent:*` or `SingleResult` | `progress.resolvedModel` carries effort encoding only when explicit `lo/med/hi` used and suffix is formatted (`executor.ts:2884-2888`). Not a stable contract to parse. |
| Parent↔child Extension event forwarding | Child `tool_call`/`tool_result`/`after_provider_response` not forwarded to parent ExtensionRunner | By design: child has its own Runner + fresh `EventBus` (`session/agent-session-events.ts`). Parent only sees task coarse channels. |
| Provider/payload inspection as preflight | `before_provider_request.payload: unknown` plus provider-specific handling (OpenAI Completions ignores revision) | `extensions/types.ts:643-651`; `providers/openai-completions.ts:662-693` bypasses `onPayload` return. Not a universal Max gate. |
| Quota/price telemetry | No public price/balance/quota readback | Documented gap across audits; already `priceTelemetry: SOURCE GAP` everywhere (`ACCEPTANCE.md:70-73`). |
| Persisted replay across profile reload | `appendEntry` replay depends on `sessionManager.getBranch()` scan (`src/extension.ts:283-306`) with `--no-session` = no persistence | Isolated POC proofs remain non-persistent (`docs/audits/poc-20260820/*`). Real profile test needs persistent run. |
| Formal parent-child session Registry link readable from parent | No `parentSessionId → childSessionIds` public readback in Extension API | `executor.ts:1325-1331` lifecycle has `parentToolCallId` but not a traversible registry API for parent Extension. |

If Owner later requests a single new OMP surface, the smallest justifiable additions (not pre-approved here) would be:
- (a) a `ctx.taskPreflight({agent, effort}) → {effectiveModel, concreteThinkingLevel, wouldBeMax: boolean, wouldCallProvider: boolean}` **without** Provider side effects, or
- (b) exposure of `resolvedEffort` in `SingleResult`/`task:subagent:progress` plus parent-readable `childSessionId`. Neither is justified until the R-01..R-10 pure-Extension path is proven insufficient in a persistent profile.

---

## Decision

**REVISE and re-review.**

- **GO** for the engineering direction (parent-issued native `task` + `tool_call` governance + OMP-owned execution). No OMP patch should be touched this round.
- **REVISE** the proposal into a narrow delta: adopt R-01..R-10, write the PRD/SPEC amendment table above, shorten policy, add ledger, contain recursion, and declare the remaining SOURCE GAPs as contractual — not as implementation shortcuts.
- **Blocked verifications to complete before approval:** persistent-profile replay (not `--no-session`): one-wave `lo` with 2 probes → verify `tool_call` allow, `task:subagent:lifecycle started→completed`, `tool_result details.resolvedModel` (non-Max), `turn_start`+`getThinkingLevel()` parent snapshot, capped `appendEntry` audit, `off`→`block` and `reset`→wave ledger cleared. Costs measured over ≥10 turns.

**STOP conditions (do not ship):** `hi`/`auto` used automatically; `resolvedEffort` synthesized from `relativeCostTier`; recursive child `task` allowed; `tool_call` handler does async I/O or <30s timeout assumed safe; wave counting without persistence; per-capability Max claimed proven without allow-list.

---

## Verification

This report was persisted to `docs/audits/2026-08-20-weconverge-pure-extension-design-adversarial-audit.md` and read back before return (titles, matrix head, and trailing STOP line verified). No source/product/contract files were modified. No tests, builds, linters, formatters, or commits were executed (per Acceptance: skip those).

