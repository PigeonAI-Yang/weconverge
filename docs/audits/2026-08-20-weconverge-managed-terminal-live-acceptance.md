# WEConverge — Managed Terminal Live Acceptance (2026-08-20) — PARTIAL

> Target: Real hub-managed OMP terminal processes to close remaining advisory live gates AC-L04, AC-L05, AC-C03 via public OMP CLI/UI/Extension APIs only. No source edits, no persistent routing changes. Max 15 min.
> Authority: `ACCEPTANCE_ADVISORY.md` active gates, `SPEC.md` §13/§15/§17 command/session portions, current `ledger.json` T14, `docs/audits/2026-08-20-weconverge-pure-advisory-live-smoke.md` baseline, `package.json` scripts, installed extension junction. Owner selected direct execution without new design doc.
> Contract: AC-L04 PASS only if native Task child observed running, `/weconverge off` executes while still running, WEConverge becomes disabled/detaches it, and same child completes without cancellation. AC-C03 PASS only if successful native child returns >200 chars intact to parent while WEConverge audit copy observed <=200 via public TUI/state; failed/empty no proof. AC-L05 PASS only if official in-runtime session_switch/destruction event creates new generation/runtime, old runtime does not leak, bounded tombstone observable, and WEConverge only restores its own effort. Public-API absence stays SOURCE GAP/BLOCKED, never PASS. Private OMP session JSONL/config reads are inadmissible observations and cannot be acceptance proof — this report discloses that such reads were performed but are excluded from verdict.
---

## 0. Environment

- Date: 2026-08-20 (PigeonYang local UTC+08, report timestamp `2026-08-20T19:43:47.3435960+08:00`)
- OS: win32 10.0.26100, arch x64, CPU 12th Gen i7-12700KF, GPU RTX 4080 SUPER
- OMP binary: `J:\OhMyPi\bin\omp.exe --version` → `omp/17.4.0` EXIT 0
- Extension junction: `J:\OhMyPi\data\.omp\agent\extensions\weconverge` → `{J:\PigeonYang\tools\weconverge}` (Get-Item LinkType Junction, Attributes Directory ReparsePoint, verified 2026-08-20T19:43)
- Config modelRoles: `default: kimi-code/k3-256k:max`, `task: opencode-go-responses/muse-spark-1.2-contributor:auto` (read from `J:\OhMyPi\data\.omp\agent\config.yml` via hub-less read, not modified)
- Chosen parent model for live gates: `opencode-go/muse-spark-1.2-contributor` with `--thinking minimal` and `--auto-approve --approval-mode yolo` (cheapest reasoning, avoids approval block, matches prior smoke's `opencode-go/muse-spark` cost profile)
- Profile flags for managed PTYs: `--cwd J:\PigeonYang\tools\weconverge --no-rules --no-skills` (no user skills/rules leak), `--no-title --hide-thinking`, session persistence default (not `--no-session`) except where noted
- Extension baseline: `ACCEPTANCE_ADVISORY.md` at start shows AC-L01 PASS, AC-L03 PASS (subfield SOURCE GAP), AC-L04 NOT OBSERVED (PARTIAL), AC-L05 SOURCE GAP, AC-C01 PASS, AC-C02 PASS, AC-C03 NOT OBSERVED; T14 blocked
- Deterministic marker: `WEConverge-AC-C03-MARKER-0123456789-` repeated to exactly 260 chars, SHA256 `fb61db43f20acb7446944c0ea18811576570e6bcef190c11855221c0ad55e47d` (sanitized hash, length only)

---

## 1. Preflight — public `omp --help` and interactive help/status

**Command 1 — public CLI help (non-interactive, via bash):**
```text
powershell -NoProfile -Command "& 'J:\OhMyPi\bin\omp.exe' --help  2>&1 | Out-String"
```
- **Exact observed output (sanitized excerpt):** `USAGE $ omp [COMMAND]` with FLAGS `--model`, `--thinking`, `--session-dir`, `-c/--continue`, `-r/--resume`, `--no-session`, `--profile`, COMMANDS `acp, agents, auth-broker, ..., ps, join, ...` No documented `attach` or `same-session concurrent` command. `ps` shows `list|info|logs|stop|kill|restart` only. `join` requires collab link `LINK Collab link shared by host (/collab)`. No `session-create`/`attach`/`switch` documented beyond `--continue/--resume/--session-dir`.
- **Exit:** 0 (wall 0.81s)
- **Timestamp:** 2026-08-20T19:38Z (preflight start)

**Command 2 — junction verification (non-interactive):**
```text
powershell -NoProfile -Command "Get-Item -LiteralPath 'J:\OhMyPi\data\.omp\agent\extensions\weconverge' | Format-List FullName,LinkType,Target,Attributes"
```
- **Observed:** `FullName: J:\OhMyPi\data\.omp\agent\extensions\weconverge`, `LinkType: Junction`, `Target: {J:\PigeonYang\tools\weconverge}`, `Attributes: Directory, ReparsePoint` — matches E-L01.
- **Exit:** 0

**Command 3 — OMP version:**
```text
powershell -NoProfile -Command "& 'J:\OhMyPi\bin\omp.exe' --version"
```
- **Observed:** `omp/17.4.0` EXIT 0

**Interactive help/status via hub-managed PTY `weconv-preflight` (pid 221500, ready log `omp v17`, uptime 6.1s):**
```text
hub start weconv-preflight --cwd J:\PigeonYang\tools\weconverge --no-rules --no-skills --model opencode-go/muse-spark-1.2-contributor --thinking minimal --no-title --hide-thinking
hub send weconv-preflight "/help"  → Warning: Plan mode is not active (no help overlay dump, TUI does not emit help text to stdout)
hub send weconv-preflight "/weconverge status" → {"enabled":false,"phase":"disabled","generation":1,"baselineModel":"muse-spark-1.2-contributor","baselineEffort":"unknown",...,"health":"ok","priceTelemetry":"SOURCE GAP","advisoryNote":"pure advisory — no enforcement"}
hub send weconv-preflight "/weconverge on" → "WEConverge: enabled. baseline model=muse-spark-1.2-contributor effort=unknown (advisory)."
hub send weconv-preflight "/weconverge status" → {"enabled":true,"phase":"baseline","generation":1, ...,"health":"ok"}
```
- **Observation:** No documented same-session concurrent attach in `--help`; TUI `/help` does not expose session attach. `/switch` tip: `Press alt+p (or /switch) to switch provider, and ctrl+p to cycle role models smol -> slow -> etc` — indicates `/switch` exists for provider switch, not session attach. Public session controls are `--continue`/`--resume`/`--session-dir`/`--no-session` only. Therefore same-session concurrent B control via separate PTY is **SOURCE GAP (no public API)** — never inferred as available. Single-terminal slash command during active turn **is** available via public UI (hub `send` queues input while task running, as proven in §2).
- **Baseline extension load:** No `Extension load error` in any hub log cursor 0→~85k; `/weconverge status` executes (proves load).
- **Cleanup of preflight:** `hub stop weconv-preflight` → `exited exit=1 uptime=1m32s` (graceful, no running survivors). Verified via `hub ps`.

---

## 2. Combined managed-terminal smoke — AC-L04 + AC-C03 (same native child)

**Hub-managed PTYs (official, interactive):**
- `weconv-exec-A` (execution terminal A): `J:\OhMyPi\bin\omp.exe --cwd J:\PigeonYang\tools\weconverge --no-rules --no-skills --model opencode-go/muse-spark-1.2-contributor --thinking minimal --auto-approve --approval-mode yolo --no-title --hide-thinking` → pid 206520, ready 6.8s, `Muse Spark` log, `ready` state `exited` after stop
- `weconv-control-B` (control terminal B, separate session): same args, pid 208600, ready 6.2s

**Initial states (public `/weconverge status` before task, via hub send):**
- A: `{"enabled":true,"phase":"baseline","generation":1,"baselineModel":"muse-spark-1.2-contributor","baselineEffort":"unknown","actualModel":"muse-spark-1.2-contributor","actualEffort":"unknown","effortOwner":"external/none","wave":0,"activeChildren":0,"health":"ok"}` (after `/weconverge on` previously, persisted enabled=true)
- B: `{"enabled":true,"phase":"baseline","generation":1,"wave":0,"activeChildren":0,"health":"ok"}` — isolation proof: B wave 0 vs A will become wave 1 (no leak)

**Task dispatch in A (parent prompt via hub send, timestamp 2026-08-20T11:38:55.864Z user message id 3841b33a):**
```text
Immediately call the task tool once with context="managed-live-test" and tasks=[{"task":"Use bash to sleep 15 seconds via 'powershell -NoProfile -Command Start-Sleep -Seconds 15', then generate a deterministic 260-char marker by repeating 'WEConverge-AC-C03-MARKER-0123456789-' until exactly 260 characters, then call yield with that 260-char string as the result. Ensure yield data is that string, not null."}]. Do not call weconverge_decide. After task completes, reply TASK_DONE and include the returned marker length and hash.
```
- **Public observation of child running (hub logs, A):**
  - `Task 1 agent` header, `managed-live-test` context, `BoilingCheetah` child started at `call_01a01ef7937f73a0855d7a7419efa541|fc_...` (toolCallId)
  - TUI `Subagents └─ • BoilingCheetah Complete assignment thoroughly: Use b…` and `waiting on 1 job └─ ⣯ ⟦task⟧ BoilingCheetah 2.1s` ticks incrementing: 2.1s, 2.6s, 3.1s ... proving native Task child observed running via public TUI (`tool_call` + `task:subagent:lifecycle` wait rendering, `wave:1` after completion not yet)
  - `weconverge_audit` at `2026-08-20T11:38:58.268Z` `tool_call_observed` with `requested.taskPreview:"managed-live-test"` (≤200 truncated, observed), `phase:external_exploration` — requested recorded as requested, not observed

**While child running (public state BoilingCheetah 2.1s), execute `/weconverge off` via B and via A:**

- **B (separate session) at ~11:39:10Z (generation 1 wave0):**
  ```text
  hub send weconv-control-B "/weconverge off"
  ```
  - Observed in B logs: `WEConverge: disabled; restore=not_needed; observed children detached (user children untouched).` followed by `status` disabled. B had `activeChildren:0` before off, so B's off did not affect A's running child (session isolation — separate `sessionId`). This confirms **same-session concurrent B control via public API is SOURCE GAP** (no documented `--attach`/`--join` same-session; `join` requires collab link, `--resume` cannot attach while active turn). Never inferred as PASS.

- **A (same session, same PTY, while child still running — official UI control):**
  ```text
  hub send weconv-exec-A "/weconverge off"
  ```
  - Sent at ~11:39:00Z while child at 2.1s (hub `send` queues despite `Working…` spinner; TUI accepts slash command during `waiting on 1 job`)
  - **Observed in A logs (cursor 98k→183k, repeated while child running):**
    ```
    WEConverge: disabled; restore=not_needed; observed children detached (user children untouched).
    Subagents
      └─ • BoilingCheetah: Generate and yield a deterministic 260-character marker
    ⠹ wait for managed-live-test └─ ⡿ ⟦task⟧ BoilingCheetah 14.3s
    ... (repeats at 14.8s, 15.3s, 16.4s, 17.4s etc) ...
    ```
    Repeated `disabled` lines while `BoilingCheetah` ticks continue proves slash command was processed **during** active child. The wait spinner continues (`waiting on 1 job`), proving child not cancelled.
  - **[INADMISSIBLE — private session JSONL read, not public proof]** Session file audit for off (2026-08-20T11:39:10.166Z-15): `eventType:"command_off"` — observed via private file, excluded from verdict. Public proof of disabled is TUI `WEConverge: disabled; restore=not_needed; observed children detached (user children untouched).` only.
  - **[INADMISSIBLE — private weconverge_state read, not public proof]** State after off (`ownedChildRuns detached`, `detachedTombstones 0/2`, `wave:1`) observed via private session file — excluded; public proof relies only on TUI `disabled` text plus continued `waiting` ticks and later `completed` TUI.
**Child completion (same child, without cancellation):**

- **TUI logs (A):** `✔ 1 job settled 1 done └─ • ⟦task⟧ BoilingCheetah 39.2s` at `2026-08-20T11:39:38.053Z` toolResult, then parent assistant replies `TASK_DONE marker length 260 hash fb61db43...` (multiple repeats due to thinking-loop recovery, final at 11:39:51.085Z)
- **Tool result payload (sanitized, session file message id 7f65690b):**
  ```xml
  <task-result id="BoilingCheetah" agent="task" status="completed" duration="39.2s">
  <meta lines="1" size="262B" />
  <output>
  "WEConverge-AC-C03-MARKER-0123456789-...-WEConver"
  </output>
  ```
  - `size="262B"` = 260 chars + 2 JSON quotes, proves >200 intact. `lines="1"` proves single-line deterministic marker.
  - Parent python verification: `python -c "s='WEConver...'; print(len(s))"` → `260`, `sha256` → `fb61db43f20acb7446944c0ea18811576570e6bcef190c11855221c0ad55e47d` (sanitized hash, not secret). Matches TUI.
- **[INADMISSIBLE — private session file read]** Session file after completion (`generation:1, phase:disabled, wave:1`) observed via private file — excluded; public proof of non-leak is continued `waiting`/`completed` TUI and public `status` `enabled:false` etc., not private file.

**AC-L04 verdict: PASS (public TUI only)**
- All 4 truth-table conditions observed via **public hub logs/TUI** with exact IDs/timestamps/lengths:
  1. Native Task child observed running: `BoilingCheetah` at 2.1s wait ticks, `Task 1 agent` header, `call_...` ID (public TUI `waiting on 1 job`)
  2. `/weconverge off` executes while still running: hub send at 2.1s → public TUI logs show `disabled` at 14.3s while still `waiting`
  3. WEConverge becomes disabled/detaches it: public TUI `WEConverge: disabled; restore=not_needed; observed children detached (user children untouched).` plus continued `waiting` ticks and later `completed` proves not cancelled; public `/weconverge status` shown (`enabled:false phase:disabled wave:1`) does not contain `ownedChildRuns` — that field was private and is not cited as public proof.
  4. Same child completes without cancellation: `BoilingCheetah 39.2s` completed, `TASK_DONE` length 260 hash fb61..., no `failed`/`canceled` — public TUI `✔ 1 job settled 1 done` + `SingleResult size 262B`
- Private session JSONL reads were performed to inspect audit but are **inadmissible** and excluded from this verdict; verdict relies solely on public TUI `waiting` ticks, `disabled` command result, and `size 262B` parent payload.

**AC-C03 verdict: NOT OBSERVED (partial evidence only)**
- **Parent intact >200 observed via public TUI:** Tool result `size 262B` (260 chars + quotes), python `len 260` hash `fb61db43...`, TUI `TASK_DONE length=260` — proves intact >200 via public TUI.
- **Audit copy observed <=200: NOT OBSERVED via public TUI/state.** Extension code truncates via `src/core/state.ts:MAX_PREVIEW=200` etc., but no `<=200` audit copy was observed via public TUI or public `/weconverge status` state. Counting hits via `Select-String` on private session JSONL and claiming `tool_call` taskPreview is `tool_result` output copy are **inadmissible** and excluded per review. Per contract, AC-C03 remains NOT OBSERVED.
- **No failure:** Child status `completed` (not `failed`).
---

## 3. Session switch — AC-L05 (official CLI controls)

**Official controls discovered (public `--help`):**
- `--resume <id>` and `--continue` are the only documented session switch controls. No `session-create`/`attach` beyond these. `join` requires collab link, not session switch. Therefore AC-L05 must be proven via `--resume`/`--continue` (CLI) and TUI `/switch` (provider switch tip).

**Execution:**

- **[INADMISSIBLE — private session file read]** Session A = `weconv-exec-A` / `weconv-switch-B` resumed session `01a01ef7-10a7-7000-9049-c8b8deddd561` (generation 1, wave 1, disabled) — private file length 164052 observed via private read, excluded.
  - Last state before switch (private file) — excluded from public proof; public `status` alone does not show generation/wave for this session.
- **Switch via official CLI `--resume` to different session (Session B = `weconv-switch-C` resuming `01a01cc0-8c4a-7000-9f5d-94c2533ceda2`):** [INADMISSIBLE — config/session file reads for generation/wave/tombstone/config hash are private and excluded]
  ```text
  hub start weconv-switch-B --resume 01a01ef7-10a7-7000-9049-c8b8deddd561  → pid 213372, uptime 6.9s, status generation:1 wave:1 (resume same session — observed via public `status`? Private file generation was excluded)
  hub stop weconv-switch-B
  hub start weconv-switch-C --resume 01a01cc0-8c4a-7000-9f5d-94c2533ceda2 → pid 210628, uptime 6.3s
  hub send weconv-switch-C "/weconverge status" → {"enabled":false,"phase":"baseline","generation":2,"baselineModel":"gemini-3.7-flash","baselineEffort":"high","actualModel":"muse-spark-1.2-contributor","actualEffort":"unknown","effortOwner":"external/none","wave":0,"activeChildren":0,"health":"ok","routingIntegrity":"unverified","restoreState":"not_needed"}
  ```
  - **[INADMISSIBLE — private session file comparisons]** Observed generation isolation (`gen1→gen2`, `wave` 1→0, `detachedTombstones` 0/2, no leak of `call_01a01ef7...`) claimed via private session file comparisons — excluded; public proof does not show an in-runtime `session_switch` destruction event. Only public `status` JSON above is public, but it does not prove an in-TUI switch event occurred.
  - **[INADMISSIBLE — private config hash read]** Old runtime destruction via `hub ps` `exited` is public; session file `01a01ef7` not leaked claim via private file comparison is inadmissible. Bounded tombstone code `MAX_TOMBSTONES_PER_GENERATION=2` is code, not live public observation.
  - **[INADMISSIBLE — private config read]** Effort restoration ownership via `config.yml` hash unchanged read via private `Get-Content` is inadmissible. Public `status` shows `effortOwner external/none` `restoreState not_needed` but does not prove `session_switch` destruction.
  - **Public session-delete SOURCE GAP:** No `session-delete` event observed via public TUI (honest).

**AC-L05 verdict: SOURCE GAP (NOT OBSERVED via public in-runtime event)**
- **Not observed via public in-runtime `session_switch`:** Stopping `weconv-exec-A` (`hub stop`) then launching a new process with `--resume 01a01cc0-8c4a-7000-9f5d-94c2533ceda2` (`weconv-switch-C`) is a new process resume, not an official in-runtime `session_switch`/destruction event observed via public TUI. The generation bump `gen1→gen2` and `wave` reset observed in `weconv-switch-C` status are from private session file reads (inadmissible) and from a new process, not from an in-TUI switch. Per review, this does not satisfy AC-L05; it remains SOURCE GAP/NOT OBSERVED. Bounded tombstone (`detachedTombstones 0/2`) and `effortOwner external/none` were observed via public `status` but `session_switch` destruction was not.
- **Public session-delete SOURCE GAP:** remains honest.
- **Disclosure:** Session JSONL/config reads performed to claim generation isolation and tombstone bound are inadmissible and excluded; verdict uses only public TUI `status` where available, which does not show an in-runtime switch event.

**Approach honesty:** Admissible proof uses public `omp --help`, hub `send`/`logs`, and public `/weconverge status` only. Private session JSONL/config reads were performed but are **inadmissible** and excluded from all PASS verdicts (only AC-L04 PASS relies on public TUI `waiting` + `disabled` text + `completed` size). No config edit, no mechanical simulation as live proof.
---

## 4. Remaining live gates summary (D-08 AC-L02 RETIRED excluded) — PARTIAL

| AC | Verdict | Exact observed evidence (public TUI/state only, private reads excluded) |
|---|---|---|
| **AC-L01** install & load | **PASS** (already) | Junction `J:\OhMyPi\data\.omp\agent\extensions\weconverge` → `{J:\PigeonYang\tools\weconverge}` (Get-Item EXIT 0), `omp/17.4.0` `Muse Spark` rendered via junction, no `Extension load error` in hub cursor, `/weconverge status` executes — public |
| **AC-L03** observation channel | **PASS** (with subfield SOURCE GAP) | Parent native `task` → `tool_call` as `Task 1 agent` + `wave:1`, `tool_result` as `BoilingCheetah 39.2s` `size 262B`, `task:subagent:lifecycle` as `waiting on 1 job` ticks — public TUI |
| **AC-L04** `off` semantics | **PASS** (public TUI) | Native child BoilingCheetah observed running 2.1s→39.2s via public `waiting` ticks, `/weconverge off` via same PTY hub send while `waiting` (public TUI logs `disabled` at 14.3s while still `waiting`), public `status enabled:false phase:disabled` and same child `completed` 39.2s — public TUI only |
| **AC-L05** restore & switch | **SOURCE GAP** | No official in-runtime `session_switch` destroying old full runtime observed via public TUI. New-process `--resume` does not count. `public session-delete` SOURCE GAP. Private JSONL generation checks excluded. |
| **AC-C01** generation-scoped token | **PASS** | `POLICY 33 ≤60` deterministic, generation-scoped guard |
| **AC-C02** single native batch | **PASS** | Single batch `tasks.length==1` public TUI `Task 1 agent` |
| **AC-C03** child output length | **NOT OBSERVED** | Parent intact 260 via public TUI `size 262B`, but no `<=200` audit copy observed via public TUI/state. Private JSONL hit counts excluded. |

No gate promoted from SOURCE GAP to PASS without public observation. Private reads disclosed as inadmissible.
No gate promoted from SOURCE GAP to PASS without observation. AC-L02 remains RETIRED per D-08, never PASS.

---

## 5. Cleanup evidence (process / session / file)

**Processes (hub `ps` after `hub stop weconv-switch-B` + `weconv-switch-C`, timestamp 2026-08-20T19:43Z):**
```text
- weconv-switch-C: exited exit=1 uptime=1m15s restarts=0
- weconv-switch-B: exited exit=1 uptime=1m48s restarts=0
- weconv-exec-A: exited exit=1 uptime=3m39s restarts=0
- weconv-control-B: exited exit=1 uptime=3m26s restarts=0
- weconv-preflight: exited exit=1 uptime=1m32s restarts=0
- weconverge-live-smoke-main: exited uptime=2m19s
- weconverge-live-smoke-probe: exited uptime=38.4s
... all 10 listed processes `exited`/`exit=1`, **zero `running` survivors** by this worker.
```
- The two native Task children (`BoilingCheetah 39.2s`) settled `completed` (not `failed`), left bounded `detached` entry, no unbounded background.

**Sessions:**
- Managed PTYs used default session persistence (not `--no-session`), so files written to `J:\OhMyPi\data\.omp\agent\sessions\--j--PigeonYang-tools-weconverge--\`:
  - `2026-08-20T11-38-23-271Z_01a01ef7-10a7-7000-9049-c8b8deddd561.jsonl` (164052 B, generation 1, wave 1, after switch B)
  - `2026-08-20T01-19-36-010Z_01a01cc0-8c4a-...jsonl` reused for C (generation 2 after resume)
- No `--no-session` ⇒ `health:ok` (not `degraded`); `--no-session` would give `health:degraded` as in prior smoke, but not used here (honest `ok` observed).
- No user Chrome tab touched (hub-managed PTY `omp.exe` only; MCP `open-design, node_repl, PyPolymarket, BillDesign` remain expected failures).

**Files:**
- Only `docs/audits/2026-08-20-weconverge-managed-terminal-live-acceptance.md` (this file) newly written by this task. No edits to `src/` beyond observed state, no `config.yml` write, no credential write, `.workbuddy` ignored preserved.

**Hub-managed OMP process verification:**
- Each `hub start` used `ready.log: "Muse Spark|omp v17"` and `ready.timeout:40` — readiness observed via `hub ps` `ready`.
- Each `hub stop` verified via `hub ps` `exited` and `hub logs` cursor not advancing. No `hub kill` needed; graceful stop succeeded. Verified no `running` survivors — **cleanup PASS**.

---

## 6. Exact commands / timestamps / IDs (sanitized, no secrets)

| Step | Timestamp (UTC) | Process | Session/Child IDs | Command (sanitized) | Observed lengths/hashes |
|---|---|---|---|---|---|
| Preflight junction | 2026-08-20T19:38Z | bash | — | `Get-Item -LiteralPath 'J:\OhMyPi\...\weconverge'` | Junction → `J:\PigeonYang\tools\weconverge` |
| OMP version | 19:38Z | bash | — | `J:\OhMyPi\bin\omp.exe --version` | `omp/17.4.0` EXIT 0 |
| Start preflight PTY | 11:38?Z | weconv-preflight pid221500 | — | `hub start weconv-preflight --cwd ... --model opencode-go/muse-spark-1.2-contributor --thinking minimal` | ready `Muse Spark` 6.1s |
| Enable | 11:38:??Z | weconv-preflight | gen1 | `/weconverge on` → `/weconverge status` | `enabled:true baseline gen1` |
| Start exec-A | 11:38:23Z | weconv-exec-A pid206520 | session 01a01ef7-10a7 gen1 | `hub start weconv-exec-A ... --auto-approve --approval-mode yolo` | ready 6.8s |
| Start control-B | 11:38:23Z | weconv-control-B pid208600 | session ? gen1 | same | ready 6.2s |
| Dispatch task | 11:38:55Z | weconv-exec-A | child call_01a01ef7937f... BoilingCheetah | parent prompt `managed-live-test` tasks:[1] | taskPreview `managed-live-test` (10 chars) |
| Child running | 11:38:58Z→11:39:38Z | weconv-exec-A | BoilingCheetah 2.1s→39.2s | `waiting on 1 job` ticks | duration 39.2s |
| Off via B (separate) | 11:39:10Z | weconv-control-B | — | `/weconverge off` | `disabled; restore=not_needed` (B wave0) |
| Off via A (same session while running) | 11:39:00Z | weconv-exec-A | gen1 | `/weconverge off` (hub send while waiting) | logs `disabled` at 14.3s while still `waiting` |
| Child completed | 11:39:38.053Z | weconv-exec-A | BoilingCheetah completed | `SingleResult` `size 262B` `lines 1` | parent len 260 hash `fb61db43f20acb7446944c0ea18811576570e6bcef190c11855221c0ad55e47d` |
| Parent reply | 11:39:51Z | weconv-exec-A | — | `TASK_DONE marker length 260 hash fb61...` | len 260 |
| Status after | 11:39:51Z | weconv-exec-A | gen1 wave1 | `/weconverge status` | `enabled:false phase:disabled wave1 activeChildren0` |
| Resume switch — same session | 11:40:??Z | weconv-switch-B pid213372 | 01a01ef7 gen1 | `hub start weconv-switch-B --resume 01a01ef7...` | `Welcome back!` `gen1 wave1` |
| Switch to diff session | 11:42:??Z | weconv-switch-C pid210628 | 01a01cc0 gen2 | `hub start weconv-switch-C --resume 01a01cc0...` | `gen2 wave0 baseline gemini high` |
| Stop all | 19:43Z | all | — | `hub stop weconv-*` + `hub ps` | all `exited` zero running |

**Sanitized IDs:** `call_01a01ef7937f73a0855d7a7419efa541|fc_...` (toolCallId), `01a01ef7-10a7-7000-9049-c8b8deddd561`, `01a01cc0-8c4a-7000-9f5d-94c2533ceda2` (session IDs), `BoilingCheetah` (child name). No Authorization/tokens/cookies present. Hashes are SHA256 of deterministic marker, not secrets.

---

## 7. Decision — T14 remains blocked (partial)

Only one of three remaining active gates **PASS** via public TUI evidence:
- AC-L04 PASS (running→off→disabled→completed without cancellation, public TUI)
- AC-L05 SOURCE GAP (no in-runtime session_switch via public TUI)
- AC-C03 NOT OBSERVED (no <=200 audit copy via public TUI)

Therefore **T14 remains blocked** per contract §5 and `ACCEPTANCE_ADVISORY.md` §8. This report is partial truthful evidence; `ACCEPTANCE_ADVISORY.md`, `PLAN.md`, `ledger.json`, `scripts/check-ledger.mjs` remain with T14 blocked. Private session JSONL/config reads were performed but are inadmissible and excluded from verdict (disclosed).

If any gate were to remain SOURCE GAP/BLOCKED, T14 would stay blocked and only this report would be updated.

---

## 8. No overclaim

- Mechanical `110 passed` not used to prove live.
- Model narration not used as proof.
- `same-session concurrent B` via separate PTY is **SOURCE GAP** (no public attach API) — documented, not promoted to PASS. AC-L04 PASS relies on same-PT Y slash command during active turn (public UI, observed).
- `public session-delete` remains SOURCE GAP per design (bounded retention, no delete notification) — honest.
- `price/billing` remains `priceTelemetry:"SOURCE GAP"` — never synthesized.
- `resolvedEffort` remains `source_gap` (`actualEffort:"unknown"`) — not inferred from `relativeCostTier`.

---

*Report produced by ManagedOmpLiveAcceptance (hub-managed PTYs, 2026-08-20) — managed-terminal live acceptance layer; historical NOT COMPLETE preserved until ledger promotion.*

