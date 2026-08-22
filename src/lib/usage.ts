import { z } from "zod";

/**
 * Token usage for one assistant turn.
 *
 * Carried as message metadata rather than a new column: metadata is already
 * persisted verbatim by `saveMessages` and rehydrated into the `UIMessage`, so
 * a turn's usage survives a reload without any schema change, and the client
 * gets it in the same stream that delivered the answer.
 *
 * Every field is optional because usage is whatever the provider chose to
 * report. The endpoint is any OpenAI-compatible server, and plenty return
 * nothing at all.
 */
export const usageSchema = z.object({
  input: z.number().optional(),
  output: z.number().optional(),
  total: z.number().optional(),
  /** Part of `output`, not additional to it. */
  reasoning: z.number().optional(),
  /** Part of `input`. Priced lower by most providers, so worth showing. */
  cached: z.number().optional(),
});

export type MessageUsage = z.infer<typeof usageSchema>;

/** Per-million-token prices, as the user entered them. */
export const priceSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
});

export type ModelPrice = z.infer<typeof priceSchema>;

/** localStorage key holding `{ [modelId]: ModelPrice }`. */
export const PRICES_STORAGE = "agentic-chat.prices";

/**
 * Narrows the SDK's usage object to what is worth storing. Undefined counts
 * are dropped rather than coerced to zero — "the provider didn't say" and
 * "zero tokens" should not render the same.
 */
export function toMessageUsage(usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputTokenDetails?: { cacheReadTokens?: number };
  outputTokenDetails?: { reasoningTokens?: number };
}): MessageUsage | undefined {
  const result: MessageUsage = {
    input: usage.inputTokens,
    output: usage.outputTokens,
    total: usage.totalTokens ?? sum(usage.inputTokens, usage.outputTokens),
    reasoning: usage.outputTokenDetails?.reasoningTokens,
    cached: usage.inputTokenDetails?.cacheReadTokens,
  };

  // Nothing usable came back; store nothing rather than an object of blanks.
  if (result.input === undefined && result.output === undefined && result.total === undefined) {
    return undefined;
  }
  return result;
}

function sum(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

/** Adds up the turns in a conversation. */
export function totalUsage(usages: Array<MessageUsage | undefined>): MessageUsage {
  const total: MessageUsage = {};
  for (const usage of usages) {
    if (!usage) continue;
    for (const key of ["input", "output", "total", "reasoning", "cached"] as const) {
      const value = usage[key];
      if (value === undefined) continue;
      total[key] = (total[key] ?? 0) + value;
    }
  }
  return total;
}

/** `1234` → `1.2k`. Exact below a thousand, where the digits still mean something. */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

/**
 * Cost in the price's own currency, or undefined when this model has no price.
 * There is no price list to consult — the provider is arbitrary — so the number
 * only exists once the user has typed one in.
 */
export function estimateCost(usage: MessageUsage, price: ModelPrice | undefined): number | undefined {
  if (!price) return undefined;
  const input = usage.input ?? 0;
  const output = usage.output ?? 0;
  if (input === 0 && output === 0) return undefined;
  return (input * price.input + output * price.output) / 1_000_000;
}

export interface CostTally {
  cost: number;
  /** Models that carry a price, so `cost` accounts for them. */
  priced: Set<string>;
  /** Models the user has set no price for, so `cost` is missing their spend. */
  unpriced: Set<string>;
}

/**
 * Adds up cost across turns, keeping the models with no price set separate so
 * a caller can say the total is partial rather than quietly under-reporting.
 *
 * A model is `unpriced` when there is no price for it — deliberately not when
 * `estimateCost` returns undefined. Those two are different, and conflating
 * them was a bug in both callers: `estimateCost` also declines when a turn
 * reported no input or output tokens (a provider that sends only `total`),
 * which labelled a model the user *had* priced as "No price set" and invited
 * them to go and set a price that was already there.
 */
export function tallyCost(
  turns: Array<{ model: string | undefined; usage: MessageUsage }>,
  prices: Record<string, ModelPrice | undefined>,
): CostTally {
  let cost = 0;
  const priced = new Set<string>();
  const unpriced = new Set<string>();

  for (const turn of turns) {
    if (!turn.model) continue;
    const price = prices[turn.model];
    if (!price) {
      unpriced.add(turn.model);
      continue;
    }
    cost += estimateCost(turn.usage, price) ?? 0;
    priced.add(turn.model);
  }

  return { cost, priced, unpriced };
}

/** Sub-cent costs are the common case, so the usual two decimals would read $0.00. */
export function formatCost(amount: number): string {
  if (amount === 0) return "$0";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}

export function parsePrices(raw: string): Record<string, ModelPrice> {
  if (!raw) return {};
  try {
    const parsed = z.record(z.string(), priceSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}
