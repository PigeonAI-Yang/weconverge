// Config validation per SPEC §5.1. Pure, no I/O.
import type { ConfigV1, EffortLevel, EffortPoliciesBlock } from "./types";
import { EFFORT_ORDER_MAP } from "./types";

export interface ConfigValidation {
  ok: boolean;
  errors: string[];
}

export interface EffortPolicyValidation {
  ok: boolean;
  errors: Array<{ code: string; message: string }>;
}

const VALID_EFFORTS: EffortLevel[] = ["medium", "high", "xhigh", "max"];
const VALID_EFFORT_SET = new Set<string>(VALID_EFFORTS);

export function isValidGlob(pattern: string): boolean {
  if (typeof pattern !== "string") return false;
  if (pattern.length === 0) return false;
  if (pattern.trim().length === 0) return false;
  if (pattern.includes("**")) return false;
  if (/[[\\\]{]/.test(pattern) || pattern.includes("}")) return false;
  // only * and ? allowed as wildcards, but other chars are literals
  // disallow regex-like chars already checked; otherwise valid
  return true;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function globToRegex(pattern: string): RegExp {
  // Convert * -> .*, ? -> ., escape rest
  let re = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") re += ".*";
    else if (c === "?") re += ".";
    else re += escapeRegex(c);
  }
  re += "$";
  return new RegExp(re);
}

export function globMatch(pattern: string, str: string): boolean {
  const re = globToRegex(pattern);
  return re.test(str);
}

export function canonicalizeModelId(modelId: string | null): string | null {
  if (modelId == null) return null;
  // strip recognized final effort suffix only: :medium, :high, :xhigh, :max
  const m = modelId.match(/^(.*):(medium|high|xhigh|max)$/);
  if (m) return m[1];
  return modelId;
}

function validateLadder(ladder: unknown, label: string): Array<{ code: string; message: string }> {
  const errs: Array<{ code: string; message: string }> = [];
  if (!Array.isArray(ladder)) {
    errs.push({ code: "BLOCKED_INVALID_LADDER", message: `${label} must be array` });
    return errs;
  }
  if (ladder.length < 1) {
    errs.push({ code: "BLOCKED_INVALID_LADDER", message: `${label} must be non-empty` });
    return errs;
  }
  const seen = new Set<string>();
  for (const v of ladder) {
    if (typeof v !== "string" || !VALID_EFFORT_SET.has(v)) {
      errs.push({ code: "BLOCKED_INVALID_LADDER", message: `${label} contains invalid effort ${String(v)}` });
      return errs;
    }
    if (seen.has(v)) {
      errs.push({ code: "BLOCKED_INVALID_LADDER", message: `${label} contains duplicate ${v}` });
      return errs;
    }
    seen.add(v);
  }
  // check strictly ascending
  for (let i = 1; i < ladder.length; i++) {
    const prev = ladder[i - 1] as EffortLevel;
    const cur = ladder[i] as EffortLevel;
    if (EFFORT_ORDER_MAP[prev] >= EFFORT_ORDER_MAP[cur]) {
      errs.push({ code: "BLOCKED_INVALID_LADDER", message: `${label} must be strictly ascending medium<high<xhigh<max` });
      return errs;
    }
  }
  return errs;
}

// Check if pattern A subsumes pattern B (B ⊆ A)
function isSubsumed(earlier: string, later: string): boolean {
  // Use BFS over NFA subsets for glob inclusion
  // Build NFAs
  function epsilonClosure(states: Set<number>, pattern: string): Set<number> {
    const stack = [...states];
    const closure = new Set<number>(states);
    while (stack.length) {
      const s = stack.pop()!;
      if (s < pattern.length && pattern[s] === "*") {
        const nxt = s + 1;
        if (!closure.has(nxt)) {
          closure.add(nxt);
          stack.push(nxt);
        }
      }
    }
    return closure;
  }
  function move(states: Set<number>, pattern: string, ch: string): Set<number> {
    const res = new Set<number>();
    for (const s of states) {
      if (s >= pattern.length) continue;
      const pc = pattern[s];
      if (pc === "*") {
        // * consumes ch and stays
        res.add(s);
      } else if (pc === "?") {
        res.add(s + 1);
      } else if (pc === ch) {
        res.add(s + 1);
      }
    }
    return res;
  }
  const startA = epsilonClosure(new Set([0]), earlier);
  const startB = epsilonClosure(new Set([0]), later);
  // Determine alphabet representatives: literals in both patterns plus a generic char
  const literals = new Set<string>();
  for (const c of earlier) if (c !== "*" && c !== "?") literals.add(c);
  for (const c of later) if (c !== "*" && c !== "?") literals.add(c);
  const alphabet: string[] = [...literals];
  // add a generic char not in literals (if possible) to represent "other"
  // pick a char guaranteed not equal to any literal (use 0x00 surrogate)
  const generic = literals.has("a") ? (literals.has("b") ? "#" : "b") : "a";
  if (!literals.has(generic)) alphabet.push(generic);
  // BFS over pair of subsets
  const encode = (a: Set<number>, b: Set<number>) => `${[...a].sort().join(",")}|${[...b].sort().join(",")}`;
  const visited = new Set<string>();
  const queue: Array<[Set<number>, Set<number>]> = [[startA, startB]];
  visited.add(encode(startA, startB));
  const isAccept = (states: Set<number>, pattern: string) => states.has(pattern.length);
  // quick check: if later empty language? Not possible
  while (queue.length) {
    const [aSet, bSet] = queue.shift()!;
    const bAccept = isAccept(bSet, later);
    const aAccept = isAccept(aSet, earlier);
    if (bAccept && !aAccept) {
      // found witness string where B matches but A doesn't => not subsumed
      return false;
    }
    for (const ch of alphabet) {
      const aMove = move(aSet, earlier, ch);
      const aNext = epsilonClosure(aMove, earlier);
      const bMove = move(bSet, later, ch);
      const bNext = epsilonClosure(bMove, later);
      // If both empty, skip (no continuation)
      if (aNext.size === 0 && bNext.size === 0) continue;
      const key = encode(aNext, bNext);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push([aNext, bNext]);
        if (visited.size > 5000) return false; // safety fallback: assume not subsumed to avoid false positive shadowing
      }
    }
  }
  return true;
}

export function validateEffortPolicies(block: EffortPoliciesBlock | undefined): EffortPolicyValidation {
  const errors: Array<{ code: string; message: string }> = [];
  if (block === undefined) return { ok: true, errors };
  if (block === null || typeof block !== "object") {
    return { ok: false, errors: [{ code: "BLOCKED_CONFIG_ERROR", message: "effortPolicies must be object" }] };
  }
  const b = block as unknown as Record<string, unknown>;
  if (!("default" in b) || b.default == null || typeof b.default !== "object") {
    return { ok: false, errors: [{ code: "BLOCKED_MISSING_DEFAULT", message: "effortPolicies.default is required" }] };
  }
  const def = (b.default as unknown as Record<string, unknown>).automaticEfforts;
  const defErrs = validateLadder(def, "default.automaticEfforts");
  if (defErrs.length) return { ok: false, errors: defErrs };
  const rulesRaw = b.rules;
  if (rulesRaw !== undefined && !Array.isArray(rulesRaw)) {
    return { ok: false, errors: [{ code: "BLOCKED_INVALID_LADDER", message: "effortPolicies.rules must be array" }] };
  }
  const rules: Array<{ match: string; automaticEfforts: EffortLevel[] }> = (rulesRaw ?? []) as typeof rules;
  // validate each rule
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i] as unknown as Record<string, unknown>;
    const match = r.match;
    if (typeof match !== "string" || (match as string).trim().length === 0) {
      errors.push({ code: "BLOCKED_INVALID_GLOB", message: `rules[${i}].match must be non-empty string` });
      continue;
    }
    if (!isValidGlob(match as string)) {
      errors.push({ code: "BLOCKED_INVALID_GLOB", message: `rules[${i}].match is invalid glob` });
      continue;
    }
    const lad = r.automaticEfforts;
    const ladErrs = validateLadder(lad, `rules[${i}].automaticEfforts`);
    if (ladErrs.length) {
      errors.push(...ladErrs);
    }
  }
  if (errors.length) return { ok: false, errors };
  // duplicate and shadowing checks
  const seenMatch = new Map<string, number>();
  for (let i = 0; i < rules.length; i++) {
    const m = rules[i].match;
    if (seenMatch.has(m)) {
      return { ok: false, errors: [{ code: "BLOCKED_DUPLICATE_OR_SHADOWED_RULE", message: `rules[${i}].match duplicate "${m}"` }] };
    }
    seenMatch.set(m, i);
    // check shadowing by any earlier
    for (let j = 0; j < i; j++) {
      const earlier = rules[j].match;
      if (isSubsumed(earlier, m)) {
        return { ok: false, errors: [{ code: "BLOCKED_DUPLICATE_OR_SHADOWED_RULE", message: `rules[${i}].match "${m}" shadowed by earlier "${earlier}"` }] };
      }
    }
  }
  return { ok: true, errors: [] };
}

/** Validate against SPEC §5.1 hard constraints. */
export function validateConfig(cfg: ConfigV1): ConfigValidation {
  const errors: string[] = [];
  if (cfg.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (typeof cfg.enabled !== "boolean") errors.push("enabled must be boolean");

  if (!Number.isInteger(cfg.maxParallelExplorers) || cfg.maxParallelExplorers < 1 || cfg.maxParallelExplorers > 2) {
    errors.push("maxParallelExplorers must be 1..2");
  }
  if (!Number.isInteger(cfg.maxExplorationWaves) || cfg.maxExplorationWaves < 1 || cfg.maxExplorationWaves > 2) {
    errors.push("maxExplorationWaves must be 1..2");
  }
  if (!cfg.capabilities || typeof cfg.capabilities !== "object") {
    errors.push("capabilities must be an object");
  }
  // relativeCostTiers may only carry role names + numeric tiers; never credentials.
  for (const [k, v] of Object.entries(cfg.relativeCostTiers ?? {})) {
    if (typeof v !== "number") errors.push(`relativeCostTiers.${k} must be number`);
    if (/key|secret|token|password|auth|credential/i.test(k)) {
      errors.push(`relativeCostTiers key "${k}" looks like a secret — forbidden`);
    }
  }
  for (const [k, v] of Object.entries(cfg.effortCostTiers ?? {})) {
    if (typeof v !== "number") errors.push(`effortCostTiers.${k} must be number`);
  }
  if (cfg.effortPolicies !== undefined) {
    const ep = validateEffortPolicies(cfg.effortPolicies);
    if (!ep.ok) {
      for (const e of ep.errors) errors.push(`${e.code}: ${e.message}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** First-install default: enabled=false, within legal ranges. */
export function makeInstallConfig(): ConfigV1 {
  return {
    schemaVersion: 1,
    enabled: false,
    maxParallelExplorers: 2,
    maxExplorationWaves: 2,
    capabilities: {
      cheap_worker: "task",
      mechanical: "sonic",
      research: "scout",
      review: "reviewer",
      frontend: "designer",
    },
    relativeCostTiers: {
      current: 2,
      task: 1,
      sonic: 1,
      scout: 1,
      reviewer: 1,
      designer: 2,
    },
    effortCostTiers: { medium: 2, high: 3, xhigh: 4 },
  };
}

export function getEffectivePolicy(
  actualModel: string | null,
  config: ConfigV1,
): { matchedRule: string | null; automaticEfforts: EffortLevel[] | null; source: "rule" | "default" | "builtin-compat" | null } {
  if (config.effortPolicies === undefined) {
    return { matchedRule: "builtin-compat", automaticEfforts: ["medium", "high", "xhigh"], source: "builtin-compat" };
  }
  const validation = validateEffortPolicies(config.effortPolicies);
  if (!validation.ok) {
    return { matchedRule: null, automaticEfforts: null, source: null };
  }
  const canonical = canonicalizeModelId(actualModel);
  if (canonical == null) return { matchedRule: null, automaticEfforts: null, source: null };
  for (const r of config.effortPolicies.rules) {
    if (globMatch(r.match, canonical)) {
      return { matchedRule: r.match, automaticEfforts: r.automaticEfforts, source: "rule" };
    }
  }
  return { matchedRule: "default", automaticEfforts: config.effortPolicies.default.automaticEfforts, source: "default" };
}
