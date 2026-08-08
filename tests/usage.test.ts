import { describe, expect, it } from "vitest";
import {
  estimateCost,
  formatCost,
  formatTokens,
  parsePrices,
  toMessageUsage,
  totalUsage,
} from "@/lib/usage";

describe("toMessageUsage", () => {
  it("keeps the counts worth showing", () => {
    const usage = toMessageUsage({
      inputTokens: 1200,
      outputTokens: 300,
      totalTokens: 1500,
      inputTokenDetails: { cacheReadTokens: 900 },
      outputTokenDetails: { reasoningTokens: 120 },
    });

    expect(usage).toEqual({ input: 1200, output: 300, total: 1500, cached: 900, reasoning: 120 });
  });

  it("derives a total the provider left out", () => {
    expect(toMessageUsage({ inputTokens: 100, outputTokens: 40 })?.total).toBe(140);
  });

  it("returns nothing when the provider reported nothing", () => {
    // Plenty of OpenAI-compatible endpoints send no usage at all; storing an
    // object of blanks would render as "0 tok", which is a lie.
    expect(toMessageUsage({})).toBeUndefined();
  });

  it("distinguishes an absent count from a zero one", () => {
    const usage = toMessageUsage({ inputTokens: 10, outputTokens: 0 });
    expect(usage?.output).toBe(0);
    expect(usage?.reasoning).toBeUndefined();
  });
});

describe("totalUsage", () => {
  it("adds the turns up and ignores the ones with no usage", () => {
    const total = totalUsage([
      { input: 100, output: 20, total: 120 },
      undefined,
      { input: 50, output: 10, total: 60, reasoning: 4 },
    ]);

    expect(total).toEqual({ input: 150, output: 30, total: 180, reasoning: 4 });
  });

  it("is empty for a conversation with no reported usage", () => {
    expect(totalUsage([undefined, undefined])).toEqual({});
  });
});

describe("estimateCost", () => {
  it("prices input and output separately, per million", () => {
    const cost = estimateCost({ input: 1_000_000, output: 1_000_000 }, { input: 3, output: 15 });
    expect(cost).toBe(18);
  });

  it("returns nothing when the model has no price, rather than zero", () => {
    expect(estimateCost({ input: 100, output: 10 }, undefined)).toBeUndefined();
  });

  it("returns nothing when there were no tokens to price", () => {
    expect(estimateCost({ total: 0 }, { input: 3, output: 15 })).toBeUndefined();
  });
});

describe("formatTokens", () => {
  it("stays exact below a thousand, where the digits mean something", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
  });

  it("abbreviates above that", () => {
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(48_000)).toBe("48k");
    expect(formatTokens(2_400_000)).toBe("2.4M");
  });
});

describe("formatCost", () => {
  it("keeps sub-cent amounts legible instead of rounding them to $0.00", () => {
    expect(formatCost(0.00042)).toBe("$0.0004");
    expect(formatCost(0.031)).toBe("$0.031");
    expect(formatCost(12.5)).toBe("$12.50");
  });
});

describe("parsePrices", () => {
  it("reads a stored map", () => {
    const prices = parsePrices('{"gpt-x":{"input":3,"output":15}}');
    expect(prices["gpt-x"]).toEqual({ input: 3, output: 15 });
  });

  it("survives junk in localStorage rather than throwing on render", () => {
    expect(parsePrices("not json")).toEqual({});
    expect(parsePrices('{"gpt-x":{"input":"free"}}')).toEqual({});
    expect(parsePrices("")).toEqual({});
  });
});
