"use client";

import { useMemo } from "react";
import type { UIMessage } from "ai";
import { usePrices } from "./use-prices";
import { estimateCost, formatCost, formatTokens, totalUsage } from "@/lib/usage";
import type { MessageUsage } from "@/lib/usage";

interface TurnMetadata {
  usage?: MessageUsage;
  model?: string;
}

export function messageUsage(message: UIMessage): MessageUsage | undefined {
  return (message.metadata as TurnMetadata | undefined)?.usage;
}

export function messageModel(message: UIMessage): string | undefined {
  return (message.metadata as TurnMetadata | undefined)?.model;
}

/**
 * The running total for the conversation, in the header.
 *
 * Each turn is costed with the model that wrote it rather than the one
 * currently selected, so switching models mid-conversation does not silently
 * re-price the history.
 */
export function ConversationCost({ messages }: { messages: UIMessage[] }) {
  const prices = usePrices();

  const { tokens, cost, priced, unpriced } = useMemo(() => {
    const usages: MessageUsage[] = [];
    let cost = 0;
    const priced = new Set<string>();
    const unpriced = new Set<string>();

    for (const message of messages) {
      const usage = messageUsage(message);
      if (!usage) continue;
      usages.push(usage);

      const model = messageModel(message);
      const amount = model ? estimateCost(usage, prices[model]) : undefined;
      if (amount === undefined) {
        if (model) unpriced.add(model);
        continue;
      }
      cost += amount;
      if (model) priced.add(model);
    }

    return { tokens: totalUsage(usages).total ?? 0, cost, priced, unpriced };
  }, [messages, prices]);

  if (tokens === 0) return null;

  // A total that silently covers only some of the turns would be worse than no
  // total at all, so say when part of the conversation has no price set.
  const partial = priced.size > 0 && unpriced.size > 0;
  const title = [
    `${tokens.toLocaleString()} tokens this conversation`,
    priced.size > 0 ? `Priced: ${[...priced].join(", ")}` : "",
    unpriced.size > 0 ? `No price set: ${[...unpriced].join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <span
      title={title}
      className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border-subtle px-2 py-0.5 font-mono text-micro text-text-faint sm:flex"
    >
      {formatTokens(tokens)} tok
      {priced.size > 0 && (
        <>
          <span className="opacity-40">·</span>
          <span>
            {partial && "≥"}
            {formatCost(cost)}
          </span>
        </>
      )}
    </span>
  );
}
