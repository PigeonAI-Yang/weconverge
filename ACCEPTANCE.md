# WEConverge v1 — Acceptance Report

> Authoritative order (PRD §1): PRD ▸ SPEC ▸ AGENTS ▸ design. SPEC is implemented,
> never weakened. Where the public OMP API cannot prove a fact, the relevant item is
> recorded as **BLOCKED** / **SOURCE GAP** — no PASS is fabricated.

## 1. Headline

| Suite | Result |
|---|---|
| Mechanical acceptance AC-001 … AC-044 | **PASS** — 120/120 deterministic checks (`test/mechanical.test.ts`, run via `node --experimental-strip-types`; tsx unavailable on this sandbox network, so the managed-Node native runner was used) |
| Real-OMP acceptance AC-101 … AC-115 | **ENVIRONMENT-BLOCKED** — no driving OMP desktop runtime is available in this sandbox, and SPEC §13/CP-003/CP-004 forbid auto-pathing into the Max cost trap. Each item's *policy logic* is covered by a passing mechanical AC; the *live OMP readback* is not executable here. |

**Completion status (SPEC §22):** All REQ have CAP + AC. AC-001..044 have readable
pass evidence. AC-101..115 are not PASS because the required real-OMP readback is
environment-blocked and SPEC explicitly forbids "reducing acceptance to finish". This is
the honest state; it is **not** marked complete.

## 2. Mechanical acceptance (PASS — evidence in repo)

`test/mechanical.test.ts` exercises the pure core engine with injected `OmpAdapters`
(no real OMP, no network, no paid model). 120 assertions covering every AC-001..044.
Re-run: `npm run test:native`.

Key guarantees proven by the mechanical suite:
- Fail-closed: schema rejection of token/provider/model allocation (AC-006); evidence
  must be readable + anchored, never model self-report (AC-035); resource actions need
  ≥1 confirmed evidence (AC-010/043).
- Max is **never** an automatic target (AC-017/019); preflight `max` ⇒ zero provider
  calls + explicit `cost_guard_conflict` (AC-019); preflight `unavailable` ⇒ BLOCKED,
  zero calls (AC-019).
- Single decision entry `weconvergeDecide`, idempotent decisionId (AC-042); same
  evidence+same direction does not repeat (AC-024); different directions = separate
  waves (AC-012).
- Effort ladder medium→high→xhigh only, gated on a new verified attempt (AC-016/017/018/023).
- Lifecycle: new generation clears evidence/directions/waves/children (AC-003); off
  restores owned effort + detaches WEConverge children, never terminates user children
  (AC-026/033/038); model switch clears grant + advances generation (AC-039); late child
  marked stale (AC-015).
- Audit sanitizes credentials (AC-030); audit write failure does not crash (AC-031);
  dimensions are independent (AC-032); replay rebuilds generation/state, degraded on
  conflict, creates no new resources (AC-037).
- Install config validates and stays `enabled:false` (config validation extra block).

## 3. Real-OMP acceptance AC-101 … AC-115

Legend: ✅ = mechanically covered by a passing AC · 🚫 = real-OMP readback not executable
in this sandbox (BLOCKED) · ⛔ = core design makes it BLOCKED by SPEC (not a bug).

| AC | Requirement | Real-OMP status | Mechanical coverage | Reason / evidence |
|---|---|---|---|---|
| AC-101 | Install + load; unique editable source; junction; no load error | **PARTIAL** | — | Junction verified: `extensions/weconverge → J:\PigeonYang\tools\weconverge` (unique source). "OMP loads with no Extension error" requires a live OMP session — 🚫 not drivable here. Entry `index.ts` re-exports the default factory; loader stops at `index.ts` (no deep scan of `src/core`). |
| AC-102 | Off control: baseline model/effort unchanged, no WEConverge child | 🚫 | AC-026/033/038 | Policy covered mechanically. Live readback of actual model/effort needs OMP runtime. |
| AC-103 | Simple task: main model, Medium, single agent, zero classify calls | 🚫 | AC-004/020 | Needs live run. Core never allocates model/provider (AC-006). |
| AC-104 | Internal search: selected/backup tag, no extra Provider request | 🚫 | AC-005/021 | Needs live run. |
| AC-105 | External exploration: 2 real children, real parent link, different direction, confirmed route, terminal evidence | ⛔/🚫 | AC-011/013/023 | **BLOCKED by design**: `preflightEffort` returns `unavailable` (CP-003) and `emitChild` is omitted (CP-004 child preflight) ⇒ automatic dispatch issues **zero** child calls. The two-child mechanics pass mechanically (AC-011); the *live* parent-child + route readback is not executable. Manual user-initiated dispatch via `ExtensionCommandContext.newSession` is the supported path. |
| AC-106 | Depth raise: 2 distinct Medium failures → only High; XHigh only after new verification | 🚫 | AC-016/017/023 | Policy covered mechanically. Live effort readback needs OMP. |
| AC-107 | Specialist role: capability→role→actual model readable | 🚫 | AC-021/022 | `resolveCapability` (pure) covered; actual model readback needs OMP. `readbackActual` returns `effort:"unknown"` (CP-004) ⇒ integrity `source_gap`, never a false `confirmed`. |
| AC-108 | Max guard: preflight Max ⇒ no Provider call + explicit conflict; if only knowable post-hoc, BLOCKED not PASS | ⛔ | AC-019 | **Covered & enforced**: mechanical AC-019 proves zero calls + `cost_guard_conflict` when preflight `max`. In real OMP, preflight is `unavailable` ⇒ BLOCKED (per SPEC, BLOCKED is the correct honest outcome, not PASS). |
| AC-109 | SOURCE GAP: removing required input adds no Agent/effort | 🚫 | AC-008/044 | Policy covered mechanically. Live readback needs OMP. |
| AC-110 | Model switch: old baseline restored, old evidence/dir/wave/grant cleared, new gen, late child stale | 🚫 | AC-015/039 | Policy covered mechanically (AC-039 model switch; AC-015 stale). Live readback needs OMP. |
| AC-111 | Off restore: High/XHigh session restored to pre-takeover baseline; running WEConverge child detached; user child untouched; persistent config hash unchanged | 🚫 | AC-026/033/038/113 | Policy covered mechanically. Persistent-config hash (AC-113) verified below. Live readback needs OMP. |
| AC-112 | Failure paths: create fail / timeout / readback fail leave no Extension-controlled residual loop; detached child has explicit status | 🚫 | AC-031/041 | Policy covered mechanically (AC-031 write-fail safe; AC-041 failure no side effect). Live readback needs OMP. |
| AC-113 | 禁区: OMP core / WeOMP / Provider·Agent·global effort config — no project diff | **PASS (static)** | — | Repo changes are confined to `J:\PigeonYang\tools\weconverge`. OMP core (`J:\OhMyPi`, `J:\PigeonYang\harness\WeOMP`), `config.yml`, Agent/Provider/model configs and credentials are **not modified**. The only OMP-adjacent change is the install *junction* (a pointer, explicitly authorized by the plan, not an edit to OMP code). Confirmed at commit time (git status shows only project files). |
| AC-114 | Natural task terminal: no `off` needed; restores pre-takeover baseline; OMP actual effort readback | 🚫 | AC-026/027 | Policy covered mechanically. Live readback needs OMP. |
| AC-115 | Session restart recovery: audit replay ⇒ same generation/state; reconciled with OMP actual | 🚫 | AC-037 | `rebuildSessionFromAudit` covered mechanically (AC-037: same generation, degraded on conflict, no new resources). Live reconciliation needs OMP. |

## 4. Why automatic dispatch is BLOCKED (not a defect)

CAPABILITY_PROBE (CP-003/CP-004/CP-008) proved, from the public OMP Extension API:
- `after_provider_response` carries `status/headers/requestId/metadata` only — **no**
  resolved model/effort.
- Child sessions do not expose their actual route to the parent extension.
- `ctx.newSession` exists only on `ExtensionCommandContext` (command scope), not on the
  `ExtensionContext` used by tools/events.

Therefore the engine cannot *preflight* that a route will not resolve to Max. Per SPEC
§13, any automatic path that might reach Max must stay BLOCKED rather than guess. The
real `OmpAdapters` implements exactly this: `preflightEffort → "unavailable"` and
`emitChild` omitted ⇒ `weconvergeDecide` returns BLOCKED with **zero** provider calls.
This is the faithful, safe behavior; AC-105/AC-108 reflect it honestly.

## 5. What would unblock AC-101..115

A real OMP desktop session under an **isolated profile** (official, not the user's
production config) with **manual** (user-initiated) dispatch only — automatic dispatch
remains BLOCKED by design. The operator would then capture: real parent→child links,
`preflight-actual` route, Provider call log, recovery readback, and the 禁区 hash, and
record them per-AC. Until that environment exists, these items stay BLOCKED.

## 6. Independent presentation (SPEC §22)

- SOURCE GAP / BLOCKED / routing / task / restore / health are tracked as **separate
  dimensions** (`independentDimensions` in `src/core/audit.ts`), never collapsed.
- 禁区 has **no diff** (AC-113, static PASS above).
- No WEConverge-owned unresolved effort and no background child in the automatic path
  (dispatch is BLOCKED) — verifiable from the core: `emitChild` is never invoked by the
  real adapter.
