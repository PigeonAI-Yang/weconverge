// Config validation per SPEC §5.1. Pure, no I/O.
import type { ConfigV1 } from "./types";

export interface ConfigValidation {
  ok: boolean;
  errors: string[];
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
