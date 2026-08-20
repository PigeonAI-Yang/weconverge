# WEConverge Paired Benchmark Bootstrap — 2026-08-20

## Purpose anchor
Determine whether WEConverge materially improves final code-repair quality enough to justify keeping it enabled.

## Failure conditions
- Harness cannot freeze exact tasks / prompts / base commits.
- Cannot produce a balanced deterministic 40-run schedule.
- Leaks condition labels (ON/OFF) into blind grading artifacts.
- Cannot stage a fresh isolated run from its manifest.

## Budget & Permissions
- Wall time ≤ 15 minutes, ≤ 8 tracked files, one implementation + one gate repair.
- No new dependencies, no Docker/WSL/package installation, no provider calls, no WEConverge source changes.
- Official SWE-bench Verified read-only; sequential execution only.

## Corpus provenance
- Source: `princeton-nlp/SWE-bench_Verified` revision `c104f840cc67f8b6eec6f759ebc8b2693d585d4a`
- Parquet: `data/test-00000-of-00001.parquet` sha256 `a45b1fe4e2f0c8390b2b2938ac83e92ed5979000856808f3679c07812e9e6dcd` (2096679 bytes, 500 rows)
- Retrieved 2026-08-20 via `https://huggingface.co/datasets/princeton-nlp/SWE-bench_Verified/resolve/c104f840.../data/test-00000-of-00001.parquet`
- Filter: difficulty `15 min - 1 hour` or `1-4 hours`, patch 12–200 lines, ps_len 400–8000 (261 rows) → deterministic stratification sorted repos by descending medium-count then alphabetical, round-robin picking smallest instance_id per repo until 10 distinct repos.

## Selected 10 instances (stratified, medium nontrivial, repo-diverse)
| instance_id | repo | difficulty | patch_lines | ps_sha256 (first 12) | base_commit |
|---|---|---|---|---|---|
| django__django-10554 | django/django | 1-4 hours | 31 | 2f72fa6137f1 | 14d026cccb144c6877294ba4cd4e03ebf0842498 |
| sympy__sympy-12419 | sympy/sympy | 15 min - 1 hour | 40 | 48b311ac971a | 479939f8c65c8c2908bbedc959549a257a7c0b0b |
| sphinx-doc__sphinx-10466 | sphinx-doc/sphinx | 15 min - 1 hour | 13 | 78f4344e3d2b | cab2d93076d0cca7c53fac885f927dde3e2a5fec |
| matplotlib__matplotlib-14623 | matplotlib/matplotlib | 15 min - 1 hour | 80 | 464f0388f374 | d65c9ca20ddf81ef91199e6d819f9d3506ef477c |
| scikit-learn__scikit-learn-10297 | scikit-learn/scikit-learn | 15 min - 1 hour | 68 | 80b289fedf3b | b90661d6a46aa3619d3eec94d5281f5888add501 |
| astropy__astropy-12907 | astropy/astropy | 15 min - 1 hour | 12 | c01334ec1b21 | d16bfe05a744909de4b27f5875fe0d4ed41ce607 |
| pydata__xarray-2905 | pydata/xarray | 15 min - 1 hour | 13 | 0d3a9b692fc4 | 7c4e2ac83f7b4306296ff9b7b51aaf016e5ad614 |
| pytest-dev__pytest-10051 | pytest-dev/pytest | 15 min - 1 hour | 31 | c8f618a73662 | aa55975c7d3f6c9f6d7f68accc41bb7cadf0eb9a |
| pylint-dev__pylint-4551 | pylint-dev/pylint | 1-4 hours | 187 | 28e19b9ac4f2 | 99589b08de8c5a2c6cc61e13a37420a868c80599 |
| mwaskom__seaborn-3069 | mwaskom/seaborn | 15 min - 1 hour | 46 | 739f9b2e6297 | 54cab15bdacfaa05a88fbc5502a5b322d99f148e |

Corpus entries contain exact `instance_id`, `repo`, `base_commit`, `problem_statement` + sha256, `version`, `environment_setup_commit`, `FAIL_TO_PASS`/`PASS_TO_PASS`, `patch_hash`/`test_patch_hash`; raw patch/test_patch never exposed in run dirs.

## Schedule
- Seed `20260820`, algorithm `mulberry32 Fisher-Yates with trial offset seed+attempt*1009 until no adjacent instance_id (first valid attempt=55)`, opaque IDs via `mulberry32(20260821)` as `run-<8hex>`.
- 40 runs, each of 10 tasks has ON×2 OFF×2, no adjacent duplicate instance/tuple, anonymized run_id never contains ON/OFF.
- Example ordering (first 5): `run-641b399e pytest ON1`, `run-df2bcff0 matplotlib OFF2`, `run-feb95f40 django OFF1`, `run-49ae8d41 seaborn ON2`, `run-f4161fae astropy OFF2`.

## Execution config (added 2026-08-20 executor)
- Path: `benchmark/execution.json` (immutable, version 1)
- Model: `cockpit-gpt/gpt-5.6-sol`, thinking `medium`, effort `medium`
- Max time trial `30m`, control `20s`, approval `yolo` with `--auto-approve`
- Extension forward-slash: `J:/PigeonYang/tools/weconverge/index.ts`
- Control sequence exact (proven noninteractive):
  - `omp -p --no-session --model cockpit-gpt/gpt-5.6-sol --thinking medium --max-time 20s --no-skills --no-rules --no-extensions --extension J:/PigeonYang/tools/weconverge/index.ts "/weconverge off"`
  - `omp -p --no-session --model cockpit-gpt/gpt-5.6-sol --thinking medium --max-time 20s --no-skills --no-rules --no-extensions --extension J:/PigeonYang/tools/weconverge/index.ts "/weconverge on"`
  - `omp -p --no-session --model cockpit-gpt/gpt-5.6-sol --thinking medium --max-time 20s --no-skills --no-rules --no-extensions --extension J:/PigeonYang/tools/weconverge/index.ts "/weconverge reset"`
- Trial template: `omp -p --no-session --model cockpit-gpt/gpt-5.6-sol --thinking medium --max-time 30m --auto-approve --approval-mode yolo --no-extensions --extension J:/PigeonYang/tools/weconverge/index.ts @<PROMPT.md>` from `benchmark/runs/<run_id>/repo` (supervisor streams stdout/stderr, executor launched under OMP hub)
- Continuation: `continue_after_trial_failure_record_and_continue_stop_only_on_controller_invariant`; never retry a model run; refuse dirty reuse before agent; refuse schedule/config mismatch; never reveal arm in PROMPT/meta/grading/result-anon (arm only in controller-only `controller.json`)
- Schedule sha256 frozen `93e2cacdad41ac568e0540feb119a9d94a6ab6f3f8e576472801bf4a1b54e8f1`, corpus sha256 `774d00153e60ce4f630508a5d60e64042d396610c0e8177eee7a43904ea61011`
- First run measured metadata: `run-641b399e` ON pytest, exit 0, duration 265000 ms, final_answer sha `1fb221c46caa...`, patch sha `4dfdf3f82719...`, git_head `aa55975c7d3f...`

## Controller boundaries
- `preflight`: records git/node/omp/docker/wsl availability without installing; writes `benchmark/preflight.json` (ignored).
- `stage --run <opaque-id>`: creates `benchmark/runs/<run_id>` fresh, refuses dirty/reused, emits `PROMPT.md` with exact problem_statement (no arm label), `instance.json` without patch, `meta.json` without arm, `clone-status.json` (attempts `git clone --depth 1 https://github.com/<repo>.git` + checkout base_commit, truthfully records blocked if unavailable).
- `finalize --run <id> --result <path>`: validates staged run, copies result into `grading.json` with `{run_id, instance_id, repeat, index, submitted_at, result}` and zero arm disclosure; also creates `result-anon.json` anonymized.
- `capture --run <id> --exit-code <n> --duration-ms <n> --final-answer <path>`: captures git diff/status/head hash, writes `patch.diff`/`patch.json`, copies `final-answer.txt`, creates anonymous `result-anon.json`/`grading.json` without arm, writes controller-only `controller.json` (may contain arm) outside grading.
- `execute --run <id> [--dry-run]`: stages if needed, refuses dirty unstaged before agent, applies arm via off/on control then reset via noninteractive OMP, runs trial OMP (streams to supervisor), captures exit/duration/patch/final-answer, finalizes; never retries; refuses mismatch; never leaks arm.
- `execute-all [--dry-run]`: walks frozen schedule sequentially in index order, skips finalized runs idempotently, continues after trial failure while recording it, stops only on controller/invariant failure.

## Gates & Checkpoints
- Gate 1 corpus hash/provenance: PASS
- Gate 2 schedule balance/opaque/adjacency: PASS
- Gate 3 controller preflight/stage/finalize: PASS (stage cloned pytest successfully)
- Gate 4 verifier `node scripts/check-benchmark.mjs`: PASS (see below)
- Gate 5 stage smoke: PASS (staged 4 runs for pytest-dev__pytest-10051, verified prompt equality, dirty-reuse refused, finalize anonymized, cleaned)
- Gate 6 execution config: PASS (benchmark/execution.json frozen, control sequence exact, trial template exact, schedule sha verified)
- Gate 7 executor capture/finalize anonymity + patch hash/status + resume: PASS (run-641b399e finalized anonymously, patch sha verified, resume selects index 1)

## Prerequisite matrix (2026-08-20 preflight)
| tool | available | version/status |
|---|---|---|
| git | true | 2.51.0.windows.1 |
| node | true | v24.13.1 |
| omp | true | omp/17.4.0 |
| docker | true | Docker version 29.2.1 |
| wsl | true | available |

All required tools available; no installation performed.

## Verifier output (final, executor)
```
=== check-benchmark ===
PASS: provenance source princeton-nlp/SWE-bench_Verified
PASS: provenance revision c104f840cc67f8b6eec6f759ebc8b2693d585d4a
PASS: parquet_sha256 a45b1fe4e2f0...
PASS: corpus has 10 instances
PASS: instance_ids match frozen selection
PASS: all problem_statement hashes verified
PASS: corpus does not expose raw gold patch in instance entries (hashes only)
PASS: schedule has 40 runs
PASS: schedule seed frozen 20260820
PASS: schedule algorithm frozen: mulberry32 Fisher-Yates with trial offset seed+attempt*1009 ...
PASS: 10x4 balance ON*2 OFF*2 per task verified
PASS: opaque run_id unique 40
PASS: opaque IDs format run-<8hex> and not encoding arm
PASS: no adjacent duplicate instance/tuple verified
PASS: arm blindness: arm stored only in schedule, run_id opaque
PASS: prompt equality verified across 1 staged runs
PASS: no gold patch/test_patch exposure in run dirs (agent-visible staging clean)
PASS: .gitignore ignores benchmark/runs/
PASS: runtime workspace ignored
PASS: execution model frozen cockpit-gpt/gpt-5.6-sol
PASS: execution effort medium frozen
PASS: execution max_time 30m frozen
PASS: execution control_max_time 20s frozen
PASS: execution approval_mode yolo frozen
PASS: execution auto_approve frozen
PASS: execution extension path J:/PigeonYang/tools/weconverge/index.ts frozen
PASS: execution control sequence off/on/reset frozen with exact noninteractive command
PASS: execution trial command template frozen (30m yolo @PROMPT.md)
PASS: execution continuation policy frozen (continue after trial failure, stop only on controller/invariant)
PASS: execution schedule_sha256 matches 93e2cacdad41...
PASS: execution schedule_total_runs 40 frozen
PASS: execution first_run run_id run-641b399e frozen
PASS: execution first_run arm ON frozen
PASS: execution first_run model frozen
PASS: execution first_run effort medium frozen
PASS: execution first_run exit 0 frozen
PASS: execution first_run duration 265000 ms frozen
PASS: execution first_run final_answer_sha256 1fb221c46caa...
PASS: execution first_run patch_sha256 4dfdf3f82719...
PASS: exact 40-run immutability verified via schedule_sha256 and count
PASS: first run has grading.json
PASS: first run has result-anon.json
PASS: first run has patch.diff
PASS: first run has final-answer.txt
PASS: first run has patch.json
PASS: first run has meta.json
PASS: first run has PROMPT.md
PASS: first run has controller.json
PASS: finalized first-run anonymity verified (no arm in grading/result-anon/meta/PROMPT)
PASS: first run patch hash verified 4dfdf3f82719...
PASS: first run patch git_status present: M src/_pytest/logging.py | M testing/logging/test_fixture.py
PASS: first run patch sha matches execution config
PASS: first run final-answer hash verified 1fb221c46caa...
PASS: controller.json retains arm in controller-only metadata (allowed)
PASS: schedule index 0 is run-641b399e
PASS: first run finalized, resume should skip it
PASS: resume selects index 1 correct: run-df2bcff0 (matplotlib OFF2)
VERIFIER PASS
```

## Execution evidence (capture + dry-run, no provider)

- Capture: `node scripts/benchmark-weconverge.mjs capture --run run-641b399e --exit-code 0 --duration-ms 265000 --final-answer benchmark/runs/run-641b399e/final-answer.txt` → captured patch_sha256 `4dfdf3f827197cb7e967181fe19236fc23f058b17e3fb89ac6ab848dcba724d5`, final_answer_sha256 `1fb221c46caab815935add1022e85716e98d18658dc7074fd9b9fca23329df47`, git_head `aa55975c7d3f6c9f6d7f68accc41bb7cadf0eb9a`, git_status `M src/_pytest/logging.py | M testing/logging/test_fixture.py`, created `result-anon.json`/`grading.json` without arm, `controller.json` retains arm ON, `patch.json` records hash/status.

- Dry-run executor: `node scripts/benchmark-weconverge.mjs execute --run run-df2bcff0 --dry-run` → stages matplotlib OFF2 if needed, applies control `off` (dry), simulates trial exit 0 duration 1000, captures placeholder, verifies no arm leak, shows execute transitions without provider calls. `execute-all --dry-run` walks schedule sequentially, skips finalized `run-641b399e`, selects `run-df2bcff0` next, continues after simulated failures.

- Resume: first run finalized at index 0, next unfinalized is `run-df2bcff0` index 1 (matplotlib OFF2) — verifier confirms.

## Owned tracked paths (5 for executor)
- `benchmark/execution.json` (new immutable execution config)
- `scripts/benchmark-weconverge.mjs` (execution commands)
- `scripts/check-benchmark.mjs` (extended verifier)
- `.ai/loops/state.json` (executor gate + first-run evidence)
- `.ai/loops/reports/2026-08-20-weconverge-benchmark-bootstrap.md` (this report)

Runtime `benchmark/runs/` remains ignored; individual run artifacts (`grading.json`, `result-anon.json`, `patch.json`, `patch.diff`, `final-answer.txt`, `controller.json`) stay under ignored path.

## Residual & Blockers
- No residual failures; all gates pass including executor.
- No blocker: execution config frozen, first run captured truthfully, verifier extended and passing, resume idempotency verified.
- Remaining 39 runs not yet executed (sequential execution to be run under OMP hub supervision; no automatic scoring yet).
