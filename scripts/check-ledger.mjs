#!/usr/bin/env node
// Machine-checkable ledger validator for WEConverge.
// Enforces: a task may only be `in_progress` if all deps are `done`;
//           a task may only be `done` if it was `in_progress` and verified.
// Usage: node scripts/check-ledger.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ledgerPath = join(here, "..", "ledger.json");

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
  if (t.status === "blocked" && !t.verifiedBy) {
    warnings.push(`${t.id}: blocked without evidence in verifiedBy`);
  }
}

const counts = { pending: 0, in_progress: 0, done: 0, blocked: 0 };
for (const t of ledger.tasks) counts[t.status]++;

console.log("WEConverge ledger check");
console.log(`  tasks: ${ledger.tasks.length}  done=${counts.done} in_progress=${counts.in_progress} pending=${counts.pending} blocked=${counts.blocked}`);
if (errors.length) {
  console.error("FAILED:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
if (warnings.length) {
  for (const w of warnings) console.warn("  warn: " + w);
}
console.log("OK: dependency + status invariants satisfied.");
