# WEConverge — Pure Advisory Design

- Date: 2026-08-20
- Status: Owner-approved reduced design — pure advisory
- Authority roots: `J:/PigeonYang/tools/weconverge`
- Historical baseline preserved: `docs/spark/2026-08-19-weconverge-design.md` (Owner-approved 2026-08-19)
- Supersession: This document supersedes the 2026-08-19 baseline only through explicit Owner decisions recorded on 2026-08-20. All supersession is explicit; no implicit replacement occurs.
- Evidence: `docs/audits/2026-08-20-weconverge-pure-extension-design-adversarial-audit.md`, `docs/audits/2026-08-20-omp-capability-audit.md`, `PRD.md v1.0.0`, `SPEC.md v1.0.0`, `TECHNICAL_DESIGN.md v1.0.0`, `CAPABILITY_PROBE.md`, `ACCEPTANCE.md`, `REVIEW.md`, `J:/PigeonYang/github/oh-my-pi` source and `J:/OhMyPi/data/.omp/agent/config.yml`
- Product: WEConverge (OMP user-level Extension, authority source `J:/PigeonYang/tools/weconverge`, installed via junction `J:\OhMyPi\data\.omp\agent\extensions\weconverge`)
- Scope: Documentation only. This document does not authorize implementation, PRD/SPEC edits, source edits, ledger edits, tests, builds, or OMP core changes.

> **Implementation authorization:** This document is a design record. It does not authorize implementation. No PRD, SPEC, technical design, plan, ledger, source, test, or OMP modification is authorized by this document. A separate implementation authorization is required before any code or contract change.

---

## 1. Authority and Supersession

### 1.1 Authority order

1. Owner explicit decisions (2026-08-19 baseline approval; 2026-08-20 pure-advisory reduction).
2. `docs/spark/2026-08-19-weconverge-design.md` — historical baseline, preserved.
3. `docs/spark/2026-08-20-weconverge-pure-advisory-design.md` — this reduced design, where it explicitly conflicts with (2) per 2026-08-20 Owner decisions.
4. `PRD.md` v1.0.0.
5. `SPEC.md` v1.0.0.
6. `TECHNICAL_DESIGN.md` v1.0.0.
7. `PLAN.md` and `ledger.json`.

Conflict rule: upstream wins unless this document explicitly records an Owner-approved delta with rationale, old clause retirement, and SOURCE_GAP/BLOCKED treatment. Implementation difficulty or missing public API never silently lowers upstream contracts; it must be recorded as SOURCE_GAP, BLOCKED, or an explicit delta proposal.

### 1.2 What is preserved

The 2026-08-19 baseline, PRD, SPEC, TECHNICAL_DESIGN, PLAN, ACCEPTANCE, and REVIEW remain in repository as historical record. Their BLOCKED and SOURCE_GAP verdicts remain honest. This document adds an explicit reduced contract rather than editing them in place.

### 1.3 What is superseded — only by explicit 2026-08-20 Owner decisions

Only the items listed in Section 13 of this document are superseded, each tied to a named Owner decision on 2026-08-20. Any text in the baseline that is not listed there remains the standing contract.

### 1.4 Document classification

Documentation only. No technical design, plan, ledger, test, or source edit is implied or permitted. Maximum 15-minute documentation window; if truncated, the document records its own partial status explicitly.

---

## 2. Product Promise and Non-Goals

### 2.1 Promise

WEConverge pure advisory is a cost-aware advisory layer above OMP-native Agent, model-role, and Task dispatch. It:

- Injects a compact policy via `before_agent_start` so the expensive parent model can choose to explore with native `task` when evidence indicates non-convergence.
- Advises, not enforces: it recommends bounded exploration via the model's own native `task(tasks=[≤2])` calls and records what the model actually did.
- Keeps the parent model's token and turn cost as the primary cost objective; cheap children are secondary.
- Preserves OMP as sole executor, scheduler, and result assembler.
- Records the gap between what was requested, expected, observed, inferred, and what is SOURCE_GAP — never synthesizing a resolved route.

### 2.2 Non-goals

This design explicitly does not:

- Override, wrap, block, mutate, cancel, or synthesize the native `task` tool.
- Perform automatic child dispatch from `weconverge_decide` or any other Extension path.
- Require a mandatory `weconverge_decide` gate before `task`.
- Enforce Max prohibition, concurrency limits, wave limits, duplicate suppression, or output truncation at the tool boundary.
- Enforce compact child outputs — it can advise a size, but OMP and the child model determine actual output length.
- Create a second scheduler, second child bus, second concurrency/cancellation/result layer, or persistent cross-session child tracking.
- Patch OMP core, modify `J:/OhMyPi` source, modify `config.yml` or model registration, store Provider keys, or assume Provider price/billing telemetry exists.
- Poll for results — all child results arrive via native OMP `tool_result` and `task:subagent:*` push events.

---

## 3. Architecture — Pure Advisory, No Enforcement

### 3.1 System picture

```
OMP Runtime (facts source)
  Agent / modelRoles / Task executor / sessionManager / lifecycle
       |  before_agent_start  |  tool_call (observation)  |  tool_result (observation)
       |  task:subagent:lifecycle | task:subagent:progress | task:subagent:event (observation)
       v
  WEConverge Extension (pure advisory)
    policy injector  ── before_agent_start returns compact systemPrompt[]
    observer         ── pi.on("tool_call") / pi.on("tool_result") / pi.events("task:subagent:*")
    state keeper     ── sessionId#generation scoped, appendEntry durably
    audit logger     ── weconverge_audit entries, sanitize, bounded text
    command handlers ── weconverge on|off|status|reset (advisory state only)
       |
       +---> does NOT call ctx.invokeTool("task"), does NOT block, does NOT dispatch
```

### 3.2 Core architectural decisions — all Owner-approved 2026-08-20

1. **Pure advisory.** No task override, no wrapper `task` tool, no `ctx.invokeTool` for task, no `tool_call` blocking, no input mutation, no cancellation, no automatic child dispatch, no mandatory pre-Task `weconverge_decide`.
2. **Compact `before_agent_start` policy.** The only active shaping mechanism is a short policy returned as `BeforeAgentStartEventResult.systemPrompt`. Native OMP Task remains sole executor of any `task` the parent model independently emits.
3. **Observation only.** Public `tool_call`, `tool_result`, and `task:subagent:*` channels are observed, not intercepted. The observer is fail-open: if the observer errors or is slow, OMP execution continues unchanged.
4. **Model-aware, user-configured capability routes.** Model-specific Max is allowed per capability route as configured by the user. Advisory policy references `modelRoles` and `task.agentModelOverrides`; it does not impose a global Max ban.
5. **Four-fact taxonomy.** Every routing claim is labeled as one of `requested` / `expected` / `observed` / `inferred`, or explicitly `source_gap`. No promotion from `requested` to `observed`.
6. **Single active full runtime plus bounded detached tombstones.** Runtime lifecycle is one active full runtime; late children that outlive their parent turn produce minimal tombstones that are detached. Successful `session_switch` destroys the old full runtime. No public session-delete event is assumed.
7. **Decide only for parent-effort and formal gaps.** `weconverge_decide` is retained only for `raise_effort` state transitions and formal `report_source_gap` / `report_blocked` / manual override; it is not on the normal exploration path.
8. **Main-model cost is primary.** Zero Extension-induced Provider calls for normal exploration; the parent directly batches native `task` when it chooses to. No polling. Policy and advisory text are bounded. Advisory cannot guarantee compact child outputs or enforce limits.

---

## 4. Components

### 4.1 Policy injector (`before_agent_start` handler)

- Returns `BeforeAgentStartEventResult { systemPrompt: string[] }` when enabled.
- Content is compact, bounded, English, and advisory: one directive, two bullet rules, and the literal `task(context, tasks:[≤2])` reference. Target ≤60 tokens.
- Injection is advisory: the model may ignore it. No enforcement follows.
- Generation-scoped injection: inject on `session_start` / `session_switch` and on `off→on` toggle; not on every `turn_start`. This bounds the per-turn token multiplier.

### 4.2 Observer (`tool_call` / `tool_result` / `task:subagent:*` subscribers)

- Subscribes via `pi.on("tool_call")`, `pi.on("tool_result")`, and `pi.events.on("task:subagent:lifecycle" | "progress" | "event")`.
- All handlers are synchronous observation, never blocking. They record:
  - `tool_call`: requested `task` arguments as observed (requested fact).
  - `tool_result`: native Task result `details` including `SingleResult[]` as observed.
  - `task:subagent:lifecycle`: child id, agent, parentToolCallId, sessionFile, status.
  - `task:subagent:progress`: `modelRole`, `resolvedModel` when present; no synthetic `resolvedEffort`.
  - `task:subagent:event`: coarse core events for audit correlation.
- Handlers never return `{ block: true }`, never revise `input`, never cancel, never mutate.
- Handler budget: ≤5 ms, no `await`, no filesystem I/O, no network. Persistent state is read at lifecycle events and cached.

### 4.3 State keeper

- Session-local state keyed by `sessionId#generation`.
- State resets on `session_switch` (generation increments) and on `session_shutdown` recovery.
- State is advisory bookkeeping, not enforcement state: it tracks `enabledAtStart`, `phase`, `baselineModel`, `baselineEffort`, `currentModel`, `currentEffort`, `selectedDirection`, `alternativeDirectionIds`, `explorationWave` (observed, not enforced), `ownedChildRuns` (observed children, not owned), `lastDecision`, and `restoreState`.
- `appendEntry("weconverge_audit", AuditEventV1)` persistence plus extension-owned versioned file where available. No session file scraping; no arbitrary session registry read.

### 4.4 Configuration resolver

- References OMP `modelRoles` and `task.agentModelOverrides`; does not store Provider credentials.
- User-configured `cost_tiers` / `relativeCostTiers` / `capabilities` describe relative cost and which role backs each capability.
- Model-specific Max is permitted: a capability whose backing resolved model is documented as Max-capable is an advisory note, not an automatic block. The pre-2026-08-19 global Max ban is retired per Section 13.

### 4.5 Audit logger

- Appends `weconverge_audit` entries via `pi.appendEntry`. Each entry is sanitized for credentials, hidden reasoning, and full parent context.
- Logged facts are labeled: `requested` (model-emitted arguments), `expected` (capability → role mapping), `observed` (readback fields that are present on public events), `inferred` (model derived from `cost_tiers` or naming heuristics, explicitly marked), `source_gap` (unavailable via public API).
- `relativeCostTier` is never presented as `resolvedEffort`.

### 4.6 Command handlers

- `weconverge on` / `off` / `status` / `reset` via `registerCommand`.
- All are advisory local state transitions; none cancels remote children or deletes sessions.

### 4.7 `weconverge_decide` (narrowed role)

- Retained only for: (a) parent-effort state changes (`raise_effort` with confirmed evidence), (b) formal `report_source_gap` / `report_blocked`, (c) explicit manual override / manual exploration grant.
- Not required before `task`. Normal exploration is the parent directly emitting native `task` without calling `weconverge_decide`.

---

## 5. Lifecycle

### 5.1 Session and generation

- `session_start`: read `enabled`; if enabled and idle, establish new session-local baseline by reading current actual model/effort via public readback where available; create generation 1; clear prior task's advisory evidence; write audit replay if persistence is available.
- `session_switch` / `session_before_switch`: recover owned session-local effort if applicable, increment generation, clear per-generation advisory state, establish new baseline for the new model, mark prior children as detached tombstones.
- `session_shutdown` / `session_stop`: attempt to restore owned session-local effort and read back actual; record `restoreState`; produce audit entry. No deletion of public sessions assumed.

### 5.2 Runtime topology

- **One active full runtime.** At any moment there is exactly one active full runtime (the current `sessionId#generation`). It contains the policy injector, observer, state keeper, and command handlers for that session.
- **Bounded minimal detached tombstones.** Late children that complete after their parent turn has ended leave a minimal detached record: `childId`, `parentToolCallId`, `sessionFile`, `status`, `resolvedModel` (if observed), truncated output preview ≤200 chars. Tombstones are not active runtimes; they hold no handlers and consume no event bus.
- **Switch destroys old full runtime.** A successful `session_switch` destroys the old full runtime; its state is not retained beyond what was durably appended. No public session-delete event is available, so tombstone reclamation is via bounded retention (max 2 tombstones per generation, oldest dropped) rather than a delete notification.
- **No second scheduler.** The runtime does not create its own concurrency pool; OMP's executor owns scheduling, cancellation scope, and result assembly.

### 5.3 Phase semantics (advisory, not enforcement)

- `disabled` — Extension present but policy not injected; observer silent.
- `baseline` — Enabled, ordinary single-agent task with current parent model at observed effort.
- `executing` — Parent model executing its chosen direction (advisory internal-search phase).
- `external_exploration` — Observed when parent has emitted native `task` with exploration probes; phase set from observation, not from a decision gate.
- `integrating` — Parent is synthesizing child results after observed `tool_result` / progress.
- `source_gap` / `blocked` — Formal gap or blocker reported via `weconverge_decide` only; not set by normal observation.
- `completed` / `degraded` — Terminal or health-degraded (observer or persistence failure).

Phases are derived from observed events and formal `weconverge_decide` reports; they never drive blocking.

### 5.4 Off, reset, and degraded

- `off`: set persistent `enabled=false`; return `undefined` from `before_agent_start`; observer handlers become no-ops for new `task` observation; running children continue under OMP — they are marked detached in audit and excluded from further advisory correlation. No OMP child cancellation is attempted.
- `reset`: clear current-generation advisory state and restore baseline; retain audit log; do not clear `health` / `sourceGaps` beyond the current generation.
- Observer error: any observer exception is caught, logged as `health: degraded` with reason, and execution continues (fail-open). No block, no retry loop, no hidden recovery mutation.

---

## 6. Configuration

### 6.1 User-configured capability routes

```yaml
roles:
  integrator: current          # parent session model
  cheap_worker: task           # OMP Task role alias @task
  mechanical_worker: sonic     # alias @sonic
  researcher: scout            # alias @scout
  reviewer: reviewer           # alias @reviewer
  frontend_specialist: designer

cost_tiers:
  current: 2
  task: 1
  sonic: 1
  scout: 1
  reviewer: 1
  designer: 2

capabilities:
  cheap_worker: task
  mechanical_worker: sonic
  researcher: scout
  reviewer: reviewer
  frontend_specialist: designer

# Optional advisory only — not an enforcement gate
# maxParallelExplorers / maxExplorationWaves are advisory values
# shown in status and audit; the Extension does not block if the model
# emits larger batches.
```

### 6.2 Model-aware Max semantics (no global ban)

- The pre-2026-08-19 global automatic-Max ban is retired.
- `cost_tiers` and `capabilities` are user configuration; they do not prove wire effort. `hi` can map to Max on a Max-capable model; `lo` is the lowest supported level on the eventually resolved model, not a universal non-Max guarantee.
- `modelRoles.task: cockpit-gpt/gpt-5.6-luna:max` in live config is evidence that the current configured Task role is Max-capable; it is reported as `expectedModel: gpt-5.6-luna` with `inferredMaxCapable: true`, not as an observed child route.
- Automatic `task` emission by the parent model is never blocked for Max. If a child observes `resolvedModel` suffix indicating Max, it is recorded as `observedModel` and `observedIsMax: true` — an advisory annotation, not a block.
- The only Max-related hard rule retained is honesty: never synthesize `resolvedEffort` from `relativeCostTier`.

### 6.3 Where configuration lives

- OMP owns `modelRoles` and `task.agentModelOverrides`; WEConverge reads but never writes them.
- WEConverge owns `enabled` (persistent via `appendEntry` plus versioned file) and per-generation advisory state.

---

## 7. State Semantics

### 7.1 Fact taxonomy

Every routing or cost statement is labeled with one of:

- `requested` — The parent model actually emitted it in a `tool_call` for `task` (e.g., `requested.agent`, `requested.effort: lo|med|hi|auto|undefined`, `requested.task` text).
- `expected` — The configuration says a capability should resolve to a given role (e.g., `expected.role: @task` for `capability: cheap_worker`, `expected.relativeCostTier: 1`). Not probative of actual dispatch.
- `observed` — A public OMP event or result field returned it (e.g., `observed.resolvedModel` from `progress.resolvedModel` / `SingleResult` metadata, `observed.lifecycleStatus: started|completed`, `observed.actualModel/currentEffort` from `getThinkingLevel` at `turn_start`). Only these fields are presented as fact.
- `inferred` — A heuristic derived by WEConverge for advisory sorting (e.g., `inferred.relativeCostTier` from `cost_tiers`, `inferred.maxCapable` from naming). Always marked `inferred`; never shown as observed.
- `source_gap` — The required fact is not available via the public Extension surface (e.g., `source_gap: resolvedEffort`, `source_gap: providerPrice`, `source_gap: providerBilling`, `source_gap: actualEffortPerChild` when not in lifecycle/progress).

No promotion is permitted: `requested` does not become `observed`; `expected` does not become `resolved`.

### 7.2 State record (advisory)

```text
enabledAtStart: boolean
phase: Phase
baselineModel: string | unknown
baselineEffort: Effort | unknown
currentModel: string | unknown
currentEffort: Effort | unknown
selectedDirection: string | null          // advisory direction chosen by parent, observed from parent text/task context
alternativeDirectionIds: string[]         // advisory backup identifiers
explorationWave: number                  // observed count of task batches emitted by parent (advisory)
ownedChildRuns: [{ childId, parentToolCallId, observedAgent, observedModel, status: observed }]
lastDecision: { decisionId, effectiveAction, reason } | null  // only for weconverge_decide parent-effort / gap / manual paths
restoreState: "not_needed" | "restored" | "failed" | "degraded" | "unknown"
health: "ok" | "degraded"
sourceGaps: string[]                      // explicit list, e.g., ["resolvedEffort","providerPrice","providerBilling"]
routingIntegrity: "unverified" | "verified" | "degraded" | "source_gap"
priceTelemetry: "SOURCE GAP"              // always, until a public price API exists
```

All fields are `unknown`/`source_gap` until a public event proves them. `routingIntegrity` and `taskOutcome` are independent per SPEC integrity separation; neither derives the other.

### 7.3 Integrity independence

`routingIntegrity`, `taskOutcome`, `sourceGaps`, `blockedReason`, `restoreState`, and `health` are mutually independent. Price SOURCE_GAP does not imply routing failed; child failed does not imply parent BLOCKED; routing PASS does not imply task completed.

---

## 8. Data and Audit Flow

### 8.1 Event flow (observation only)

```
turn_start (observed getThinkingLevel) ──┐
                                         v
before_agent_start ──> policy injection (advisory, bounded)
                                         |
parent model emits native task? ──no──> continue single-agent reasoning
                                         | yes (model choice)
                                         v
                           tool_call observed (requested fact)
                                         |
                           task:subagent:lifecycle (observed)
                           task:subagent:progress  (observed resolvedModel where present)
                           task:subagent:event     (observed core events)
                                         |
                           tool_result observed (SingleResult[] assembled by OMP)
                                         |
                           appendEntry weconverge_audit (observed + expected + inferred + source_gap)
                                         |
                           status/readback reflects observed facts only
```

### 8.2 Audit event

Each audit entry records:

```
timestamp, sessionId, generation, parentAgentId,
requested: { agent, effort, taskPreview },
expected: { role, relativeCostTier },
observed: { resolvedModel, resolvedEffort: source_gap|unknown, lifecycle, progress },
inferred: { relativeCostTierNote: "not probative of actual Provider wire effort" },
sourceGaps: ["resolvedEffort","providerPrice","providerBilling","actualEffortPerChild"],
restoreResult, health, isDetachedTombstone?: boolean
```

All text is truncated to ≤200 chars at the audit boundary and sanitized for credentials.

### 8.3 Persistence

- In-session `pi.appendEntry("weconverge_audit", AuditEventV1)` plus versioned extension-owned file when writable.
- Replay: `sessionManager.getBranch()` scan of appended entries; `--no-session` yields no persistence (honest degraded, not inferred).
- No polling: all child evidence arrives via push (`tool_result` details and `task:subagent:*` events). `pi.events` subscriptions are synchronous.

### 8.4 Observer fail-open

If any observer handler throws or exceeds its synchronous budget, the error is recorded as `health: degraded` with `sourceGaps += ["observer:<reason>"]`, and OMP continues to execute the underlying `task` or turn. No block, no revision, no retry is emitted to the model.

---

## 9. Error Handling

| Condition | Handling | Why |
|---|---|---|
| Policy injection fails | Record `degraded`, continue ordinary OMP task; no second attempt within same generation. | Injection is advisory. |
| `tool_call` handler error | Catch, log `health: degraded, observer:<reason>`, allow OMP `task` to proceed unchanged. | Observer is fail-open. |
| `tool_result` observation lost | Record `source_gap: childResultDetails`; do not synthesize. | No mock completion. |
| `task:subagent:*` not emitted | Record `source_gap` for lifecycle/progress; do not infer success. | Missing event is gap, not success. |
| `weconverge_decide` schema invalid | Return `rejected` with reason; no side effect. | Fail-closed for formal gating only. |
| `raise_effort` preconditions unmet (wrong difficulty, no confirmed evidence, bad baseline) | Return `rejected` or `source_gap`; do not change thinking level. | Effort gate is the only remaining enforcement. |
| `setThinkingLevel` fails or readback mismatches | Keep current effort, mark `restoreState: failed\|degraded`, do not write persistent config. | Parent effort ownership only. |
| `getThinkingLevel` unavailable | Record `source_gap: actualEffort` at `turn_start`; do not infer from requested effort. | Taxonomy rule. |
| Persistence write fails | Set `health: degraded`, keep memory state; do not block parent turn. | Audit loss is degraded, not fatal. |
| Price / billing / quota unreadable | Record `priceTelemetry: SOURCE GAP`; routing proceeds via relativeCostTiers with explicit note. | Independent dimensions. |
| User manually changes model/effort | Treat as external ownership change; abandon last advisory effort claim, re-read baseline, mark `degraded` with reason. | No silent overwrite of manual change. |
| Late child completion after switch | Attach to bounded tombstone, mark `stale`; do not trigger new advisory action. | No cross-generation auto-retake. |

No error path creates a background unlimited exploration loop or presents a command-success as task-acceptance.

---

## 10. Commands (Advisory Scope)

Registered via `registerCommand`:

```
weconverge on
weconverge off
weconverge status
weconverge reset
```

- `on`: Persist `enabled=true` for subsequent new tasks. Current idle task may establish a new baseline. Does not inject a policy retroactively into the current turn's already-sent system prompt.
- `off`: Persist `enabled=false`. Stop injecting policy on future `before_agent_start`. Keep observer subscriptions registered but mark their output as advisory-detached. Do not attempt to cancel OMP children. Mark running children as `detached` in audit (user children untouched). Restore any session-local effort the Extension previously set; record restore result honestly.
- `status`: Read-only. Renders exactly: `enabled`, `phase`, `baselineModel/Effort`, `currentModel/Effort`, `effortOwner`, `selectedDirection`, `alternativeDirectionIds`, `explorationWave` (observed), `activeChildren` (observed active), `lastDecision` (only for formal `weconverge_decide` parent-effort/gap/manual), `restoreState`, `health`, `sourceGaps`, `priceTelemetry: SOURCE GAP`, `advisoryNote: pure advisory — no enforcement`. No hidden inference.
- `reset`: Clear current-generation advisory state; re-establish clean baseline; preserve audit log; do not alter `enabled`. If persistence is unavailable (`--no-session`), record `health: degraded` instead of claiming reset persistence.

Illegal arguments (e.g., `weconverge on extra`) are rejected with usage text and produce zero state change.

---

## 11. Main-Model Token Economics

### 11.1 Primary objective

The parent model's input + output + reasoning tokens are the primary cost. Child cost is secondary and advisory.

### 11.2 Zero Extension-induced Provider calls — normal exploration

- Normal exploration is the parent model itself deciding to call native `task`. The Extension never issues an Extension-initiated Provider call on that path.
- The only Provider calls that `weconverge_decide` can still cause are the narrow formal paths: `raise_effort` evaluation, `report_source_gap` / `report_blocked`, and explicit manual grants. These are rare and labeled as such.
- There is no polling: `SingleResult[]` assembly and `task:subagent:*` are push. No periodic `read` or re-query.

### 11.3 Direct native task batch

- When the parent model chooses exploration, it batches `task(context, tasks=[≤2])` directly to OMP. Batch assembly cost is parent reasoning + output tokens, billed once. OMP handles concurrency and result assembly natively.

### 11.4 Bounded policy and advisory text

- Policy injection is ≤60 tokens and generation-scoped (Section 4.1), not per-turn. At 25 turns this costs ~60 tokens total of injected context, not 25×60.
- Advisory guidance (status, audit truncation, progress handling) avoids re-injecting blocked reasons verbatim; blocked reasons are written to audit only, not echoed into the next system prompt.

### 11.5 What remains billed

| Cost source | Billed to | Why advisory still respects it |
|---|---|---|
| Policy tokens (bounded, generation-scoped) | Parent input each turn within the injection generation only | Disclosed but amortized. |
| Probe synthesis (parent reasoning + task JSON) | Parent reasoning + output | Necessary parent cost; bounded by 2 probes per batch. |
| Child execution and output | Provider-executed children; child output tokens returned as parent input on synthesis | Bounded only by the model's own batch size; advisory cannot guarantee child output length. |
| Blocked or failed formal `weconverge_decide` | One parent tool call when the narrow path is used | Rare; not on normal exploration. |
| `before_provider_request` / `after_provider_response` hooks | None — Extension does not register Provider hooks in pure advisory | Intentionally not used. |

### 11.6 What remains advisory-only (not enforced, not counted as proof)

- The model may emit `task(tasks=[>2])`, may loop additional waves, or may omit a `falsifier` line. The advisory records the observed batch size and wave count but does not block it.
- Child output compactness cannot be guaranteed: the advisory can suggest `taskPreview ≤200 chars` and `output ≤N` in policy, but OMP and the child model determine actual output. Audit records the observed length and truncates only its own copy.

---

## 12. Acceptance Design

### 12.1 Three evidence layers — separated, never mixed

1. **Mechanical (deterministic).** `src/core/*` pure functions under fake `ExtensionAPI`: lifecycle phase transitions, generation scoping, `weconverge_decide` narrow gating (version == 1, parent-effort preconditions), fact taxonomy labeling, audit sanitization/truncation, off/detached semantics, observer fail-open. Evidence form: typecheck, fixture, and bounded in-process tests. Never claims live OMP.

2. **Live OMP (observed).** Real junction load, command sequence, `before_agent_start` injection observed at generation start, `tool_call` / `tool_result` / `task:subagent:*` observed where emitted, child `resolvedModel` where progress provides it, `restoreState` readback where `setThinkingLevel` succeeds. Evidence form: terminal/log with exact tool_call previews, `actualModel`/`actualEffort` readback where public, and explicit SOURCE_GAP where unavailable. `priceTelemetry: SOURCE GAP` is the only honest price claim.

3. **Cost (token economics).** Generation-scoped policy token count, parent synthesis cost per exploration batch, child output length as observed. Evidence form: measured turn transcripts, not a synthetic provider-call counter claim. No claim of "zero extra Provider calls" via synthetic preflight; that claim requires a public preflight result that does not exist.

### 12.2 Retire, do not fake

Old `ACCEPTANCE.md` / `SPEC` items that require enforcement (blocking, mutation, cancellation, automatic dispatch, pre-provider non-Max proof, enforced concurrency/wave/duplicate/compact-output) are retired for this reduced design rather than faked PASS. Retirement mapping is in Section 13.

Acceptance is `COMPLETE` only when:

- Mechanical fixtures pass for the advisory contract as written, and
- Live OMP evidence demonstrates observation (not enforcement) for the direct `task` path, and
- Cost evidence demonstrates bounded policy and single-batch native task handling, and
- No retired AC is presented as PASS.

### 12.3 Honest audit gates

- `requested` vs `expected` vs `observed` vs `inferred` vs `source_gap` separation is verified by fixture: presenting `expected` as `observed` fails the fixture.
- `relativeCostTier` presented as `resolvedEffort` fails the fixture.
- Observer-thrown fixture must show `health: degraded` and OMP task still completes (fail-open).

---

## 13. Contract Migration Impact

### 13.1 Explicit Owner decisions 2026-08-20 that supersede 2026-08-19 baseline

| # | Baseline clause | Delta in this design | Rationale |
|---|---|---|---|
| D-01 | SPEC §6-10 / CAP-005 / TECHNICAL_DESIGN §3: `weconverge_decide` is the sole logical gate and dispatches `explore_in_parallel` via `newSession({parentSession})`. | **Retired.** `weconverge_decide` is narrowed to parent-effort change and formal `source_gap`/`blocked`/manual override. Normal exploration is direct native `task` emitted by the parent model; the Extension never dispatches children. | Public `ExtensionContext` does not expose `newSession` and `ctx.invokeTool` is same-name only; automatic dispatch from `weconverge_decide` is BLOCKED on the public surface (audit evidence F-02). |
| D-02 | SPEC §5.2 / TECHNICAL_DESIGN §6: Automatic cost enforcement — global Max ban, ≤2 parallel explorers, ≤2 waves, duplicate evidence gate, falsifier gate, compact-output enforcement. | **Retired as enforcement; retained as advisory.** Limits are shown in `status` and recorded in audit as observed values with advisory notes; the Extension does not block, mutate, or cancel when the model exceeds them. | Pure advisory cannot prove effective `model+effort` pre-provider and cannot enforce via `tool_call` without violating "no blocking/mutation/cancellation". Enforcement is incompatible with observation-only per Owner decision. |
| D-03 | SPEC §11 / §4.2 / CAP-006: Effort ladder `medium → high → xhigh` with automatic Max rejection at the `tool_call` boundary. | **Parent-effort only.** The ladder governs `weconverge_decide raise_effort` only. Automatic `task` Max is not blocked; model-specific Max is allowed per user-configured capability routes. `resolvedEffort` remains `source_gap`. | No public `task.preflight` delivering `effective {model, effort}` before a Provider call (F-01). The honest contract is model-aware routes with post-call observation. |
| D-04 | SPEC §4.4 / §13: `ResolvedRouteV1` with `resolvedEffort: "xhigh"` as a provable post-call field. | **Amended to SOURCE_GAP.** `resolvedEffort` is `unknown`/`source_gap` until a public contract exposes it; `observed.resolvedModel` suffix is advisory corroboration only. | `task:subagent:progress` and `SingleResult` expose `modelRole`/`resolvedModel` but no dedicated effort field; child Extension hooks are not forwarded to parent (F-03, F-08). |
| D-05 | SPEC §6.1 CP-001 / CAP-001: Automatic external exploration is dispatchable by the Extension. | **Retired as dispatchable; retained as observed.** Exploration is dispatchable only by the parent model natively; the Extension observes. | Verified BLOCKED for Extension dispatch (audit POC `taskWrapperInvocations: 0` before valid `weconverge_decide` BLOCKED). |
| D-06 | Runtime: "one Extension runtime per parent session with child tracking via parent-child link". | **Amended to:** one active full runtime plus bounded minimal detached tombstones; successful switch destroys old full runtime; no public session-delete event. | No public parent↔child session registry readback or delete event is available via ExtensionAPI; tombstones are the honest bounded record. |
| D-07 | SPEC §22 / ACCEPTANCE.md AC-105/AC-107/AC-108 ladder completeness. | **Retired as PASS gates.** Moved to `Retired / not applicable under pure advisory` in acceptance design (Section 12). Mechanical/live/cost separation replaces the ladder-PASS check. | Retiring incompatible ACs is honest per Section 12; faking PASS is prohibited. |

### 13.2 Clauses that remain in force

- Boundary: no second scheduler, no junction-scraping, no credential handling, no persistent global effort write, no second child bus — RETAINED.
- Commands `on|off|status|reset` contract and `status` read-only shape — RETAINED, scoped to advisory.
- Evidence-anchored `raise_effort` (difficulty `reasoning_depth_insufficient` + confirmed evidence + baseline verification + post-change readback) — RETAINED.
- Audit separation (`requested` vs `resolved`), sanitization, truncation, and persistence — RETAINED with taxonomy labels.
- `relativeCostTier` as configured estimate, never presented as wire effort — RETAINED.

### 13.3 Migration for ledger, plan, and source

- No `ledger.json` or `PLAN.md` edit is authorized by this design. If implementation is later authorized, the ledger must reflect the retired items explicitly rather than carrying forward the blocked ladder entries as pending.
- No `src/` edit is authorized. Future advisory implementation would remove `task` wrapper, `tool_call` blocking, `preflightEffort` gating, `emitChild`, and related enforcement paths, and replace them with the observer-only components described here.
- `ACCEPTANCE.md` retains its existing NOT COMPLETE / REJECTED verdict for the old contract; a new acceptance layer per Section 12 would be introduced alongside it, not by rewriting old rows.

---

## 14. Source Gaps (Remaining and Unchanged)

These are not to be retrofit via undocumented file reads or synthetic preflight:

| Gap | Why it stays SOURCE_GAP |
|---|---|
| Effective `task` preflight (`{effectiveModel, concreteThinkingLevel, wouldBeMax}` before a Provider call, with authFallback and ceiling) | Internal to `task/executor.ts:2820-2894`; no public Extension surface exposes it. Mitigation under pure advisory is honest post-call observation, not a synthetic allow-list gate. |
| Per-child `resolvedEffort` | No dedicated public effort field in `task:subagent:lifecycle` or `SingleResult`; progress carries `modelRole`/`resolvedModel` only. Suffix parsing is not a stable contract. |
| Provider / payload provenance per wire request | `before_provider_request.payload: unknown`, provider-specific `onPayload` semantics (OpenAI Completions ignores return); not a universal Max gate. |
| Provider price / billing / quota / balance telemetry | No public price or quota readback; `priceTelemetry: SOURCE GAP` is the only honest claim. Advisory uses `relativeCostTier` with explicit disclaimer. |
| General parent↔child session registry readback | No traversible `parentSessionId → childSessionIds` public API from parent Extension; `parentToolCallId` / session file observed where present, but not a registry. |
| Child Extension event forwarding | Child `tool_call` / `tool_result` / Provider hooks run on a fresh `EventBus` not forwarded to parent; parent sees only `task:subagent:*` coarse channels. |
| Cross-profile persisted replay | `appendEntry` replay depends on `sessionManager.getBranch()`; `--no-session` intentionally yields no persistence. Not inferred from fresh load. |
| Public session-delete event | No delete notification for tombstone GC; bounded retention is used instead. |
| Compact child output guarantee | Child output length is controlled by OMP and the child model; policy advice cannot enforce truncation. |

---

## 15. Resolved Adversarial Findings

Reference: `docs/audits/2026-08-20-weconverge-pure-extension-design-adversarial-audit.md` (R-01..R-10). Under pure advisory, each finding is resolved by retiring enforcement, not by adding it:

| Finding | Old risk | Pure-advisory resolution |
|---|---|---|
| F-01 — No public non-Max invariant | Fatal if enforcement retained | **Retired.** Model-aware configured routes allow Max; `resolvedEffort` stays `source_gap`. Observation records `observedIsMax` post-call; no synthetic preflight is claimed. |
| F-02 — Model-cooperation gate | Fatal if prior wrapper claimed reliable dispatch | **Accepted as architecture.** Exploration runs only when the parent model emits `task`; omission is not an error. Policy is instruction, not guarantee. No polling shim is added. |
| F-03 — `tool_call` timeout and mutation order | Fatal if handler assumed non-blocking-last-write-wins | **Eliminated.** No `tool_call` blocking or mutation path exists; handler is observation only and fail-open. |
| F-04 — Session/child isolation & `off` semantics | Major — stale writes, cross-generation leak | **Bounded.** One active full runtime plus tombstones; generation-keyed state; `off` detaches but does not cancel. |
| F-05 — Wave/concurrency bypasses | Major — unbounded second `task` or `tasks.length>2` | **Advisory.** Observed `tasks.length` and wave count are recorded; no block on `>2` or third wave. |
| F-06 — Duplicate / reworded duplicate | Major — no evidence gate before Task | **Advisory.** Duplicate evidence is recorded with a canonical hash for audit correlation only; no block. |
| F-07 — Recursive delegation / cost amplification | Major — unbounded nesting | **Contained by advisory perimeter.** Policy advises single-level probes; child inherits no special blocking, but advisory explicitly declares "no nested probes" as non-goal and records recursion as observed if it occurs without blocking. |
| F-08 — Phantom `resolvedEffort` | Major — synthetic `relativeCostTier` masquerading as effort | **Fixed by taxonomy.** `inferred.relativeCostTier` always marked "not probative of actual Provider wire effort"; `observed.resolvedEffort` is `source_gap` until public. |
| F-09 — Hidden main-model token costs (per-turn policy, retry loops, synthesis) | Major — undercounted overhead | **Bounded.** Generation-scoped ≤60-token policy; no block→retry loop; post-call synthesis size observed and truncated only in audit copy. |
| F-10 — Silent contract deletions | Major — SPEC deltas hidden | **Explicit.** Section 13 lists every retained vs retired clause; no hidden deletion remains. |

---

## 16. Explicit Non-Goals and Advisory Limits (Consolidated)

- Advisory does not and cannot guarantee compact child outputs, enforce ≤2 probes, enforce ≤2 waves, prevent duplicate evidence, prove `resolvedEffort`, provide provider price/billing, provide non-Max proof pre-provider, or expose a public session-delete event. These are declared non-goals and handled as `source_gap` or `observed` with advisory note.
- Advisory does not introduce polling, retries, or wrapper re-scheduling.
- Advisory does not modify OMP core. The smallest single new OMP surface that would be worth discussing (not authorized here) would be a public `task.preflight` returning `{effectiveModel, concreteThinkingLevel, wouldBeMax, wouldCallProvider}` without side effects, or a public `resolvedEffort` in `progress`/`SingleResult`. Neither is requested by this document.

---

## 17. Verification That Is Not Claims

This design is documentation only. Each normative claim is verifiable without implementation:

- `before_agent_start` returns `systemPrompt` — `extensions/types.ts:1037-1039`.
- `tool_call` / `tool_result` / `task:subagent:*` are public observation surfaces — `extensions/types.ts:824-880, 1124-1178` / `utils/event-bus.ts` / `task/types.ts:58-104`.
- Same-name wrapper is real but intentionally not used here — `docs/extensions.md:319-337`; not taking that path is the design choice.
- `turn_start` + `getThinkingLevel()` snapshot is parent-session only — `agent-session.ts:5283-5292`; `agent-loop.ts:1158-1181`.
- Effort `lo|med|hi` semantics and `hi→Max` possibility — `task/types.ts:195-277`; `executor.ts:2872-2894`.
- No global Max guarantee via Extension preflight — `CAPABILITY_PROBE.md:38-50`; `ACCEPTANCE.md` E-006 BLOCKED observation.

---

*End of pure-advisory design. No implementation is authorized by this document.*
