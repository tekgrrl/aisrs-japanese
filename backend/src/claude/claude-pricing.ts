export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

interface ScheduledPricing extends ModelPricing {
  /** ISO date this price took effect. Omit for a price with no scheduled predecessor. */
  effectiveFrom?: string;
}

/**
 * USD per million tokens, source: https://platform.claude.com/docs/en/pricing
 * Entries are newest-first; resolvePricing picks the first one whose
 * effectiveFrom has passed. This lets a known future price change (e.g. an
 * intro-pricing expiry) apply itself automatically without a code change.
 */
const CLAUDE_PRICING_SCHEDULE: Record<string, ScheduledPricing[]> = {
  'claude-fable-5': [{ inputPerMTok: 10, outputPerMTok: 50 }],
  'claude-mythos-5': [{ inputPerMTok: 10, outputPerMTok: 50 }],
  'claude-opus-5': [{ inputPerMTok: 5, outputPerMTok: 25 }],
  'claude-opus-4-8': [{ inputPerMTok: 5, outputPerMTok: 25 }],
  'claude-opus-4-7': [{ inputPerMTok: 5, outputPerMTok: 25 }],
  'claude-opus-4-6': [{ inputPerMTok: 5, outputPerMTok: 25 }],
  'claude-sonnet-5': [
    { effectiveFrom: '2026-09-01', inputPerMTok: 3, outputPerMTok: 15 },
    { effectiveFrom: '2026-05-01', inputPerMTok: 2, outputPerMTok: 10 }, // intro pricing
  ],
  'claude-sonnet-4-6': [{ inputPerMTok: 3, outputPerMTok: 15 }],
  'claude-haiku-4-5': [{ inputPerMTok: 1, outputPerMTok: 5 }],
};

/** Uniform across models per Anthropic's prompt-caching pricing. */
const CACHE_MULTIPLIERS = {
  write5m: 1.25,
  write1h: 2,
  read: 0.1,
} as const;

export function resolvePricing(model: string, at: Date = new Date()): ModelPricing {
  const schedule = CLAUDE_PRICING_SCHEDULE[model];
  if (!schedule) {
    throw new Error(`No pricing entry for Claude model "${model}" — add one to claude-pricing.ts`);
  }
  return schedule.find((entry) => !entry.effectiveFrom || new Date(entry.effectiveFrom) <= at) ?? schedule[schedule.length - 1];
}

export interface ClaudeUsageForCost {
  inputTokens: number;
  outputTokens: number;
  cacheCreation5mTokens?: number;
  cacheCreation1hTokens?: number;
  cacheReadTokens?: number;
}

export interface ClaudeCostBreakdown {
  inputCostUsd: number;
  outputCostUsd: number;
  cacheWriteCostUsd: number;
  cacheReadCostUsd: number;
  totalCostUsd: number;
}

export function computeClaudeCost(model: string, usage: ClaudeUsageForCost): ClaudeCostBreakdown {
  const pricing = resolvePricing(model);
  const perToken = pricing.inputPerMTok / 1_000_000;

  const inputCostUsd = usage.inputTokens * perToken;
  const outputCostUsd = usage.outputTokens * (pricing.outputPerMTok / 1_000_000);
  const cacheWriteCostUsd =
    (usage.cacheCreation5mTokens ?? 0) * perToken * CACHE_MULTIPLIERS.write5m +
    (usage.cacheCreation1hTokens ?? 0) * perToken * CACHE_MULTIPLIERS.write1h;
  const cacheReadCostUsd = (usage.cacheReadTokens ?? 0) * perToken * CACHE_MULTIPLIERS.read;

  return {
    inputCostUsd,
    outputCostUsd,
    cacheWriteCostUsd,
    cacheReadCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd + cacheWriteCostUsd + cacheReadCostUsd,
  };
}
