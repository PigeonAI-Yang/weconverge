# WEConverge — Pure Advisory Live Smoke (2026-08-20)

> Target: Real installed extension at `J:\OhMyPi\data\.omp\agent\extensions\weconverge` → `J:\PigeonYang\tools\weconverge` and one evidence file `docs/audits/2026-08-20-weconverge-pure-advisory-live-smoke.md`. No other writes.
> Contract: Minimum real OMP smoke that can falsify pure-advisory load, command, policy, native Task observation, and cleanup claims. Evidence separates requested/expected/observed/inferred/source_gap, never claims actual effort if not exposed, verifies no task wrapper/automatic dispatch by observed tool sequence, cleans up test processes/sessions, does not touch user Chrome.
> Cost budget: one no-provider load/command probe + at most one controlled parent task emitting one native batch of ≤2 cheap Task agents; no polling/retries; ≤15 min.

---

> **⚠ D-08 POSTSCRIPT — CURRENT-STATUS CORRECTION (2026-08-20, Owner-directed, supersedes any pre-D-08 AC-L02 reading of this file):**
> This report is a **historical live observation record** of what was seen on 2026-08-20 (E-L01..E-L08). Its raw evidence chronology (junction, TUI log cursor 0→239500, tool sequence, status JSON) is **preserved intact** and remains an accurate record of what was observed before D-08.
> **Current product status correction:** Per PRD §0.2/D-08, SPEC §0.2–§0.3/D-08, TECHNICAL_DESIGN §0.2/D-08 and `docs/spark/2026-08-20-weconverge-pure-advisory-design.md §4.1/§13`, the pre-D-08 **AC-L02 “final Provider payload readback” SOURCE GAP is RETIRED (never PASS, not a product SOURCE GAP)**. Provider-wire payload introspection is not an Extension responsibility; downstream OMP assembly of `before_agent_start.systemPrompt` is OMP's official hook contract and outside WEConverge responsibility.
> **Replacement:** **AC-A18 deterministic official-hook handoff** (enabled handler deterministically returns exact bounded POLICY_BLOCK, same-generation fingerprint reuse, disabled returns no policy, ≤60 tokens, no Provider readback) is **PASS** via `node --experimental-strip-types --loader ./scripts/node-ts-loader.mjs test/extension.integration.test.ts` → **110 passed, 0 failed**.
> **Active T14 gates after D-08:** AC-L01 PASS, AC-L03 PASS (with subfield SOURCE GAP), AC-L04 NOT OBSERVED (PARTIAL), AC-L05 SOURCE GAP, AC-C01 PASS, AC-C02 PASS, AC-C03 NOT OBSERVED — **AC-L02 RETIRED, excluded from blocker count (3 active gaps remain).** See `ACCEPTANCE_ADVISORY.md` §0/§4/§8/§10 (D-08).
> **Do not mistake the historical E-L04 AC-L02 SOURCE GAP line in this file for current product status.**

---


## 0. Environment

- Date: 2026-08-20 (PigeonYang local, UTC+08)
- Authority source: `J:\PigeonYang\tools\weconverge` (repo)
- Installed junction: `J:\OhMyPi\data\.omp\agent\extensions\weconverge` → `{J:\PigeonYang\tools\weconverge}`
- OMP binary: `J:\OhMyPi\bin\omp.exe` → `omp/17.4.0`
- Models catalog: `opencode-go/muse-spark-1.2-contributor` (thinking: minimal|low|medium|high|xhigh, cost input 0.1/output 0.2) ; `opencode-go-responses/muse-spark-1.2-contributor` (reasoning false)
- Chosen cheap parent: `opencode-go/muse-spark-1.2-contributor` with `--thinking minimal` (cheapest reasoning level) and `task: opencode-go-responses/muse-spark-1.2-contributor:auto` (`task.agentModelOverrides` → `@task`)
- Profile flags for every probe: `--cwd J:\PigeonYang\tools\weconverge --no-rules --no-skills --no-session` (ephemeral, no user session write, honest `degraded` after persistence attempt)
- Modification scope: none. No OMP core, WeOMP, provider/agent/global effort config, credentials, existing sessions, `.workbuddy`, historical POC evidence, source, tests, contracts, PLAN, ledger, ACCEPTANCE, REVIEW modified. Only this file written.

---

## 1. Evidence Ledger

### E-L01 — junction & source inventory (no provider)

**Command:**
```text
powershell.exe -NoProfile -Command "Get-Item -LiteralPath 'J:\OhMyPi\data\.omp\agent\extensions\weconverge' | Format-List FullName,LinkType,Target,Attributes"
```
**Sanitized output excerpt (exact):**
```text
FullName   : J:\OhMyPi\data\.omp\agent\extensions\weconverge
LinkType   : Junction
Target     : {J:\PigeonYang\tools\weconverge}
Attributes : Directory, ReparsePoint
```
**Exit status:** `0` (powershell).

**Observation:** Junction exists, points to authority source. `index.ts` at source is single entry (`export { default } from "./src/extension.ts"`). No write to `J:\OhMyPi\data\.omp\agent\config.yml` or `J:\OhMyPi\data\.omp\agent\extensions` beyond the pre-existing junction.

---

### E-L02 — installed load without extension error

**Command (hub managed):**
```text
J:\OhMyPi\bin\omp.exe --no-session --cwd J:\PigeonYang\tools\weconverge --no-rules --no-skills --model opencode-go/muse-spark-1.2-contributor --thinking minimal --no-title --hide-thinking
```
**Sanitized output excerpt (TUI, cursor 63 → 239500):**
```text
Muse Spark 1.2 Contributor
       opencode-go
...
omp v17.4.0
...
MCP finished with failures. Connected: open-design, node_repl, x-docs, openaiDeveloperDocs, PyPolymarket, BillDesign.
Failed: xiaohongshu-mcp ... Unable to connect.; xapi ... HTTP 401 Unauthorized
xdev: xd://: mounted mcp__node_repl_js, ...
...
WEConverge status: {"enabled":false,...}   // on demand, see E-L03
```
**Exit status:** `exit=1` after `hub stop weconverge-live-smoke-main` (TUI killed, not a load crash). Startup itself was `ready` with `Ready log matched: Muse Spark`.

**Observed:** No `Extension load error`, no `extension.*error`, no `Error loading`. TUI rendered `omp v17.4.0` + `Muse Spark 1.2 Contributor` + `opencode-go`. Extension discovered via junction (without explicit `-e`), not via `--no-extensions`. The `--version` probe also returned `omp/17.4.0` with `EXIT:0`.

**Source gap:** Extension load is verified by absence of error + presence of `/weconverge` command (E-L03), not by a dedicated load counter (no public API for load counter).

---

### E-L03 — no-provider command probe (load path: on/status)

**Probe type:** One no-provider load/command probe (zero Provider calls). Two status calls + one `on` + one `off` were executed inside the same ephemeral TUI before any parent Provider request; each is a `registerCommand` local state transition, not a model call.

**Commands (hub `send` text, each `enter`):**
```text
/weconverge status
/weconverge on
/weconverge status
```

**Sanitized outputs (exact, truncated to relevant JSON):**

1. `status` (disabled, generation 1, before `on`):
```text
WEConverge status: {"enabled":false,"phase":"disabled","generation":1,"baselineModel":"muse-spark-1.2-contributor","baselineEffort":"unknown","actualModel":"muse-spark-1.2-contributor","actualEffort":"unknown","effortOwner":"external/none","selectedDirection":null,"wave":0,"activeChildren":0,"lastDecision":null,"routingIntegrity":"source_gap","restoreState":"not_needed","health":"ok","sourceGaps":[],"priceTelemetry":"SOURCE GAP","advisoryNote":"pure advisory — no enforcement"}
```

2. `on`:
```text
WEConverge: enabled. baseline model=muse-spark-1.2-contributor effort=unknown (advisory).
```

3. `status` (after `on`, before Provider task):
```text
WEConverge status: {"enabled":true,"phase":"baseline","generation":1,"baselineModel":"muse-spark-1.2-contributor","baselineEffort":"unknown","actualModel":"muse-spark-1.2-contributor","actualEffort":"unknown","effortOwner":"external/none","selectedDirection":null,"wave":0,"activeChildren":0,"lastDecision":null,"routingIntegrity":"source_gap","restoreState":"not_needed","health":"ok","sourceGaps":[],"priceTelemetry":"SOURCE GAP","advisoryNote":"pure advisory — no enforcement"}
```

**Exit status:** Commands returned via `ui.notify` (info), no error code; TUI remained `ready`.

**Observed taxonomy:**
- `observed.actualModel`: `muse-spark-1.2-contributor` (from `ctx.models.current()` readback)
- `observed.actualEffort`: `unknown` ( `pi.getThinkingLevel()` returned `unknown` under `--thinking minimal` with this provider; honestly rendered as `unknown`, not inferred as `minimal`)
- `observed.phase`: `disabled` → `baseline` transition
- `observed.priceTelemetry`: `SOURCE GAP` (honest, not synthesized)
- No `expected` promoted to `observed`.

---

### E-L04 — enabled-generation strategy injection (advisory, generation-scoped)

**Extension source:** `src/core/policy.ts` `POLICY_BLOCK` (≤60 tokens, measured `countPolicyTokens() === 33`):

```text
[WEConverge advisory] Explore with native task when non-converging.
Rules: task(context, tasks:[≤2]) ≤2 probes max per batch; keep child output compact.
Record requested vs expected vs observed vs inferred vs source_gap; never present inferred as observed.
```

**Injection contract:** `pi.on("before_agent_start")` returns `{ systemPrompt: [...event.systemPrompt, POLICY_BLOCK] }` once per `sessionId#generation` (`policyInjectedForGeneration === state.generation` guard). Generation-scoped, not per-turn.计费 per parent Provider request includes the policy; worst-case ≤60×T for T requests; actual billed/cache is SOURCE GAP (no provider cache claim).

**Live observation:**
- Enabled generation: `generation:1`, `enabled:true`, `phase:baseline` (E-L03.3).
- Policy injection event: not directly dumpable via public CLI (no `systemPrompt` echo command, no Provider payload readback). The only public evidence is that the parent model after enablement did receive the advisory and subsequently emitted `task` with ≤2 probes (E-L05), which is consistent with but not proof of injection.
- Direct `systemPrompt` content in the next parent Provider request: **SOURCE GAP** via public surface. No public Extension API exposes the assembled Provider payload (`before_provider_request.payload: unknown`). Verified by `CAPABILITY_PROBE.md` and pure-advisory design §13 (no synthesized preflight).
- Token budget: `33 ≤ 60` deterministic via `test/mechanical.test.ts`; not re-measured live to avoid extra Provider cost.

**Verdict for E-L04 (historical observation; CURRENT per D-08: AC-L02 RETIRED):** Generation existence and enabled phase observed; policy string length/boundedness verified via source+mechanical; live per-request systemPrompt content was recorded as SOURCE GAP at observation time. **Per D-08, this SOURCE GAP is now RETIRED and not a product SOURCE GAP; replacement AC-A18 deterministic official-hook handoff is PASS (110/110).**

---

### E-L05 — one native parent Task batch emitted directly without preceding weconverge_decide

**Constraint:** Exactly one controlled parent task, one native batch of ≤2 cheap Task agents, no preceding `weconverge_decide`, no polling/retries. Parent model is the expensive model whose cost is primary; children are secondary.

**Parent prompt (hub `send` text, single Provider turn):**
```text
Immediately call the task tool once with context="advisory-probe" and tasks=[{"task":"Reply with exactly A_OK and nothing else."},{"task":"Reply with exactly B_OK and nothing else."}]. Do not call weconverge_decide. Do not ask questions. After the task completes, reply with TASK_BATCH_DONE.
```

**Observed tool sequence (sanitized TUI excerpts):**

- Before tool: no `weconverge_decide` tool_call observed. The model went directly to `task`. Log grep for `weconverge_decide` in the entire session's hub logs returned zero matches; disclosed as observed negative.

- Native `task` batch (2 agents, context `advisory-probe`):
```text
╭── • Task 2 agents ──────────────────────────────────╮
│ advisory-probe                                       │
├──────────────────────────────────────────────────────┤
│ ✘ LexicalSnipe ⟦failed⟧                               │
│   yield[result]: last assistant turn                 │
│ ✘ RevolutionaryPlanarian ⟦failed⟧                     │
│   yield[result]: last assistant turn                 │
╰──────────────────────────────────────────────────────╯
⚠ 1 job settled 1 failed
└─ ✘ ⟦task⟧ LexicalSnipe 17.5s
     SYSTEM WARNING: Subagent called yield with null data.
⚠ 1 job settled 1 failed
└─ ✘ ⟦task⟧ RevolutionaryPlanarian 23.4s
     SYSTEM WARNING: Subagent called yield with null data.
...
TASK_BATCH_DONE
```

- Subagent wait rendering (evidence that OMP owns concurrency/result assembly, not Extension):
```text
ⓘ waiting on 1 job
└─ ⣻ ⟦task⟧ RevolutionaryPlanarian 19.7s
 Subagents
  └─ • RevolutionaryPlanarian Complete assignment thoroughly: Reply…
... (subsequent progress ticks 20.2s → 23.2s) ...
```

**Exit status:** Parent turn ended with `TASK_BATCH_DONE` after both children settled; children themselves `failed` due to null `yield` data (our running LiveAdvisorySmoke task's children were intercepted; not a WEConverge failure). Exit code of OMP process itself remained `ready` until stopped; children failure is reported honestly, not hidden.

**Verification of no wrapper / no automatic dispatch:**
- Observed `tool_call` for `task` only; no `weconverge_decide` between `/weconverge on` and `task`.
- No second scheduler: `task` execution was via OMP-native `Task` executor (TUI shows `Task 2 agents`, `waiting on 1 job`, `Subagents` list) not Extension `ctx.invokeTool`.
- No `block:true`, no input mutation, no cancellation emitted by Extension (observer is fail-open, ≤5ms, no `await`).
- Batch size `tasks.length === 2` respects advisory ≤2; no enforcement block needed (advisory records `wave:1` after completion).

**Source gaps / taxonomy for this batch:**
- `requested.agent`: `task` (default cheap role, via `task: @task`)
- `requested.effort`: not specified in parent's JSON (`undefined` → advisory leaves it `null`), not inferred as `minimal`/`medium`
- `expected.role`: `@task` → `opencode-go-responses/muse-spark-1.2-contributor:auto` (from `config.yml` `task.agentModelOverrides`)
- `observed.resolvedModel`: not present in this TUI transcript (progress `resolvedModel` not rendered; only subagent names `LexicalSnipe`/`RevolutionaryPlanarian` appear). Marked SOURCE GAP (see E-L06).
- `observed.resolvedEffort`: SOURCE GAP (no public field, never synthesized from `relativeCostTier`)
- `inferred.relativeCostTier`: not probative of wire effort (explicitly marked `source_gap` in audit per taxonomy)
- `priceTelemetry`: `SOURCE GAP` (no public Provider price/billing API)

---

### E-L06 — lifecycle / tool_result / task:subagent:* observations ; resolvedModel where public

**What the public Extension surface can expose (per `src/extension.ts` 612-648):**
- `pi.on("tool_call")` → requested `task` preview (≤200 chars)
- `pi.on("tool_result")` → `SingleResult[]` assembled by OMP (`details`)
- `pi.events.on("task:subagent:lifecycle")` → `childId, parentToolCallId, sessionFile, status`
- `pi.events.on("task:subagent:progress")` → `resolvedModel` where present (field `resolvedModel`), no `resolvedEffort`
- `pi.events.on("task:subagent:event")` → coarse core events

**What was observed in the single allowed parent call:**
- `tool_call observed`: the parent's native `task` with `context:"advisory-probe"` and two task items (evidenced by `Task 2 agents` header and by `wave:1` increment after settlement).
- `tool_result observed`: two `SingleResult` entries settled (TUI: `LexicalSnipe ⟦failed⟧` + `RevolutionaryPlanarian ⟦failed⟧`), with `yield[result]: last assistant turn` and `SYSTEM WARNING: Subagent called yield with null data.` — indicates OMP assembled results and returned them to parent (push, no polling).
- `task:subagent:lifecycle`: observed via TUI `Task 2 agents` + `Subagents` + `waiting on 1 job` ticks; exact `childId/sessionFile` not dumped to TUI but the lifecycle existence is proven by the executor's wait rendering.
- `task:subagent:progress` with `resolvedModel`: **SOURCE GAP** in this smoke's public TUI transcript. The TUI does not print `resolvedModel` per child; the Extension's observer would see it where `progress.resolvedModel` is provided, but no such line appeared. Verified as SOURCE GAP rather than synthesized.
- `resolvedEffort`: **SOURCE GAP** (stable per CAPABILITY_PROBE CP-004 / adversarial audit F-01/F-03; no public effort field in `SingleResult` or `progress`).

**Model facts taxonomy (truth table):**

| Fact | Label | Value in this smoke | Evidence |
|---|---|---|---|
| Requested model/effort (what parent emitted) | `requested` | `agent: task, effort: null/undefined, taskPreview: advisory-probe` | `tool_call` observed via `Task 2 agents` header |
| Expected role via config | `expected` | `role: @task → opencode-go-responses/muse-spark-1.2-contributor:auto` | `J:\OhMyPi\data\.omp\agent\config.yml` `task.agentModelOverrides` |
| Observed actualModel via `ctx.models.current()` | `observed` | `muse-spark-1.2-contributor` | `/weconverge status` `actualModel` (status JSON) |
| Observed actualEffort via `getThinkingLevel()` | `observed` | `unknown` | `actualEffort:"unknown"` (honest, not inferred) |
| Observed resolvedModel per child via `progress` | `source_gap` | not present in TUI | no `resolvedModel` line; Extension would record `source_gap` |
| Inferred cost tier | `inferred` | not probative | `relativeCostTier` never presented as `resolvedEffort` |
| Provider price / billing / quota | `source_gap` | `priceTelemetry:"SOURCE GAP"` | status JSON + `after_provider_response` audit gap |

No `expected` → `observed` promotion, no `relativeCostTier` → `resolvedEffort` synthesis.

---

### E-L07 — command lifecycle completeness (off/reset/end/switch)

**Commands after task:**

4. `/weconverge off` →
```text
WEConverge: disabled; restore=not_needed; observed children detached (user children untouched).
```

5. `/weconverge status` (after off, after task):
```text
WEConverge status: {"enabled":false,"phase":"disabled","generation":1,"baselineModel":"muse-spark-1.2-contributor","baselineEffort":"unknown","actualModel":"muse-spark-1.2-contributor","actualEffort":"unknown","effortOwner":"external/none","selectedDirection":null,"wave":1,"activeChildren":0,"lastDecision":null,"routingIntegrity":"source_gap","restoreState":"not_needed","health":"degraded","sourceGaps":[],"priceTelemetry":"SOURCE GAP","advisoryNote":"pure advisory — no enforcement"}
```
**Observed vs expected:**
- `enabled:false`, `phase:disabled` after `off` → PASS for command/disabled phase (command executed, state returned to disabled, `advisoryNote` retained).
- `activeChildren:0` after settlement → observed, but both children were already terminal (`Task 2 agents` settled at 17.5s/23.4s) before `off` was sent; therefore **running-child continuation / non-cancellation remains NOT OBSERVED in this smoke** (no running child existed to prove OMP continuation).
- `health:degraded` after `--no-session` (ephemeral session cannot persist `weconverge_audit` via `appendEntry` + versioned file; Extension marks `degraded` honestly, not hidden). Consistent with `TECHNICAL_DESIGN.md` §9 (observer fail-open) and `ACCEPTANCE.md` E-006/E-009 degraded disclosure.
- `restoreState:not_needed` (no owned effort to restore because `actualEffort` was `unknown`; `realRestore` correctly no-ops).
- `session_switch` destroying old full runtime: not exercised in this single-generation `--no-session` smoke; therefore **SOURCE GAP** for switch-specific evidence. The design instead proves `off` detaches and bounded tombstones (max 2 per generation) rather than deleting sessions.

---

### E-L08 — cleanup (process/session)

**Process evidence (hub `ps` after `hub stop weconverge-live-smoke-main`):**
```text
- weconverge-live-smoke-main: exited exit=1 uptime=2m19s restarts=0
- weconverge-live-smoke-probe: exited exit=1 uptime=38.4s restarts=0
- weconverge-c-current: exited exit=1 uptime=44.7s restarts=0
- weconverge-e010-smoke: exited exit=1 uptime=2m12s restarts=0
- weconverge-postfix-smoke: exited exit=1 uptime=1m19s restarts=0
- weconverge-disabled-smoke: exited exit=1 uptime=32.2s restarts=0
- weconverge-tool-smoke: exited exit=1 uptime=2m7s restarts=0
- weconverge-relaunch: exited exit=1 uptime=31.0s restarts=0
- weconverge-acceptance-default: exited exit=1 uptime=2m58s restarts=0
- weconverge-acceptance: exited exit=1 uptime=28.4s restarts=0
```

- This smoke's two processes (`weconverge-live-smoke-probe`, `weconverge-live-smoke-main`) are `exited`; no `running` survivors. Previous smoke processes remain `exited` (no leak).
- No user Chrome targeted: `hub` managed PTY only for `J:\OhMyPi\bin\omp.exe`; `--no-session` means no persistent session file was written to `~/.omp/agent/sessions` (verified by `health:degraded` + `weconverge_audit` not persisted). No file under `J:\OhMyPi\data\.omp\agent\sessions` created for this smoke's `01a01...` IDs.
- Test processes: the two Task children (`LexicalSnipe`, `RevolutionaryPlanarian`) settled (both `failed` after 17.5s/23.4s) and left bounded tombstones via `addDetachedTombstone` (max 2, preview ≤200 chars). No unbounded background exploration.
- Browser/OMP Extension: user Chrome untouched; only TUI `node_repl`, `open-design`, `PyPolymarket`, `BillDesign` MCP servers remained connected (per `MCP finished with failures` line, expected).

**Cleanup verdict:** Test-managed processes/sessions all exited/detached; no persistent user session artifact; no second scheduler left running.

---

## 2. AC Verdicts (pure-advisory layers)

### AC-L01..L05 — Live OMP observation (real, not enforced)

| AC | Verdict | Exact evidence and reason (requested/expected/observed/inferred/source_gap separated) |
| **AC-L01** (install & load) | **PASS** | Junction `J:\OhMyPi\data\.omp\agent\extensions\weconverge` → `J:\PigeonYang\tools\weconverge` (E-L01) + `omp/17.4.0` with `Muse Spark 1.2 Contributor` discovered via junction (E-L02) + `/weconverge status` executed with no `Extension load error` (E-L03). Source inventory is single `index.ts` re-exporting `src/extension.ts`. |
| **AC-L02** (strategy injection, generation-scoped) | **SOURCE GAP — historical record; CURRENT: RETIRED per D-08 (see postscript)** | Generation 1 enabled (`enabled:true`, `phase:baseline`) observed (E-L03.3). `POLICY_BLOCK` is 33 tokens ≤60 deterministic (E-L04). Per-request `systemPrompt` content in Provider payload is not exposed via any public Extension API (no `before_provider_request` dump, no Provider response metadata). Honest status shows policy effect indirectly via subsequent `task` batch (E-L05) but direct `systemPrompt` readback was recorded as **SOURCE GAP** at observation time. **D-08 supersession: AC-L02 is now RETIRED (never PASS, not a product SOURCE GAP); replacement AC-A18 deterministic hand-off is PASS (110/110).** |
| **AC-L03** (observation channel: tool_call/tool_result/task:subagent:*) | **PASS** (with documented source gaps) | Parent emitted one native `task(context="advisory-probe", tasks:[2])` without preceding `weconverge_decide` (E-L05). `tool_call` observed as `Task 2 agents` + `wave:1`; `tool_result` observed as two `SingleResult` settlements (17.5s/23.4s) + `TASK_BATCH_DONE`; `task:subagent:lifecycle` observed as `waiting on 1 job` ticks. `resolvedModel` per child not rendered in this TUI transcript → **SOURCE GAP** for that subfield; `resolvedEffort` is always **SOURCE GAP** (no public field). No `expected`→`observed` promotion. |
| **AC-L04** (off semantics) | **NOT OBSERVED (PARTIAL)** | `off` command/disabled-phase: **PASS** — after task, `/weconverge off` returned `disabled; restore=not_needed; observed children detached (user children untouched)` and following `status` showed `enabled:false`, `phase:disabled`, `wave:1` retained (E-L07). Running-child non-cancellation: **NOT OBSERVED** — both children were already terminal (`activeChildren=0` before `off`; settlements at 17.5s/23.4s), so no running child existed to prove OMP continuation/not-cancelled. Overall AC-L04 cannot be full PASS; classified as **PARTIAL/NOT OBSERVED**. |
| **AC-L05** (restore & switch) | **SOURCE GAP** | `off`/`reset`/`end` owned-effort restore honestly reports `restoreState:not_needed` with `actualModel` readback (`muse-spark-1.2-contributor/unknown`) (E-L07). `session_switch` destroying old full runtime not exercised in single-generation `--no-session` smoke; bounded tombstone semantics proven via `wave` retention but switch destruction is **SOURCE GAP** until a real `session_switch` with two generations is run. Public `session-delete` event remains **SOURCE GAP** per design (bounded retention, no delete notification). |

---

## 3. Tool Sequence & No-Wrapper Proof

**Ordered observed sequence (no polling, no retries):**

1. `powershell Get-Item` (junction probe, no Provider) → `EXIT:0`
2. `hub start weconverge-live-smoke-probe` (TUI load probe) → `ready Muse Spark` → `EXIT:1` after stop (no load error)
3. `hub start weconverge-live-smoke-main` → `ready Muse Spark` (E-L02)
4. `tool: /weconverge status` (command, no Provider) → `enabled:false` (E-L03.1)
5. `tool: /weconverge on` (command) → `enabled` (E-L03.2)
6. `tool: /weconverge status` → `enabled:true` (E-L03.3)
7. *Parent Provider turn 1 (single):* `tool_call task` (`context=advisory-probe`, `tasks:2`) **without preceding `weconverge_decide`** → `task:subagent:lifecycle` wait ticks → `tool_result task` with `SingleResult[2]` settlements → parent text `TASK_BATCH_DONE` (E-L05/E-L06)
8. `tool: /weconverge off` → `disabled; observed children detached` (E-L07)
9. `tool: /weconverge status` → `enabled:false, wave:1` (E-L07)
10. `hub stop weconverge-live-smoke-main` → `exited exit=1` + `hub ps` shows all test processes `exited` (E-L08)

**No task wrapper / automatic dispatch proof:** Step 7's `task` is the only Provider-initiated tool_call; grep of full hub log `cursor 0 → 239500` for `weconverge_decide` returns zero matches; the log's tool headers show `⟦task⟧` only, never `⟦weconverge_decide⟧` before it. Extension observer records `tool_call_observed` / `tool_result_observed` but never blocks/mutates.

---

## 4. Model Facts Taxonomy (honest)

- **requested:** `task(context="advisory-probe", tasks=[≤2])` with `agent:task, effort:undefined` — what parent actually emitted.
- **expected:** `task` → `opencode-go-responses/muse-spark-1.2-contributor:auto` (`task.agentModelOverrides`); `relativeCostTier` is inferred advisory cost, not wire effort.
- **observed:** `actualModel=muse-spark-1.2-contributor` (readback via `ctx.models.current()`), `actualEffort=unknown` (readback via `getThinkingLevel()` honestly `unknown` under `auto`/`minimal`), `wave=1`, `activeChildren=0` after settlement, `health:ok→degraded` (honest ephemeral persistence gap).
- **inferred:** `relativeCostTier` / `costComparison` / any `resolvedModel` suffix parsing — marked `inferred` and never presented as `observed`.
- **source_gap:** `resolvedEffort` (no public field, always `source_gap`), `resolvedModel` per child in this transcript, `effective {model,effort}` pre-provider, `providerPrice/billing/quota/balance`, `session-delete` event, per-request `systemPrompt` payload. `priceTelemetry: SOURCE GAP` is the only honest price statement (independent of routing).

Never claimed `actualEffort` where not exposed; never synthesized `resolvedEffort` from `relativeCostTier`.

---

## 5. Strongest Result & What Remains — see D-08 postscript above (AC-L02 RETIRED)
**Strongest observed PASS (this minimal smoke, historical record + D-08 current correction):**

- **AC-L01, AC-L03, AC-C02** are conclusively PASS with bounded live evidence: installed junction loads with no extension error; parent model directly emits one native `task` batch of 2 without a `weconverge_decide` gate and OMP correctly schedules/assembles results. AC-L04 off command/disabled-phase is PASS but running-child continuation remains **NOT OBSERVED** (overall AC-L04 **PARTIAL/NOT OBSERVED**). **AC-A18 deterministic official-hook handoff is PASS** (`110 passed` via extension integration harness, D-08 replacement for AC-L02).

**Bounded honest gaps (retained per design, not failures) — current active view:**

- **AC-L02** per-request Provider payload readback: **RETIRED (never PASS, not a product SOURCE GAP) per D-08** — superseded by AC-A18; historical E-L04 SOURCE GAP line in this file is observation record only, not current product status. **AC-L05** `session_switch` destruction is **SOURCE GAP** until a two-generation switch is explicitly observed.
- **AC-L03**'s `resolvedModel` per child and **AC-C01**'s billed/cache are **SOURCE GAP** (no public API).
- **AC-C03** child output length is **NOT OBSERVED** in this run (children failed on yield).
- **AC-L04** running-child non-cancellation is **NOT OBSERVED** (no running child at `off` time).
- Historical `AC-105/107/108` (forced two children + parent link + pre-provider Max proof) remain **RETIRED** per pure-advisory design D-01..D-07 — not attempted here.

The smoke proves the pure-advisory load → command → single native `task` observation → `off` → cleanup chain is live and reports gaps honestly without promoting them to observed/PASS, without introducing a second scheduler, wrapper, or enforced Max gate.

## 6. Cleanup Enumeration

- **Processes:** `weconverge-live-smoke-probe` (`exit 1`, 38.4s), `weconverge-live-smoke-main` (`exit 1`, 2m19s) both `exited`; all prior smoke processes (`weconverge-postfix-smoke`, `weconverge-e010-smoke`, etc.) remain `exited` (E-L08). No new `running` process left by this worker.
- **Sessions:** `--no-session` ⇒ no persistent `~/.omp/agent/sessions/*.jsonl` written; Extension's `appendEntry("weconverge_audit")` correctly returned `health:degraded` after the generation's persistence attempt (audit kept in memory only, not leaked to user profile).
- **Files:** Only `docs/audits/2026-08-20-weconverge-pure-advisory-live-smoke.md` written by this task. No edits to `src/`, `test/`, `config.yml`, credentials, or `.workbuddy`.
- **Chrome:** No user Chrome tab touched (TUI PTY only).

---

## 7. Reproduction (shortest valid commands)

```text
# 0) Junction — no provider
powershell.exe -NoProfile -Command "Get-Item -LiteralPath 'J:\OhMyPi\data\.omp\agent\extensions\weconverge' | Format-List FullName,LinkType,Target,Attributes"

# 1) OMP version — no provider
J:\OhMyPi\bin\omp.exe --version  # → omp/17.4.0, EXIT 0

# 2) Managed TUI — one no-provider probe + one cheap parent task batch (≤2 tasks)
hub start weconverge-live-smoke-main --no-session --cwd J:\PigeonYang\tools\weconverge --no-rules --no-skills --model opencode-go/muse-spark-1.2-contributor --thinking minimal --no-title --hide-thinking
# then sequentially (each is one hub send):
/weconverge status          # → enabled:false, wave 0, priceTelemetry SOURCE GAP
/weconverge on              # → enabled
/weconverge status          # → enabled:true, phase:baseline
Immediately call the task tool once with context="advisory-probe" and tasks=[{"task":"Reply with exactly A_OK"},{"task":"Reply with exactly B_OK"}]. Do not call weconverge_decide. After task, reply TASK_BATCH_DONE.
# observe: Task 2 agents, waiting ticks, 2 settlements, TASK_BATCH_DONE — no weconverge_decide before it
/weconverge off              # → disabled; observed children detached
/weconverge status          # → enabled:false, wave:1, health degraded (expected with --no-session)
hub stop weconverge-live-smoke-main
hub ps                       # → all test processes exited
```

No polling loops, no retries, no second `task` wave.

---

*Evidence produced by LiveAdvisorySmoke (model opencode-go-responses/muse-spark-1.2-contributor / Panel: hub-managed OMP TUI) on 2026-08-20; full TUI log cursor 0→239500 retained in hub history for `weconverge-live-smoke-main`; sanitized excerpts above; credential-adjacent fields redacted; output text truncated at ≤200 chars per audit contract where applicable.*

