# LOOP_PROFILE — WEConverge Paired Benchmark

## Purpose anchor
Determine whether WEConverge materially improves final code-repair quality enough to justify keeping it enabled.

## Failure conditions (harness fails when any true)
- Cannot freeze exact tasks / prompts / base commits (corpus not deterministic or hash-mismatched).
- Cannot produce a balanced deterministic 40-run schedule (10 tasks × ON×2 + OFF×2, randomized order, seed frozen).
- Leaks condition labels (ON/OFF) into blind grading artifacts (PROMPT.md or grading.json).
- Cannot stage a fresh isolated run from its manifest (stage --run refuses or corrupts).

## Scope / Budget
- Max 15 minutes wall time per bootstrap.
- At most 8 tracked files (owned paths listed below).
- One implementation attempt plus one understood gate repair (verifier-driven).
- No new dependencies, no Docker/WSL/package installation, no provider calls, no source-code changes to WEConverge, no weakening acceptance.

## Owned tracked paths (max 8)
1. `.ai/loops/LOOP_PROFILE.md`
2. `.ai/loops/state.json`
3. `.ai/loops/reports/2026-08-20-weconverge-benchmark-bootstrap.md`
4. `benchmark/corpus.json`
5. `benchmark/schedule.json`
6. `scripts/benchmark-weconverge.mjs`
7. `scripts/check-benchmark.mjs`
8. `.gitignore`

Runtime outputs under ignored `benchmark/runs/` (never tracked).

## Permissions
- External official `princeton-nlp/SWE-bench_Verified` dataset may be read, not modified.
- No WEConverge source files may be changed.
- No provider/OMP execution; no Docker image pull; no package install.

## Gates (must pass sequentially)
1. **Corpus gate**: provenance matches `c104f840cc67f8b6eec6f759ebc8b2693d585d4a`, 10 instances, hashes verified, stratification documented, no gold patch in agent-visible staging.
2. **Schedule gate**: 10×4 balance, seed `20260820` mulberry32 FI+retry (attempt 55) opaque `run-<8hex>` not encoding arm, no adjacent duplicate instance/tuple.
3. **Controller gate**: `preflight` records git/node/omp/docker/wsl without installing; `stage --run` creates fresh isolated `benchmark/runs/<run_id>` with exact PROMPT.md and refuses dirty reuse; `finalize` creates anonymous grading without arm disclosure.
4. **Verifier gate**: `node scripts/check-benchmark.mjs` exits 0 (provenance, balance, opaque, blindness, prompt equality, ignored workspace).
5. **Stage smoke gate**: one end-to-end `stage --run <frozen-id>` through real controller without OMP/provider, then clean.

## Checkpoint policy
- Trigger manual (`preflight`/`stage`/`finalize`).
- Completion authority: one verifier checks schema/invariants/hashes/balance/no label leakage; one smoke stages a real corpus run directory from the frozen manifest without invoking OMP/provider, then cleans runtime output.
- Sequential execution only because enabled state may persist.
- Commit-on-success: message `test(weconverge): bootstrap paired benchmark`; no push. Partial/blocked states never commit as complete.

## Sequencing
- `benchmark/corpus.json` → `benchmark/schedule.json` share provenance; controller and verifier consume both.
- Staging depends on frozen manifest; verifier depends on all harness files.
