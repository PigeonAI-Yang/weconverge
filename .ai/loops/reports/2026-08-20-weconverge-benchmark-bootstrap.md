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

## Controller boundaries
- `preflight`: records git/node/omp/docker/wsl availability without installing; writes `benchmark/preflight.json` (ignored).
- `stage --run <opaque-id>`: creates `benchmark/runs/<run_id>` fresh, refuses dirty/reused, emits `PROMPT.md` with exact problem_statement (no arm label), `instance.json` without patch, `meta.json` without arm, `clone-status.json` (attempts `git clone --depth 1 https://github.com/<repo>.git` + checkout base_commit, truthfully records blocked if unavailable).
- `finalize --run <id> --result <path>`: validates staged run, copies result into `grading.json` with `{run_id, instance_id, repeat, index, submitted_at, result}` and zero arm disclosure.

## Gates & Checkpoints
- Gate 1 corpus hash/provenance: PASS
- Gate 2 schedule balance/opaque/adjacency: PASS
- Gate 3 controller preflight/stage/finalize: PASS (stage cloned pytest successfully)
- Gate 4 verifier `node scripts/check-benchmark.mjs`: PASS (see below)
- Gate 5 stage smoke: PASS (staged 4 runs for pytest-dev__pytest-10051, verified prompt equality, dirty-reuse refused, finalize anonymized, cleaned)

## Prerequisite matrix (2026-08-20 preflight)
| tool | available | version/status |
|---|---|---|
| git | true | 2.51.0.windows.1 |
| node | true | v24.13.1 |
| omp | true | omp/17.4.0 |
| docker | true | Docker version 29.2.1 |
| wsl | true | available |

All required tools available; no installation performed.

## Verifier output (final, after clean)
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
INFO: no staged run prompts to check (stage smoke not yet run) — prompt equality vacuously true
PASS: no gold patch/test_patch exposure in run dirs (agent-visible staging clean)
PASS: .gitignore ignores benchmark/runs/
PASS: runtime workspace ignored
VERIFIER PASS
```

With 4 staged runs (pre-clean):
```
PASS: prompt equality verified across 4 staged runs
```

## Stage smoke evidence (real controller path, no OMP/provider)
- `node scripts/benchmark-weconverge.mjs stage --run run-641b399e` → staged true, clone success true (pytest base aa55975c...), PROMPT.md 1371 chars verified against corpus sha `c8f618a73662...`, no arm label.
- Staged 4 runs for same instance (`run-641b399e, run-efe28398, run-e5b9d7ed, run-67d5a3f0`) — verifier confirmed identical PROMPT.md across all 4, no gold patch in run dirs.
- `stage --run run-641b399e` re-run refused: `refusing dirty/reused run directory ... contains 6 entries` exit 2 (non-destructive).
- `finalize --run run-641b399e --result dummy.json` → grading.json contains `{run_id, instance_id, repeat, index, result}` with no `arm` field.
- Runtime output removed: `benchmark/runs/` empty, `benchmark/preflight.json` removed, verifier re-passed.

## Owned tracked paths (8)
- `.ai/loops/LOOP_PROFILE.md`
- `.ai/loops/state.json`
- `.ai/loops/reports/2026-08-20-weconverge-benchmark-bootstrap.md`
- `benchmark/corpus.json`
- `benchmark/schedule.json`
- `scripts/benchmark-weconverge.mjs`
- `scripts/check-benchmark.mjs`
- `.gitignore`

Runtime `benchmark/runs/` remains ignored and empty at commit.

## Residual & Blockers
- No residual failures; all gates pass.
- No blocker: official dataset retrieval succeeded (parquet verified), git clone capability available (pytest cloned), environment preflight complete.
