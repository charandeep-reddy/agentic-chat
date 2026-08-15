import type { MessageUsage } from "@/lib/usage";

/**
 * A server-side, canonical price table — used only for spend-limit
 * enforcement in managed mode (`ORG_MANAGED_KEYS=true`).
 *
 * This is deliberately separate from `lib/usage.ts`'s `ModelPrice`: that
 * table is user-entered and lives in the client's `localStorage` — fine for
 * a personal cost *estimate* the user can freely edit, useless (worse than
 * useless — spoofable) as the number a spend cap is actually enforced
 * against. An employee who could edit their own price table could edit
 * their own limit right out from under it.
 *
 * Cents per million tokens, matching `estimateCost`'s per-million-token
 * convention in `usage.ts` but in integer cents rather than fractional
 * dollars — spend tracking sums into an integer `spentCentsThisPeriod`
 * column, and floating-point dollars drifting over thousands of turns is
 * the kind of bug that's invisible until an employee's "at my limit" is
 * quietly wrong by a few cents in one direction or the other.
 *
 * Verified against each provider's own pricing page (2026-08-15) rather than
 * estimated — an enforcement table is the one place in this app where a
 * plausible-looking guess is actually dangerous, since it silently caps (or
 * fails to cap) real spend:
 *   - Claude: https://platform.claude.com/docs/en/about-claude/pricing
 *   - GPT: https://developers.openai.com/api/docs/pricing
 *   - Gemini: https://ai.google.dev/gemini-api/docs/pricing
 *     (its flash-tier rate is time-limited: doubles 2027-01-01 — this table
 *     needs a manual revisit before then, there's no way to fetch it live)
 * Prices move. Nothing here re-checks itself — an admin relying on this for
 * a real deployment should confirm current rates before trusting it.
 */
const MANAGED_PRICES_CENTS_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 500, output: 2_500 },
  "claude-sonnet-5": { input: 200, output: 1_000 },
  "claude-haiku-4-5": { input: 100, output: 500 },
  "gpt-5.4": { input: 250, output: 1_500 },
  "gemini-3.6-flash": { input: 75, output: 375 },
};

/**
 * Cost of one turn in integer cents, or `null` when the model isn't in the
 * table above. `null` is not "free" — the route treats it as "cost can't be
 * verified" and blocks rather than silently letting an unpriced model (most
 * likely a `custom`-provider model an admin hasn't accounted for) bypass the
 * cap entirely.
 */
export function estimateManagedCostCents(usage: MessageUsage, model: string): number | null {
  const price = MANAGED_PRICES_CENTS_PER_MILLION[model];
  if (!price) return null;
  const input = usage.input ?? 0;
  const output = usage.output ?? 0;
  if (input === 0 && output === 0) return 0;
  return Math.round((input * price.input + output * price.output) / 1_000_000);
}

/** Every model this table can price — surfaced so an admin panel can tell them apart from unpriced ones. */
export const MANAGED_PRICED_MODELS = Object.keys(MANAGED_PRICES_CENTS_PER_MILLION);
