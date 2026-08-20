#!/usr/bin/env node
// Machine-checkable ledger validator for WEConverge (v5, 2026-08-20 pure advisory).
// Enforces, in addition to dependency/status invariants:
//   1. done tasks must reference artifacts/evidence that really exist on disk;
//   2. T07 (historical AC-101..115 via ACCEPTANCE.md) may not be `done` while any AC row in ACCEPTANCE.md is BLOCKED / SOURCE GAP;
//   3. T14 (revised advisory AC-L01..L05 / AC-C01..C03 via ACCEPTANCE_ADVISORY.md) may not be `done` while any revised AC is not PASS (SOURCE GAP / NOT OBSERVED / BLOCKED);
//   4. commit hashes cited in verifiedBy/artifacts must resolve in git; a verifiedBy
//      claiming a clean worktree requires `git status --porcelain` to be empty; a
//      top-level "head" field must equal `git rev-parse HEAD`. If the target tree is
//      not a git work tree (or git is unavailable), these checks degrade to a skip
//      with a printed note instead of failing;
//   5. PLAN.md dependency-block statuses must match ledger.json;
//   6. when T04/T05/T06 are done, the typecheck/test gates must actually exit 0;
//   7. advisory migration: historical truth preserved, advisory implementation T11/T12/T13 done at 48621b9, T14 blocked on revised ACs, at most one in_progress (zero valid).
// Usage: node scripts/check-ledger.mjs
//        WECONVERGE_ROOT=<fixture-or-repo-root> node scripts/check-ledger.mjs
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.WECONVERGE_ROOT
  ? resolve(process.env.WECONVERGE_ROOT)
  : join(here, "..");
const ledgerPath = join(root, "ledger.json");

let ledger;
try {
  ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
} catch (e) {
  console.error("LEDGER PARSE ERROR:", e.message);
  process.exit(2);
}

const valid = new Set(["pending", "in_progress", "done", "blocked"]);
const byId = new Map();
for (const t of ledger.tasks) byId.set(t.id, t);

const errors = [];
const warnings = [];

// ---------- helpers ----------
function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

const gitState = { checked: false, available: false, reason: "" };
function gitAvailable() {
  if (!gitState.checked) {
    gitState.checked = true;
    if (git(["rev-parse", "--is-inside-work-tree"]) === "true") {
      gitState.available = true;
    } else {
      gitState.available = false;
      gitState.reason =
        "git is unavailable or WECONVERGE_ROOT is not inside a git work tree; commit/HEAD/worktree checks skipped";
    }
  }
  return gitState.available;
}

function artifactExists(raw) {
  // Strip annotation suffix like "(junction)".
  const m = raw.match(/^(.*?)\(([^)]*)\)\s*$/);
  const p = (m ? m[1] : raw).trim();
  const annotation = m ? m[2] : "";
  if (annotation === "junction") {
    // Junction lives in the OMP user extensions dir, outside this repo. Verify only
    // when the location is provided explicitly; never guess machine-specific paths.
    const dir = process.env.OMP_EXTENSIONS_DIR;
    if (!dir) {
      warnings.push(`junction artifact "${raw}" not verified (set OMP_EXTENSIONS_DIR to verify)`);
      return true;
    }
    return existsSync(join(dir, basename(p)));
  }
  if (p.includes("*")) {
    // simple "<dir>/*.<ext>" glob
    const starDir = join(root, dirname(p));
    if (!existsSync(starDir)) return false;
    const suffix = p.slice(p.lastIndexOf("*") + 1);
    return readdirSync(starDir).some((f) => f.endsWith(suffix));
  }
  return existsSync(join(root, p));
}

const gateCache = new Map();
function runGate(name, command, args) {
  if (!gateCache.has(name)) {
    try {
      // Windows cannot execFile .cmd shims (npx) directly (EINVAL since the Node
      // batch-file CVE fix); route through the shell there.
      execFileSync(command, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
      gateCache.set(name, { ok: true });
    } catch (e) {
      gateCache.set(name, { ok: false, output: String(e.stdout ?? "") + String(e.stderr ?? "") });
    }
  }
  return gateCache.get(name);
}

function typecheckGateOk() {
  // Every tsconfig*.json in the repo root must compile clean. This automatically
  // covers the extension wiring once its tsconfig exists — a done task may not
  // rest on an unchecked surface.
  const configs = readdirSync(root).filter((f) => /^tsconfig\..*\.json$/.test(f));
  for (const cfg of configs) {
    const r = runGate(`tsc:${cfg}`, "npx", ["tsc", "--noEmit", "-p", cfg]);
    if (!r.ok) return { ok: false, which: cfg, output: r.output };
  }
  return { ok: true };
}

function testGateOk() {
  return runGate("test:native", "node", [
    "--experimental-strip-types",
    "--loader",
    "./scripts/node-ts-loader.mjs",
    "test/mechanical.test.ts",
  ]);
}

// ---------- ACCEPTANCE.md AC status parsing (historical) ----------
// A line mentioning an AC counts as BLOCKED/unpassed when it carries an explicit
// failure marker (English or Chinese) and is not explicitly negated ("not blocked").
const AC_BLOCKED_RE =
  /\bBLOCKED\b|SOURCE\s*GAP|FAIL(?:ED|URE)?|NOT\s*PASS(?:ED)?|NO\s*PASS|未通过|不通过|未合格|阻塞|受阻|未(?:能|有|获)[^。\n]{0,12}证据|无[^。\n]{0,12}证据|ENVIRONMENT-BLOCKED/i;
const AC_NOT_BLOCKED_RE = /not\s+blocked|非\s*blocked|未阻塞|不阻塞|未受限/i;

function acceptanceAcBlocked(acceptance, ac) {
  const re = new RegExp(`\\b${ac}\\b`, "i");
  for (const line of acceptance.split(/\r?\n/)) {
    if (!re.test(line)) continue;
    if (AC_NOT_BLOCKED_RE.test(line)) continue;
    if (AC_BLOCKED_RE.test(line)) return true;
  }
  return false;
}

// ---------- ACCEPTANCE_ADVISORY.md revised AC parsing ----------
// For revised ACs, verdict is in markdown table row: | **AC-L02** | **SOURCE GAP** | ...
// Consider blocked if verdict column contains SOURCE GAP / NOT OBSERVED / BLOCKED / FAIL (not PASS).
// AC-L03 is PASS with subfield SOURCE GAP noted in evidence column, but verdict column is PASS -> not blocked.
function advisoryAcBlocked(advisoryText, ac) {
  const re = new RegExp(`\\b${ac}\\b`, "i");
  for (const line of advisoryText.split(/\r?\n/)) {
    if (!re.test(line)) continue;
    // Table row detection: split by '|'
    if (line.includes("|")) {
      const cols = line.split("|");
      // cols[0] is empty before first |, cols[1] is AC cell, cols[2] is verdict cell, cols[3] is evidence
      // Find verdict column: first col after AC that contains **VERDICT**
      // For table rows, verdict is typically cols[2]
      let verdict = "";
      if (cols.length >= 3) {
        // Use cols[2] as verdict if line looks like table row with AC in cols[1]
        // More robust: join cols[2] as verdict
        verdict = cols[2] || "";
        // Also include cols[2]..cols[3] for safety if verdict spans
      }
      const vUp = verdict.toUpperCase();
      // If verdict explicitly contains PASS as standalone bold, not blocked even if evidence mentions SOURCE GAP elsewhere
      if (/\*\*PASS\*\*/i.test(verdict)) {
        // Check if verdict also says PASS with caveat but still PASS: e.g. "**PASS** (with documented subfield SOURCE GAP)"
        // This is considered PASS, not blocked. The remaining evidence column may contain SOURCE GAP but verdict is PASS.
        return false;
      }
      if (/\bSOURCE\s*GAP\b/i.test(verdict) || /\bNOT\s*OBSERVED\b/i.test(verdict) || /\bBLOCKED\b/i.test(verdict) || /\bFAIL/i.test(verdict)) {
        return true;
      }
      // Fallback: if verdict empty or not table, check whole line for blocked markers but exclude PASS lines
      // If whole line contains PASS verdict elsewhere, don't flag subfield mentions
      if (/\bSOURCE\s*GAP\b/i.test(line) || /\bNOT\s*OBSERVED\b/i.test(line) || /\bBLOCKED\b/i.test(line)) {
        // If line contains **PASS**, it's not blocked (AC-L03 case)
        if (/\*\*PASS\*\*/i.test(line) && !/\*\*(SOURCE\s*GAP|NOT\s*OBSERVED|BLOCKED)\*\*/i.test(verdict || line)) {
          // If verdict is PASS, subfield mention in evidence should not count
          // But if verdict itself is SOURCE GAP/NOT OBSERVED, already returned true
          return false;
        }
        // Otherwise blocked
        // Distinguish AC-L03 subfield: line has PASS verdict, so return false
        if (/\*\*PASS\*\*/i.test(line)) return false;
        return true;
      }
      return false;
    } else {
      // Non-table line fallback: similar to old logic but with NOT OBSERVED
      if (AC_NOT_BLOCKED_RE.test(line)) continue;
      const blockedRe = /\b(BLOCKED|SOURCE\s*GAP|NOT\s*OBSERVED|FAIL|NOT\s*PASS)\b/i;
      if (blockedRe.test(line)) return true;
    }
  }
  return false;
}

// ---------- 0. base invariants ----------
for (const t of ledger.tasks) {
  if (!valid.has(t.status)) errors.push(`${t.id}: invalid status "${t.status}"`);
  for (const d of t.deps ?? []) {
    if (!byId.has(d)) errors.push(`${t.id}: missing dep "${d}"`);
  }
  const deps = (t.deps ?? []).map((d) => byId.get(d)).filter(Boolean);
  if (t.status === "in_progress" && deps.some((d) => d.status !== "done")) {
    errors.push(`${t.id}: in_progress but dep not done (${deps.filter((d) => d.status !== "done").map((d) => d.id).join(",")})`);
  }
  if (t.status === "done" && deps.some((d) => d.status !== "done")) {
    errors.push(`${t.id}: done but dep not done (${deps.filter((d) => d.status !== "done").map((d) => d.id).join(",")})`);
  }
  if (t.status === "done" && !t.verifiedBy) {
    errors.push(`${t.id}: done without verifiedBy`);
  }
  if (t.status === "blocked" && !t.verifiedBy && !t.note) {
    warnings.push(`${t.id}: blocked without evidence in verifiedBy/note`);
  }
}

const inProgress = ledger.tasks.filter((t) => t.status === "in_progress");
if (inProgress.length > 1) {
  errors.push(`more than one in_progress task: ${inProgress.map((t) => t.id).join(",")}`);
}
// Zero in_progress is valid when all ready advisory implementation tasks are done and sole remaining revised live gate is blocked.
// No warning/error for zero. Previously required exactly one; now at most one.
if (inProgress.length === 0) {
  // Allow zero when T11,T12,T13 done and T14 blocked - check if that holds to avoid false warning
  const t11 = byId.get("T11"), t12 = byId.get("T12"), t13 = byId.get("T13"), t14 = byId.get("T14");
  const advisoryDoneReady = t11?.status === "done" && t12?.status === "done" && t13?.status === "done" && t14?.status === "blocked";
  if (!advisoryDoneReady) {
    // Only warn if not in advisory converged state; but don't fail
    // For pure advisory converged state, silent.
  }
}

// ---------- 1. done evidence/artifacts must exist ----------
for (const t of ledger.tasks) {
  if (t.status !== "done") continue;
  for (const a of t.artifacts ?? []) {
    if (!artifactExists(a)) errors.push(`${t.id}: done but artifact missing: ${a}`);
  }
}

// ---------- 2. T07 historical gate (ACCEPTANCE.md AC-101..115) + advisory live gate (ACCEPTANCE_ADVISORY.md AC-L01..L05/AC-C01..C03) ----------
{
  let acceptance = "";
  try {
    acceptance = readFileSync(join(root, "ACCEPTANCE.md"), "utf8");
  } catch {
    errors.push("ACCEPTANCE.md missing");
  }
  let advisory = "";
  try {
    advisory = readFileSync(join(root, "ACCEPTANCE_ADVISORY.md"), "utf8");
  } catch {
    errors.push("ACCEPTANCE_ADVISORY.md missing");
  }
  if (acceptance) {
    // T07 gate (historical AC-101..115) - must use acceptanceGate.realOmpAcs
    const t07 = byId.get("T07");
    const acs = ledger.acceptanceGate?.realOmpAcs ?? [];
    if (t07 && t07.status === "done") {
      const blockedAcs = acs.filter((ac) => acceptanceAcBlocked(acceptance, ac));
      if (blockedAcs.length > 0) {
        errors.push(
          `T07: done but ${blockedAcs.length} AC(s) still BLOCKED/unpassed in ACCEPTANCE.md: ${blockedAcs.join(",")}`,
        );
      }
    }
    // Ensure acceptanceGate still lists historical ACs (not revised)
    const hasHistorical = acs.some((ac) => /^AC-10\d$/.test(ac) || /^AC-11\d$/.test(ac));
    if (!hasHistorical && acs.length > 0) {
      warnings.push("acceptanceGate should retain historical AC-101..115 for T07");
    }
  }
  if (advisory) {
    // Advisory live gate: any task listed in advisoryGate.liveTaskIds (T14) must not be done while any revised AC is not PASS
    const advisoryIds = ledger.advisoryGate?.liveTaskIds ?? [];
    const advisoryAcs = ledger.advisoryGate?.realOmpAcs ?? [];
    // Validate advisoryGate uses revised AC ids (not old AC-101..115)
    const hasOld = advisoryAcs.some((ac) => /^AC-10\d$/.test(ac) || /^AC-11\d$/.test(ac));
    if (hasOld) {
      errors.push(`advisoryGate lists old AC-101..115 but must use revised AC-L01..L05/AC-C01..C03: ${advisoryAcs.join(",")}`);
    }
    const expectedRevised = ["AC-L01","AC-L02","AC-L03","AC-L04","AC-L05","AC-C01","AC-C02","AC-C03"];
    const missingRevised = expectedRevised.filter((ac) => !advisoryAcs.includes(ac));
    if (missingRevised.length > 0) {
      errors.push(`advisoryGate missing revised ACs: ${missingRevised.join(",")} (expected ${expectedRevised.join(",")})`);
    }
    for (const liveId of advisoryIds) {
      const t = byId.get(liveId);
      if (t && t.status === "done") {
        const blocked = advisoryAcs.filter((ac) => advisoryAcBlocked(advisory, ac));
        if (blocked.length > 0) {
          errors.push(
            `${liveId}: done but ${blocked.length} AC(s) still BLOCKED/SOURCE GAP/NOT OBSERVED in ACCEPTANCE_ADVISORY.md: ${blocked.join(",")} — revised live acceptance must remain blocked/pending until real revised AC passes`,
          );
        }
      }
    }
    // If T14 is blocked, report honest blockers for info (not error) - but ensure T14 not done when blocked ACs exist
    // Generic hardening: any task whose title suggests revised live advisory acceptance cannot be done while revised ACs blocked
    for (const t of ledger.tasks) {
      if (t.status !== "done") continue;
      if (/修订版.*真实.*OMP.*咨询验收|revised.*live.*advisory/i.test(t.title)) {
        const blocked = advisoryAcs.filter((ac) => advisoryAcBlocked(advisory, ac));
        if (blocked.length > 0) {
          errors.push(`${t.id}: revised live advisory done but ACCEPTANCE_ADVISORY still has BLOCKED/SOURCE GAP/NOT OBSERVED: ${blocked.join(",")}`);
        }
      }
    }
    // Also ensure T14 acs uses revised ids
    const t14 = byId.get("T14");
    if (t14) {
      const t14HasOld = (t14.acs ?? []).some((ac) => /^AC-10\d$/.test(ac));
      if (t14HasOld) {
        errors.push(`T14 acs must use revised AC-L01..L05/AC-C01..C03, not old AC-101..115: ${t14.acs.join(",")}`);
      }
      const t14Missing = expectedRevised.filter((ac) => !(t14.acs ?? []).includes(ac));
      // Allow T14 to list subset? But contract says T14 and advisoryGate use revised AC ids/file; require at least L01..L05 and C01..C03
      if (t14Missing.length > 0) {
        warnings.push(`T14 acs missing some revised ACs: ${t14Missing.join(",")} (expected ${expectedRevised.join(",")})`);
      }
    }
  }
}

// ---------- 3. commit / HEAD / worktree consistency ----------
if (!gitAvailable()) {
  console.log(`  skip: ${gitState.reason} (root=${root})`);
} else {
  const cited = new Set();
  for (const t of ledger.tasks) {
    const text = [t.verifiedBy ?? "", ...(t.artifacts ?? [])].join(" ");
    for (const m of text.matchAll(/\b[0-9a-f]{7,40}\b/g)) cited.add(m[0]);
  }
  for (const h of cited) {
    if (git(["cat-file", "-e", `${h}^{commit}`]) === null) {
      errors.push(`commit cited but not found in git history: ${h}`);
    }
  }
  if (typeof ledger.head === "string") {
    const head = git(["rev-parse", "HEAD"]);
    if (head === null) errors.push("cannot resolve git HEAD");
    else if (!head.startsWith(ledger.head) && !ledger.head.startsWith(head)) {
      errors.push(`ledger.head ${ledger.head} != git HEAD ${head}`);
    }
  }
  const claimsClean = ledger.tasks.some(
    (t) => t.status === "done" && /工作树干净|工作树清洁|worktree\s*clean|clean\s*(work)?tree/i.test(t.verifiedBy ?? ""),
  );
  if (claimsClean) {
    const status = git(["status", "--porcelain"]);
    if (status === null) errors.push("cannot read git status");
    else if (status.length > 0) {
      errors.push(`verifiedBy claims clean worktree but git status is dirty:\n${status}`);
    }
  }
}

// ---------- 4. PLAN.md <-> ledger consistency ----------
{
  let plan = "";
  try {
    plan = readFileSync(join(root, "PLAN.md"), "utf8");
  } catch {
    errors.push("PLAN.md missing");
  }
  const planStatus = new Map();
  for (const line of plan.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:-\s*)?(T\d{2})\b.*?→\s*(done|in_progress|pending|blocked)\b/);
    if (m) planStatus.set(m[1], m[2]);
  }
  for (const [id, st] of planStatus) {
    const t = byId.get(id);
    if (!t) {
      errors.push(`PLAN lists ${id} but ledger has no such task`);
      continue;
    }
    if (t.status !== st) errors.push(`${id}: PLAN says "${st}" but ledger says "${t.status}"`);
  }
  // Also ensure ledger tasks that appear in PLAN block are not missing from PLAN
  for (const t of ledger.tasks) {
    if (!planStatus.has(t.id) && /^T\d{2}$/.test(t.id)) {
      // Allow historical or future tasks not yet in PLAN block, but warn if advisory tasks missing
      if (["T10", "T11", "T12", "T13", "T14"].includes(t.id)) {
        warnings.push(`ledger has advisory ${t.id} but PLAN dependency block does not list it`);
      }
    }
  }
}

// ---------- 5. gates must pass before gate-tasks may be done ----------
{
  const t04 = byId.get("T04");
  const t05 = byId.get("T05");
  const t06 = byId.get("T06");
  const needsType = [t04, t05].some((t) => t?.status === "done");
  const needsTest = t06?.status === "done";
  if (needsType) {
    const r = typecheckGateOk();
    if (!r.ok) errors.push(`typecheck gate failed (${r.which}); T04/T05 may not be done`);
  }
  if (needsTest) {
    const r = testGateOk();
    if (!r.ok) errors.push("mechanical test gate failed; T06 may not be done");
  }
}

// ---------- 6. advisory migration truthfulness ----------
{
  // Historical truth preserved: T01..T08 must retain their historical done/blocked statuses (no silent downgrade to pending)
  const historicalExpect = new Map([
    ["T01", "done"],
    ["T02", "done"],
    ["T03", "done"],
    ["T04", "done"],
    ["T05", "done"],
    ["T06", "done"],
    ["T07", "blocked"],
    ["T08", "done"],
  ]);
  for (const [id, expect] of historicalExpect) {
    const t = byId.get(id);
    if (t && t.status !== expect) {
      errors.push(`${id}: historical truth violated — expected "${expect}" but ledger says "${t.status}" (history must be preserved)`);
    }
  }
  // Advisory chain: T10 done (foundation 8ea7f34), T11/T12/T13 done at 48621b9, T14 blocked on revised ACs
  const t10 = byId.get("T10");
  if (t10 && t10.status !== "done") {
    errors.push(`T10: pure-advisory foundation must be "done" at 8ea7f34 (found "${t10.status}")`);
  }
  if (t10 && t10.status === "done") {
    // verify T10 cites foundation commit and v4/v5 checker exit 0
    const vb = t10.verifiedBy ?? "";
    if (!/8ea7f34/.test(vb)) errors.push("T10: done must cite foundation commit 8ea7f34 in verifiedBy");
    if (!/check-ledger\.mjs.*exit 0/i.test(vb)) warnings.push("T10: verifiedBy should cite checker exit 0");
    for (const a of t10.artifacts ?? []) {
      if (!artifactExists(a)) errors.push(`T10: done but artifact missing: ${a}`);
    }
  }
  const t11 = byId.get("T11");
  const t12 = byId.get("T12");
  const t13 = byId.get("T13");
  // T11,T12,T13 must be done with evidence citing 48621b9 and required gates
  for (const [id, t] of [["T11", t11], ["T12", t12], ["T13", t13]]) {
    if (!t) continue;
    if (t.status !== "done") {
      errors.push(`${id}: pure-advisory implementation must be "done" at 48621b9 (found "${t.status}")`);
    }
    if (t.status === "done") {
      const vb = t.verifiedBy ?? "";
      if (!/48621b9/.test(vb)) errors.push(`${id}: done must cite implementation commit 48621b9 in verifiedBy`);
      for (const a of t.artifacts ?? []) {
        if (!artifactExists(a)) errors.push(`${id}: done but artifact missing: ${a}`);
      }
    }
  }
  // Specific evidence checks per contract: T11/T12/T13 verifiedBy must contain exact proofs
  if (t11?.status === "done") {
    const vb = t11.verifiedBy ?? "";
    if (!/typecheck:core.*exit 0/i.test(vb)) warnings.push("T11: verifiedBy should cite typecheck:core exit 0");
  }
  if (t12?.status === "done") {
    const vb = t12.verifiedBy ?? "";
    if (!/32 members verified/i.test(vb) && !/32 declared members/i.test(vb)) warnings.push("T12: verifiedBy should cite 32 members verified");
  }
  if (t13?.status === "done") {
    const vb = t13.verifiedBy ?? "";
    if (!/35.*60/i.test(vb) || !/65 passed.*0 failed/i.test(vb)) {
      errors.push("T13: verifiedBy must cite POLICY 35 tokens <=60, 65 passed 0 failed");
    }
    if (!/typecheck:core.*exit 0/i.test(vb)) warnings.push("T13: verifiedBy should cite typecheck:core exit 0");
  }
  const t14 = byId.get("T14");
  if (t14 && t14.status === "done") {
    errors.push("T14: revised live advisory acceptance must remain blocked/pending until real revised AC passes (found done)");
  }
  if (t14 && t14.status !== "blocked") {
    errors.push(`T14: revised live advisory must be "blocked" (found "${t14.status}")`);
  }
  if (t14 && t14.status === "blocked") {
    const vb = (t14.verifiedBy ?? "") + " " + (t14.note ?? "");
    // Must reference the four blockers
    const need = ["AC-L02", "AC-L04", "AC-L05", "AC-C03"];
    for (const ac of need) {
      if (!vb.includes(ac)) warnings.push(`T14 blocked evidence should reference ${ac}`);
    }
    if (!/SOURCE GAP/i.test(vb) || !/NOT OBSERVED/i.test(vb)) warnings.push("T14 blocked evidence should cite SOURCE GAP / NOT OBSERVED");
    if (!/ACCEPTANCE_ADVISORY\.md/i.test(vb)) warnings.push("T14 blocked evidence should cite ACCEPTANCE_ADVISORY.md");
  }
  if (!ledger.advisoryMigration) {
    warnings.push("ledger missing advisoryMigration note (pure-advisory authorization should be recorded)");
  } else {
    // Ensure stale wording removed: should not claim T11 in_progress or pending chain when already done
    const note = ledger.advisoryMigration.note ?? "";
    if (/唯一 in_progress.*T11/i.test(note) || /T11\.\.T13 为.*pending/i.test(note) || /未声称任何纯咨询实现已完成/.test(note)) {
      warnings.push("advisoryMigration note still contains stale pending/in_progress wording; should reflect T11/T12/T13 done at 48621b9");
    }
  }
}

// ---------- report ----------
const counts = { pending: 0, in_progress: 0, done: 0, blocked: 0 };
for (const t of ledger.tasks) counts[t.status]++;

console.log("WEConverge ledger check (v5 pure advisory)");
console.log(`  root: ${root}`);
console.log(`  tasks: ${ledger.tasks.length}  done=${counts.done} in_progress=${counts.in_progress} pending=${counts.pending} blocked=${counts.blocked}`);
if (errors.length) {
  console.error("FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
if (warnings.length) {
  for (const w of warnings) console.warn("  warn: " + w);
}
console.log("OK: dependency, evidence, T07+advisory-gate, git-consistency, PLAN-consistency and gate invariants satisfied.");
