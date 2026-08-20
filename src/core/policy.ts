// Compact before_agent_start policy — pure advisory, ≤60 tokens per parent Provider request.
// Generation-scoped injection event: injected once per sessionId#generation.

export const POLICY_BLOCK = [
  "[WEConverge advisory] Explore with native task when non-converging.",
  "Rules: task(context, tasks:[≤2]) ≤2 probes max per batch; keep child output compact.",
  "Record requested vs expected vs observed vs inferred vs source_gap; never present inferred as observed.",
].join("\n");

/** Deterministic token count: whitespace-split words. Used for acceptance test. */
export function countPolicyTokens(text: string = POLICY_BLOCK): number {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return tokens.length;
}

export const POLICY_TOKEN_BUDGET = 60;
export function isPolicyWithinBudget(): boolean {
  return countPolicyTokens() <= POLICY_TOKEN_BUDGET;
}
