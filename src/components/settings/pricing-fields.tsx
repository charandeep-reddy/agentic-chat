"use client";

import { useEffect, useState } from "react";
import { setPrice, usePrices } from "../use-prices";
import { formatCost, tallyCost } from "@/lib/usage";
import type { ModelUsageRollup } from "@/lib/db/queries/usage";

export function CumulativeSpend() {
  const prices = usePrices();
  const [usage, setUsage] = useState<ModelUsageRollup[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/usage")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setUsage(data.usage);
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, []);

  if (!usage) return null;

  // Same honest caveat as `ConversationCost`, and now the same tally behind it:
  // a total that silently covers only the priced models would look complete
  // while under-reporting, so say when part of it is missing instead of just
  // dropping those models.
  const { cost: totalCost, unpriced } = tallyCost(
    usage.map((row) => ({ model: row.model, usage: row })),
    prices,
  );

  if (totalCost === 0 && unpriced.size === 0) return null;

  return (
    <div className="mt-6 rounded-lg border border-border-subtle bg-surface-raised p-4">
      <h3 className="mb-1 text-dense font-medium text-text">Cumulative Spend</h3>
      <div className="text-dense text-text-secondary">
        {totalCost > 0 ? formatCost(totalCost) : "$0"} estimated across all conversations
        {unpriced.size > 0 && ` (+ spend from ${unpriced.size} model${unpriced.size === 1 ? "" : "s"} without a price)`}
        .
      </div>
    </div>
  );
}

/**
 * Per-million-token prices for the selected model.
 *
 * Typed in by hand because there is nothing to look them up from: the provider
 * is any OpenAI-compatible endpoint, and none of them publish a machine-readable
 * price list. Without a price the app still shows token counts — it just does
 * not pretend to know what they cost.
 */
export function PriceFields({ model }: { model: string }) {
  const prices = usePrices();
  const price = prices[model];

  const update = (field: "input" | "output", raw: string) => {
    const value = raw.trim() === "" ? NaN : Number(raw);
    const next = {
      input: price?.input ?? 0,
      output: price?.output ?? 0,
      [field]: Number.isFinite(value) && value >= 0 ? value : 0,
    };
    // Both back to zero means "no price", not "free" — drop the entry so the
    // cost estimate disappears instead of reading $0.
    setPrice(model, next.input === 0 && next.output === 0 ? null : next);
  };

  return (
    <div className="mt-6">
      <h3 className="mb-1.5 text-dense font-medium text-text-secondary">
        Price per 1M tokens
      </h3>
      <div className="flex gap-2">
        {(
          [
            { field: "input" as const, label: "Input" },
            { field: "output" as const, label: "Output" },
          ]
        ).map(({ field, label }) => (
          <label key={field} className="min-w-0 flex-1">
            <span className="mb-1 block text-micro text-text-faint">{label}</span>
            <div className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-3 py-2 focus-within:border-accent">
              <span className="text-dense text-text-faint">$</span>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={price?.[field] ?? ""}
                onChange={(e) => update(field, e.target.value)}
                placeholder="0.00"
                className="min-w-0 flex-1 bg-transparent font-mono text-dense text-text placeholder:text-text-faint focus:outline-none"
              />
            </div>
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-micro leading-relaxed text-text-faint">
        Optional, and only for <span className="font-mono">{model}</span>. Stored in this browser;
        token counts show either way.
      </p>
    </div>
  );
}
