# WEConverge v1 — Real OMP Acceptance Report

> Scope: AC-101..115 only. This report follows the Owner-approved design baseline, then PRD,
> SPEC, TECHNICAL_DESIGN and PLAN. It records observed requested routes separately from OMP
> actual readback. A missing public API is **BLOCKED** or **SOURCE GAP**, never an invented PASS.

## 0. Verdict summary

**SPEC §22 verdict: NOT COMPLETE / REJECTED.** AC-101, AC-102, AC-103, AC-113 and AC-114
have the bounded evidence below. AC-105, AC-107 and AC-108 are explicitly **BLOCKED** by
the public OMP API preflight/child-route gaps. AC-104, AC-106, AC-109, AC-110, AC-111,
AC-112 and AC-115 remain **SOURCE GAP** because their required real event sequence was not
observed in this bounded smoke. Therefore AC-101..115 are not all PASS, and SPEC §22
conditions 3, 4, 7 and 10 cannot honestly be declared complete; this report does apply
condition 8 by keeping SOURCE GAP separate from BLOCKED and PASS.
The 2026-08-20 supplied deterministic proof (mechanical 210/210 PASS, extension integration 95/95 PASS, core+extension typecheck exit 0) and E-010's command success are not substitutes for the missing real event evidence.

## 1. Evidence ledger

### E-001 — source inventory and junction

- `index.ts:1-4` is the single OMP entrypoint and re-exports the implementation from
  `src/extension.ts`; it explicitly prevents OMP from scanning `src/core/*`.
- Command:

  ```text
  powershell.exe -NoProfile -Command "Get-Item -LiteralPath 'J:\OhMyPi\data\.omp\agent\extensions\weconverge' | Format-List FullName,LinkType,Target,Attributes"
  ```

  Exact result:

  ```text
  FullName   : J:\OhMyPi\data\.omp\agent\extensions\weconverge
  LinkType   : Junction
  Target     : {J:\PigeonYang\tools\weconverge}
  Attributes : Directory, ReparsePoint
  ```

### E-002 — installed OMP load and non-Max full-ladder baseline

- `J:\OhMyPi\bin\omp.exe --help` returned `omp v17.3.8`.
- `J:\OhMyPi\bin\omp.exe models find "gpt-5.6" --json` identified
  `cockpit-gpt/gpt-5.6-luna` with thinking levels
  `["low","medium","high","xhigh","max"]`; the smoke requested only `medium`.
- The pre-fix PTY baseline smokes used the installed junction, not the repository path directly:

  ```text
  J:\OhMyPi\bin\omp.exe --no-session --cwd J:\PigeonYang\tools\weconverge
    --no-rules --no-skills --no-extensions
    --extension J:\OhMyPi\data\.omp\agent\extensions\weconverge\index.ts
    --model cockpit-gpt/gpt-5.6-luna --thinking medium --no-title --hide-thinking
  ```

- Startup rendered `omp v17.3.8`, `GPT-5.6 Luna (Cockpit)` and `◑ med`; the extension
  command registered and ran. No `Extension load error` appeared. The initial command
  readback was `actualModel:"gpt-5.6-luna"`, `actualEffort:"medium"`.

### E-003 — disabled ordinary-task control

- Prompt: `Reply with exactly DISABLED_OK and do not call any tools.`
- Terminal result: `DISABLED_OK`; no WEConverge tool call or child was shown.
- `/weconverge status` exact readback:

  ```text
  {"enabled":false,"phase":"disabled","generation":1,
   "baselineModel":"gpt-5.6-luna","baselineEffort":"medium",
   "actualModel":"gpt-5.6-luna","actualEffort":"medium",
   "effortOwner":"external/none","selectedDirection":null,"wave":0,
   "activeChildren":0,"lastDecision":null,"routingIntegrity":"unverified",
   "restoreState":"not_needed","health":"ok","sourceGaps":[],
   "priceTelemetry":"SOURCE GAP"}
  ```

### E-004 — enabled Medium single-agent/simple path

- `/weconverge on` returned:
  `WEConverge: enabled. baseline model=gpt-5.6-luna effort=medium (Max ban active).`
- Prompt: `Reply with exactly SIMPLE_OK. This is a simple one-step task; do not call any tools.`
  The terminal returned `SIMPLE SIMPLE_OK`; no WEConverge tool call or child was shown.
- Post-task `/weconverge status` readback had
  `enabled:true`, `phase:"baseline"`, `baselineModel:"gpt-5.6-luna"`,
  `baselineEffort:"medium"`, `actualModel:"gpt-5.6-luna"`,
  `actualEffort:"medium"`, `activeChildren:0`, `routingIntegrity:"unverified"`,
  `health:"ok"`, and `priceTelemetry:"SOURCE GAP"`.

### E-005 — internal two-direction decision

- One prompt asked for exactly one `weconverge_decide` call with
  `selectedDirectionId:"direct"` and `alternativeDirectionIds:["alternate"]`,
  action `continue_current`, and one confirmed `tool_result` evidence.
- The model first emitted one malformed tool payload; OMP displayed
  `Invalid args for xd://weconverge_decide: Validation failed`. Its retry then produced
  the accepted terminal result (this retry is disclosed, not counted as a clean one-call
  proof):

  Observed output fields:

  ```text
  status=accepted
  reason=null
  generation=1
  decisionId=smoke-internal-1
  effectiveAction=continue_current
  resolvedRoute=null
  resolvedRoutes=[]
  createdChildIds=[]
  state.selectedDirection=direct
  state.alternativeDirectionIds=["alternate"]
  state.routingIntegrity=unverified
  state.health=ok
  ```

- This proves the selected/backup identifiers are recorded in an OMP tool result and no
  child was created. There is no public Provider-call counter in this smoke, so the
  stronger "zero extra Provider request" condition remains SOURCE GAP.

### E-006 — external dispatch/preflight and recovery

- The requested decision used `capability:"research"`, two independent probes, and the
  configured role mapping `research -> scout` (`src/core/config.ts:44-49`). The actual
  preflight result was **not** a scout model/effort readback:

  ```text
  {"status":"blocked",
   "reason":"preflight unavailable (BLOCKED, zero provider calls)",
   "generation":1,"decisionId":"smoke-preflight-1",
   "effectiveAction":"explore_in_parallel"}
  ```

- After that result, `/weconverge status` showed
  `lastDecision:"explore_in_parallel"`, `activeChildren:0`,
  `routingIntegrity:"unverified"`, `health:"degraded"`, `sourceGaps:[]`, and
  `priceTelemetry:"SOURCE GAP"`. The requested `research/scout` route is therefore
  not an actual resolved child route; no child, model or effort is claimed.
- Recovery commands returned:

  ```text
  /weconverge reset
  WEConverge: generation reset (enabled=true); audit kept.

  /weconverge off
  WEConverge: disabled; restore=not_needed; WEConverge children detached (user children untouched).
  ```

  Post-off status read `enabled:false`, `phase:"disabled"`,
  `actualModel:"gpt-5.6-luna"`, `actualEffort:"medium"`, `activeChildren:0` and
  `health:"degraded"`. The degraded state is real: this smoke deliberately used
  `--no-session`, so Extension-owned persistence could not be written; it is not hidden.

### E-007 — exit and relaunch

- The first smoke was stopped with the managed process stop operation; the relaunch was
  started with the same command and junction. Relaunch startup again rendered
  `omp v17.3.8`, `GPT-5.6 Luna (Cockpit)` and `◑ med`, with no extension load error.
- Relaunch `/weconverge status` read:
  `enabled:false`, `phase:"disabled"`, `generation:1`,
  `baselineModel:"gpt-5.6-luna"`, `baselineEffort:"medium"`,
  `actualModel:"gpt-5.6-luna"`, `actualEffort:"medium"`,
  `activeChildren:0`, `health:"ok"`, `priceTelemetry:"SOURCE GAP"`.
- Managed-process evidence after the final stop: `weconverge-acceptance-default`,
  `weconverge-relaunch`, `weconverge-tool-smoke`, `weconverge-disabled-smoke` and the
  setup-aborted `weconverge-acceptance` all reported `exited`; no process started by
  this worker remains running. The isolated-profile setup attempt was stopped before
  authentication and is not acceptance evidence.
- Because every smoke used `--no-session`, the relaunch proves clean load/readback only;
  it does **not** prove persisted audit replay or the same generation/state after restart.

### E-008 — durable capability and forbidden-zone evidence

- `CAPABILITY_PROBE.md:38-50` records CP-003 as **BLOCKED** for child effort preflight
  and CP-004 as **BLOCKED(child) / PARTIAL(main)** for child actual route readback.
- `CAPABILITY_PROBE.md:69-73` records zero classification calls as a design property but
  child Max preflight as BLOCKED; `:75-85` records the public persistence and lifecycle
  surfaces without claiming child evidence.
- `REVIEW.md:27-29` records no OMP-core/WeOMP/config/credential edits and the junction as
  the only OMP-tree change. This worker changed only `ACCEPTANCE.md` in the repository;
  all smoke invocations used `--no-session` and no persistent OMP configuration or source
  write was intentionally requested.

## 2. AC-101..115 itemized verdicts

| AC | Verdict | Exact evidence and reason |
|---|---|---|
| AC-101 | **PASS** | E-001 proves the canonical entrypoint and Junction target. E-002 proves the installed Junction loaded in OMP v17.3.8; `/weconverge status` executed and no Extension load error appeared. |
| AC-102 | **PASS** | E-003 is an ordinary task while disabled: `DISABLED_OK`; status stayed disabled with actual `gpt-5.6-luna/medium` and `activeChildren:0`. |
| AC-103 | **PASS** | E-004 enabled the extension at actual `gpt-5.6-luna/medium`; the closed simple task completed without a WEConverge tool/child and post-task readback stayed Medium/single-agent. |
| AC-104 | **SOURCE GAP** | E-005 records `selectedDirection:"direct"` and backup `alternate`, with `createdChildIds:[]`; however the model made a malformed first call and public OMP exposes no Provider-call counter, so the required no-extra-Provider proof is unavailable. |
| AC-105 | **BLOCKED** | E-006 requested two independent external directions, but formal preflight returned `preflight unavailable (BLOCKED, zero provider calls)`. No child parent links, terminal child evidence, or actual child routes may be claimed. CP-001..004 explain the API boundary. |
| AC-106 | **SOURCE GAP** | No two distinct real Medium failures, High transition, new verification, or XHigh readback were exercised. The simple task and blocked preflight cannot substitute for this ladder scenario. |
| AC-107 | **BLOCKED** | The capability-to-role request (`research -> scout`) was not dispatchable because child effort preflight is unavailable; child actual model/effort readback is also a documented public-API gap. |
| AC-108 | **BLOCKED** | E-006 is the required fail-closed observation: preflight is `unavailable`, status is BLOCKED, and the result explicitly says zero Provider calls. A later/actual Max observation would not satisfy this AC either. |
| AC-109 | **SOURCE GAP** | No necessary-input removal was performed in real OMP, and no `report_source_gap` terminal event was captured. The always-visible `priceTelemetry:"SOURCE GAP"` is a separate telemetry gap, not evidence of the required missing-input scenario. |
| AC-110 | **SOURCE GAP** | No real model switch, old-baseline restore, generation replacement, grant clearing, or stale-child event was observed. No child was forced merely to manufacture this evidence. |
| AC-111 | **SOURCE GAP** | E-006 proves `/weconverge off` leaves no active child and reports user children untouched, but the required High/XHigh restore and persistent-config hash were not exercised; `--no-session` produced a real degraded persistence condition. |
| AC-112 | **SOURCE GAP** | No create-failure, timeout, or actual-route-readback-failure event sequence was run. The blocked preflight had no loop and zero children, but cannot prove all three failure paths or detached-child visibility. |
| AC-113 | **PASS** | E-008's durable review evidence records no OMP core, WeOMP, Provider/Agent, credential, or global-effort config edits; this worker changed only `ACCEPTANCE.md`. The installed Junction is a pointer, not a core/config edit. |
| AC-114 | **PASS** | E-004's natural task terminal returned to `phase:"baseline"` with `actualModel:"gpt-5.6-luna"`, `actualEffort:"medium"`, `activeChildren:0`, and `restoreState:"not_needed"`; no `/weconverge off` was needed for that terminal. |
| AC-115 | **SOURCE GAP** | E-007 proves relaunch load and fresh actual readback only. With `--no-session`, no persisted audit replay can establish identical generation/state or an OMP actual-state reconciliation. |

## 3. Explicit unresolved formal-API gaps

1. **CP-001:** `newSession({parentSession})` is exposed only in command context, not the
   tool/event `ExtensionContext`; automatic child dispatch from `weconverge_decide` is not
   available on this public surface. The observed dispatch is therefore BLOCKED, not a
   fabricated child run.
2. **CP-002:** parent/child metadata can exist in OMP session records, but public Extension
   events do not guarantee that the parent extension receives child Provider events. A
   parent link/terminal-result chain was not observed here.
3. **CP-003:** `ctx.models.resolve()` returns a model definition and supported effort set,
   not the effort that a role dispatch will actually use. Preflight cannot prove a
   non-Max child route before a Provider call; the adapter correctly returns `unavailable`.
4. **CP-004:** `after_provider_response` metadata does not contain resolved model/effort,
   and the parent has no public child actual-route readback. Child route fields remain
   SOURCE GAP; requested role is never presented as actual route.
5. **Provider/price/quota telemetry:** no formal public Provider-call counter, price,
   balance, or subscription-quota readback was available. `priceTelemetry:"SOURCE GAP"`
   is kept independent from routing, task outcome, and BLOCKED.
6. **Restart evidence limitation:** the bounded command intentionally used `--no-session`
   to avoid writing user sessions. It cannot prove persisted audit replay, persistent
   enabled state, or restart reconciliation; those claims remain SOURCE GAP rather than
   being inferred from the fresh relaunch status.

No Max effort was requested or observed in the real smoke: the main actual readback stayed
`gpt-5.6-luna/medium`; child preflight stopped before any Provider call. This is not a PASS
for child Max preflight—AC-108 remains BLOCKED as required by SPEC §19.

## 4. Post-fix real installed-junction smoke (2026-08-20)

This entry is the post-F-01..F-06 code-candidate smoke. It used the installed OMP
junction through normal extension discovery; it did **not** use `--extension` direct
injection and did **not** use `--no-extensions`:

```text
J:\OhMyPi\bin\omp.exe --no-session --cwd J:\PigeonYang\tools\weconverge --no-rules --no-skills --model cockpit-gpt/gpt-5.6-luna --thinking medium --no-title --hide-thinking
```

- OMP startup rendered `omp v17.3.8`, `GPT-5.6 Luna (Cockpit)` and `◑ med`.
  The managed log contained no `Extension load error` (a post-stop log search for
  `Extension load error|extension.*error|Error loading` returned no match).
- Requested route: `cockpit-gpt/gpt-5.6-luna`, effort `medium`; observed OMP/extension
  route: `actualModel:"gpt-5.6-luna"`, `actualEffort:"medium"`. No Max effort was
  requested or observed and no child dispatch was attempted.

### E-009 — post-fix command sequence and exact readbacks

1. `/weconverge status` before enabling returned:

   ```text
   {"enabled":false,"phase":"disabled","generation":1,"baselineModel":"gpt-5.6-luna","baselineEffort":"medium","actualModel":"gpt-5.6-luna","actualEffort":"medium","effortOwner":"external/none","selectedDirection":null,"wave":0,"activeChildren":0,"lastDecision":null,"routingIntegrity":"unverified","restoreState":"not_needed","health":"ok","sourceGaps":[],"priceTelemetry":"SOURCE GAP"}
   ```

2. `/weconverge on` returned:

   ```text
   WEConverge: enabled. baseline model=gpt-5.6-luna effort=medium (Max ban active).
   ```

   The following enabled `/weconverge status` returned `phase:"baseline"`,
   `actualModel:"gpt-5.6-luna"`, `actualEffort:"medium"`,
   `activeChildren:0`, `health:"ok"`, and `priceTelemetry:"SOURCE GAP"`.

3. Safe ordinary task prompt:

   ```text
   Reply with exactly POSTFIX_OK. This is a simple one-step ordinary task; do not call any tools.
   ```

   Terminal result was `POSTFIX_OK`. No WEConverge tool call or child appeared. The
   post-task status again read `enabled:true`, `phase:"baseline"`,
   `actualModel:"gpt-5.6-luna"`, `actualEffort:"medium"`, `activeChildren:0`,
   `health:"ok"`, `routingIntegrity:"unverified"`, and `priceTelemetry:"SOURCE GAP"`.

4. `/weconverge reset` returned:

   ```text
   WEConverge: generation reset (enabled=true); audit kept.
   ```

   Its status readback remained `enabled:true`, `phase:"baseline"`,
   `generation:1`, `actualModel:"gpt-5.6-luna"`, `actualEffort:"medium"`,
   `activeChildren:0`, and `health:"ok"`.

5. `/weconverge off` returned:

   ```text
   WEConverge: disabled; restore=not_needed; WEConverge children detached (user children untouched).
   ```

   Final status read `enabled:false`, `phase:"disabled"`,
   `actualModel:"gpt-5.6-luna"`, `actualEffort:"medium"`, `activeChildren:0`,
   `health:"degraded"`, `sourceGaps:[]`, and `priceTelemetry:"SOURCE GAP"`. The
   degraded state is expected and disclosed: this bounded smoke used `--no-session`,
   so persistence was intentionally unavailable; it is not converted into a PASS.

6. Managed cleanup: `hub stop weconverge-postfix-smoke` reported
   `exited exit=1`; the subsequent managed-process listing reported
   `weconverge-postfix-smoke: exited` and every previously managed smoke process as
   `exited`. No process started by this post-fix smoke remains running.

No AC-101..115 itemized verdict changed. E-009 adds direct installed-junction load,
non-Max Medium actual-route, ordinary-task, lifecycle, zero-child, and cleanup evidence,
but it does not prove the previously missing child-route, ladder, persistence, failure,
or telemetry events. Therefore the itemized verdicts and the overall **SPEC §22:
NOT COMPLETE / REJECTED** conclusion remain honest and unchanged.
 
## 5. E-010 — post-R-01..R-04 installed-junction command and cleanup smoke (2026-08-20)

This bounded smoke used OMP's installed extension discovery through the Junction; it did **not** pass `--extension` and did **not** pass `--no-extensions`:

```text
J:\OhMyPi\bin\omp.exe --no-session --cwd J:\PigeonYang\tools\weconverge --no-rules --no-skills --model cockpit-gpt/gpt-5.6-luna --thinking medium --no-title --hide-thinking
```

- Startup showed `omp v17.3.8`, `GPT-5.6 Luna (Cockpit)`, and `◑ med`. The managed output had no `Extension load error`, `extension.*error`, or `Error loading` text. OMP also reported unrelated configured MCP connection failures (xiaohongshu/xapi); these are not WEConverge extension-load errors.
- Requested route was `cockpit-gpt/gpt-5.6-luna` at `medium`; actual OMP/extension readback stayed `actualModel:"gpt-5.6-luna"`, `actualEffort:"medium"`. No Max effort was requested or observed, and no child route was attempted.
- Initial `/weconverge status` was:

  ```text
  {"enabled":false,"phase":"disabled","generation":1,"baselineModel":"gpt-5.6-luna","baselineEffort":"medium","actualModel":"gpt-5.6-luna","actualEffort":"medium","effortOwner":"external/none","selectedDirection":null,"wave":0,"activeChildren":0,"lastDecision":null,"routingIntegrity":"unverified","restoreState":"not_needed","health":"ok","sourceGaps":[],"priceTelemetry":"SOURCE GAP"}
  ```

- `/weconverge on` returned `WEConverge: enabled. baseline model=gpt-5.6-luna effort=medium (Max ban active).` Enabled status then read `phase:"baseline"`, `actualModel:"gpt-5.6-luna"`, `actualEffort:"medium"`, `activeChildren:0`, `health:"ok"`, and `priceTelemetry:"SOURCE GAP"`.
- Illegal `/weconverge on extra` returned exactly `WEConverge: usage: /weconverge <on|off|status|reset>`. The immediate status remained `enabled:true`, `phase:"baseline"`, `generation:1`, `actualModel:"gpt-5.6-luna"`, `actualEffort:"medium"`, `activeChildren:0`, `health:"ok"`, `routingIntegrity:"unverified"`, `restoreState:"not_needed"`, with no visible mutation.
- Safe ordinary prompt: `Reply with exactly E010_OK and do not call any tools. This is a safe ordinary one-step task.` The provider returned exactly `E010_OK`; no WEConverge tool call or child appeared. Post-task status remained Medium/baseline with `activeChildren:0` and `health:"ok"`.
- `/weconverge reset` returned `WEConverge: generation reset (enabled=true); audit kept.` Its status remained `enabled:true`, `phase:"baseline"`, `generation:1`, `actualModel:"gpt-5.6-luna"`, `actualEffort:"medium"`, `activeChildren:0`, `health:"ok"`.
- `/weconverge off` returned `WEConverge: disabled; restore=not_needed; WEConverge children detached (user children untouched).` Final status was `enabled:false`, `phase:"disabled"`, `actualModel:"gpt-5.6-luna"`, `actualEffort:"medium"`, `activeChildren:0`, `health:"degraded"`, `sourceGaps:[]`, and `priceTelemetry:"SOURCE GAP"`. The degraded health is disclosed rather than upgraded: `--no-session` intentionally prevents persistence.
- Cleanup proof: `hub stop weconverge-e010-smoke` reported `exited exit=1`; the following managed-process listing reported `weconverge-e010-smoke: exited`, with no OMP process started by this smoke still running. No child process was created. The exit code is the managed PTY's observed exit result, while lifecycle state is `exited`.

E-010 strengthens only installed-junction discovery, non-Max Medium actual-route, command usage/no-mutation, ordinary-task, lifecycle, health/zero-child, no-load-error, and cleanup evidence. It does not prove child-route, ladder, persistence/restart, failure-event, or Provider/price telemetry gates. AC-101..115 and the overall **SPEC §22: NOT COMPLETE / REJECTED** verdict therefore remain unchanged; no live child/route/recovery gate was promoted.
