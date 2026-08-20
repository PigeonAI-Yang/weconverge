# WEConverge v1 — T08 Bounded Final Source Review

> Scope: final read-only source review of the repaired F-01..F-06 and R-01..R-07 contracts. The only file changed by this review is REVIEW.md; source, tests, OMP files, configuration, credentials, and ACCEPTANCE.md were read-only.
> Authority order: docs/spark/2026-08-19-weconverge-design.md > PRD.md > SPEC.md > TECHNICAL_DESIGN.md > PLAN.md > ledger.json.

## Verdict

**T08: PASS — deterministic source review complete.**

R-05 (actual model plus effort replay reconciliation), R-06 (exact duplicate response with no side effects), and R-07 (recursive canonical hashing of all accepted passthrough fields) are closed by the current source and regression fixtures. The extension now serializes `result.state`, which is the stored first result on an exact retry, while the duplicate branch leaves the extension's current live state untouched and skips persistence and audit writes. Thus the canonical duplicate response and the later live safety state are both preserved.

The supplied proof is mechanical acceptance **210/210 PASS**, extension integration **95/95 PASS**, and core+extension typechecks **exit 0**. These results were supplied for this review and were not rerun. They do not constitute real-OMP acceptance. T07/live child, route, recovery, telemetry, and persisted-replay evidence remains **BLOCKED/SOURCE GAP**, and SPEC §22 remains **NOT COMPLETE / REJECTED**.

## Evidence boundary

- test/mechanical.test.ts is deterministic and has no real OMP, network, child Provider, or paid-model execution. It covers core behavior only.
- test/extension.integration.test.ts uses an in-process fake ExtensionAPI. Its 95/95 result proves fake wiring and lifecycle behavior, not real OMP child dispatch or child-route readback.
- ACCEPTANCE.md:1-16 and :186-198 keep the real AC-101..115 limitations explicit. ACCEPTANCE.md:227-329 records the installed-junction Medium smoke and its unchanged child-route, ladder, failure-event, telemetry, and persistence/restart gaps. No bounded smoke promotes those rows or SPEC §22 to complete.

## F-01..F-06 final disposition

| Finding | Disposition | Exact current evidence |
|---|---|---|
| **F-01 audit schema/replay/degraded preservation** | **PASS for deterministic source/core contract; live replay remains SOURCE GAP** | src/core/audit.ts:279-330 validates and replays ordered snapshots, compares owned actual effort and model, and records both conflict errors; markReplayDegraded at :252-260 sets degraded, source_gap, and a blocking reason. src/extension.ts:219-234 validates before append. The replay and conflict fixtures are test/mechanical.test.ts:645-704, including the R-05 model conflict at :653-663. |
| **F-02 central automatic-action fuse** | **PASS for deterministic source/core contract; live capability limits remain BLOCKED/SOURCE GAP** | automaticActionBlockReason is centralized at src/core/decision.ts:106-116 and every resource action checks it at :381-384. The preflight unavailable/blocked path remains fail-closed with zero Provider calls; mechanical F-02 coverage is test/mechanical.test.ts:388-404 and missing-state wiring coverage is test/extension.integration.test.ts:642-668. |
| **F-03 version gate/schema** | **PASS** | The tool schema requires numeric version at src/extension.ts:368-402 and core semantic validation requires exactly version 1 at src/core/decision.ts:342-360. Version 2 and missing-version rejection/no-child assertions pass at test/mechanical.test.ts:393-400. Passthrough fields do not bypass this gate. |
| **F-04 exact complete duplicate/no side effects** | **PASS** | Core DecisionRegistry records the first complete RegistryResult at src/core/ledger.ts:6-20 and :68-84, and src/core/decision.ts:323-334 returns that result without rerunning actions. The extension duplicate branch skips live-state assignment, persistence, and audit writes, then serializes `state: result.state` at src/extension.ts:412-460. Core duplicate metadata/routes/children/side-effect assertions pass at test/mechanical.test.ts:751-769; the extension tests deep-compare complete first/retry responses and separately assert no append/action plus the current safety fuse at test/extension.integration.test.ts:433-488. |
| **F-05 order-insensitive evidence-set guard** | **PASS** | wouldRepeatSameAction de-duplicates evidence and direction sets at src/core/cost.ts:76-102, with the exploration-wave guard in src/core/decision.ts. The reordered evidence regression rejects the repeat at test/mechanical.test.ts:444-454. |
| **F-06 Max/stale-child handling** | **PASS for deterministic core; live child route/preflight remains BLOCKED/SOURCE GAP** | Child Max stays unconfirmed in buildResolvedRoute at src/core/route.ts:52-86. dispatchBounded checks all returned routes and marks created children stale when Max is observed at src/core/decision.ts:668-702; preflight Max stops before emission. The current Max/stale assertions are test/mechanical.test.ts:401-404. The installed adapter still returns preflight unavailable and has no public child route/readback path, so no live PASS is claimed. |

## R-01..R-07 final disposition

| Repair | Disposition | Exact current evidence |
|---|---|---|
| **R-01 append-failure duplicate health** | **PASS for the covered fake-runtime contract** | persistState and persistEvent convert append failures to degraded health at src/extension.ts:190-234. The duplicate path performs no new persistence or action, while the current live health remains degraded. The fixture verifies complete IDs, no new entries/side effects, and the degraded fuse at test/extension.integration.test.ts:417-430. |
| **R-02 command arity/no mutation** | **PASS** | parseCommand rejects extra tokens at src/core/commands.ts:11-22 and the handler returns before mutation. The integration fixture checks on extra, off extra, and reset extra leave entries, settings, and state unchanged at test/extension.integration.test.ts:306-321. |
| **R-03 quoted JSON credential sanitization** | **PASS for the reviewed free-text/audit paths** | sanitizeText handles quoted key/value and bearer forms and sanitizeValue recursively redacts credential-looking keys at src/core/audit.ts:4-40. The quoted JSON fixture drives the value through evidence, decision text, source gaps, restore text, and reason, while preserving a safe neighboring value at test/mechanical.test.ts:556-579. |
| **R-04 fail-closed real restore lifecycle** | **PASS for covered fake-runtime lifecycle paths; real OMP recovery remains SOURCE GAP** | realRestore performs plan -> real setThinkingLevel -> readback -> confirmRestore at src/extension.ts:258-274; failed/mismatched readback remains owned, failed, and degraded, and off/reset/switch do not fold a failed restore. The integration fixture verifies the truthful failed restore and subsequent lifecycle guards at test/extension.integration.test.ts:567-600. |
| **R-05 actual model plus effort replay conflict** | **PASS — closed** | rebuildSessionFromAudit now computes both effortConflict and modelConflict at src/core/audit.ts:325-329. Any conflict contributes an error and markReplayDegraded makes the reconstructed state degraded/source_gap and therefore automatically blocked. The exact model-a/model-b, equal-high-effort counterexample is now covered at test/mechanical.test.ts:653-663. |
| **R-06 exact duplicate response/no side effects/live safety** | **PASS — closed** | The duplicate branch identifies the stored first result by scoped decision ID and canonical payload hash, calls the core idempotency path, leaves the live closure state untouched by skipping `state = result.state`, `persistState()`, and `persistEvent()`, and serializes the canonical `state: result.state` at src/extension.ts:412-460. The focused fixtures deep-compare both source-gap and blocked first/retry complete responses and separately assert no new entries or actions plus preservation of the later phase/reason and automatic fuse at test/extension.integration.test.ts:433-488; `deepEqual` compares every response field recursively at :31-46. |
| **R-07 recursive canonical passthrough hash** | **PASS — closed** | canonicalizePayload recursively sorts object keys while preserving array order, and hashPayload includes every top-level field except decisionId at src/core/ledger.ts:24-55. The changed unknown field conflicts and reordered nested objects deduplicate at test/mechanical.test.ts:770-782. |

## R-06 closure evidence

**Affected symbols:** src/extension.ts:412-460; core first-result storage/return at src/core/ledger.ts:6-20, :68-84 and src/core/decision.ts:323-334.

For an accepted decision followed by a later `report_source_gap` or `report_blocked` decision, an exact retry returns the stored first `RegistryResult` byte-for-byte at the tool-response object level because the wrapper serializes `result.state`. The duplicate branch does not assign to the live `state` closure and does not persist state or audit events. The focused tests at test/extension.integration.test.ts:433-488 deep-compare the complete first/retry responses for both later-safety states, then independently verify unchanged entries, audit count, action state, current phase/reason, and the automatic-action fuse. This closes the SPEC §9.0 exact-retry contract without weakening the later live safety state.

## Live acceptance boundary retained

This source-review verdict is separate from real-OMP acceptance. T07/live child creation and parent-child linkage, child resolved model/effort readback, real ladder transitions, failure/timeout event paths, telemetry, and persisted restart/replay remain **BLOCKED/SOURCE GAP** exactly as recorded in ACCEPTANCE.md. The installed Medium smoke proves only discovery, ordinary task behavior, command/lifecycle readbacks, zero children, no load error, and cleanup. It does not satisfy AC-101..115 or SPEC §22, which remains **NOT COMPLETE / REJECTED**.

## Review integrity

- R-05, R-06, R-07, and F-04 are explicitly marked **PASS/closed**; the deterministic source review is closed.
- No source, test, OMP-core, WeOMP, provider/agent, credential, or global-effort configuration file was edited by this review; only REVIEW.md was rewritten.
