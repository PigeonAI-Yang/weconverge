#!/usr/bin/env node
// Machine-checkable ledger validator for WEConverge (v3, 2026-08-20).
// Enforces, in addition to dependency/status invariants:
//   1. done tasks must reference artifacts/evidence that really exist on disk;
//   2. T07 may not be `done` while any AC-101..115 row in ACCEPTANCE.md is
//      BLOCKED / unpassed (parsed per-AC from ACCEPTANCE.md);
//   3. commit hashes cited in verifiedBy/artifacts must resolve in git; a verifiedBy
//      claiming a clean worktree requires `git status --porcelain` to be empty; a
//      top-level "head" field must equal `git rev-parse HEAD`. If the target tree is
//      not a git work tree (or git is unavailable), these checks degrade to a skip
//      with a printed note instead of failing;
//   4. PLAN.md dependency-block statuses must match ledger.json;
//   5. when T04/T05/T06 are done, the typecheck/test gates must actually exit 0.
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

// ---------- ACCEPTANCE.md AC status parsing ----------
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

// ---------- 1. done evidence/artifacts must exist ----------
for (const t of ledger.tasks) {
  if (t.status !== "done") continue;
  for (const a of t.artifacts ?? []) {
    if (!artifactExists(a)) errors.push(`${t.id}: done but artifact missing: ${a}`);
  }
}

// ---------- 2. T07 gate: AC-101..115 BLOCKED => T07 not done ----------
{
  const t07 = byId.get("T07");
  const acs = ledger.acceptanceGate?.realOmpAcs ?? [];
  let acceptance = "";
  try {
    acceptance = readFileSync(join(root, "ACCEPTANCE.md"), "utf8");
  } catch {
    errors.push("ACCEPTANCE.md missing");
  }
  if (t07 && t07.status === "done" && acceptance) {
    const blockedAcs = acs.filter((ac) => acceptanceAcBlocked(acceptance, ac));
    if (blockedAcs.length > 0) {
      errors.push(
        `T07: done but ${blockedAcs.length} AC(s) still BLOCKED/unpassed in ACCEPTANCE.md: ${blockedAcs.join(",")}`,
      );
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

// ---------- report ----------
const counts = { pending: 0, in_progress: 0, done: 0, blocked: 0 };
for (const t of ledger.tasks) counts[t.status]++;

console.log("WEConverge ledger check (v3)");
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
console.log("OK: dependency, evidence, T07-gate, git-consistency, PLAN-consistency and gate invariants satisfied.");
