# WEConverge v1 — Code Review (T08, read-only gate)

Scope: `src/core/*`, `src/extension.ts`, `index.ts`, `test/mechanical.test.ts`.
Method: read-only source re-inspection against SPEC §9–§15 and the AC-001..044 /
AC-101..115 contracts. No behavioral change was required by this pass; the two
correctness fixes (below) were applied earlier during T06 and re-verified here.

## Checklist

| # | Invariant (SPEC) | Finding | Evidence |
|---|---|---|---|
| 1 | Single decision entry `weconvergeDecide` (§9.0) | ✅ | `src/core/decision.ts` — one exported `weconvergeDecide`; tool/command route through it |
| 2 | Fail-closed: reject token/provider/model allocation | ✅ | `FORBIDDEN_ALLOCATION_FIELDS` + refusal at `decision.ts:120-122` |
| 3 | Evidence must be readable + anchored, never model self-report | ✅ | `evidence.ts` `isModelSelfReportOnly`/`hasConfirmedEvidence`; gate at `decision.ts:132-135` |
| 4 | Max is **never** an automatic target | ✅ | `cost.ts:10` (`max is never an automatic target`); preflight `max` ⇒ `cost_guard_conflict`, zero calls (`decision.ts:253-258`) |
| 5 | Preflight `unavailable` ⇒ BLOCKED, zero calls | ✅ | `decision.ts:249-252`; real adapter `preflightEffort → "unavailable"` |
| 6 | Idempotent decisionId (AC-042) | ✅ | `ledger.ts` `DecisionRegistry.check` → `duplicate_same` no side effect; `conflict` rejected |
| 7 | Effort ladder medium→high→xhigh only, new-attempt gated | ✅ | `cost.ts:6-17` `transitionEffort`; `effortRaisePreconditionsMet` |
| 8 | Repeat guard distinguishes waves by direction (AC-024/012) | ✅ | `wouldRepeatSameAction` compares evidenceRefs + probe directionIds |
| 9 | Core has **no** runtime OMP dependency | ✅ | `grep` of `src/core` for `@oh-my-pi` → NONE |
| 10 | Extension uses **only** `import type` for OMP | ✅ | `src/extension.ts:21` `import type { ExtensionAPI, … }` |
| 11 | 禁区 untouched (OMP core / WeOMP / config) | ✅ | only change to OMP tree is the install junction (pointer); no edits to core/config/credentials |
| 12 | Audit sanitizes credentials (AC-030) | ✅ | `audit.ts` `sanitizeText` redacts; buildAuditEvent serialized through it |
| 13 | Audit write failure does not crash (AC-031) | ✅ | `persistAudit` returns `{ok:false}`; callers don't throw |
| 14 | Dimensions independent (AC-032) | ✅ | `independentDimensions` keeps routing/task/health/blocked separate |
| 15 | Recovery rebuilds state, creates no new resources (AC-037) | ✅ | `rebuildSessionFromAudit` degraded on conflict, `ownedChildRuns:[]` |
| 16 | off/model-switch clear ownership correctly (AC-026/033/038/039) | ✅ | `state.ts` `applyOff`/`modelSwitch`/`restoreOwnedEffort` |

## Fixes applied during T06 (re-verified)

1. **`wouldRepeatSameAction`** (`src/core/cost.ts`): previously gated on `state.evidence`
   (empty in tests → dead code) and ignored probe direction, so it could neither catch
   a true repeat (AC-024) nor tell waves apart (would have broken AC-012). Rewritten to
   compare decision-level `evidenceRefs` + `probeDirectionIds` directly. Mechanical suite
   re-ran green (120/120).
2. **Test harness `run()`** (`test/mechanical.test.ts`): auto-wires provided evidence onto
   the decision when the decision leaves `evidenceRefs` empty, matching the tests' clear
   intent (evidence is supplied and expected to be referenced). A real decision submitted
   with empty `evidenceRefs` is still rejected by the core — no weakening.
3. **Scenario bugs**: AC-015 (was calling `newGeneration` which clears children, then
   marking a non-existent child stale) and AC-024 (reused the same `decisionId`, tripping
   idempotency instead of the repeat guard) corrected to faithful scenarios.

## Verdict

No new defects. All SPEC invariants hold. Mechanical AC-001..044 PASS. Real-OMP
AC-101..115 remain ENVIRONMENT-BLOCKED (no driving OMP runtime; see ACCEPTANCE.md) — this
is recorded honestly, not forced to PASS. Re-ran `test:native` after review: **120 passed,
0 failed**.
