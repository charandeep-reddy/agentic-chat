import { describe, expect, it } from "vitest";
import { estimateManagedCostCents, MANAGED_PRICED_MODELS } from "@/lib/managed-pricing";

describe("estimateManagedCostCents", () => {
  it("prices a known model from its cents-per-million table", () => {
    // claude-haiku-4-5: 100c/1_000_000 in, 500c/1_000_000 out.
    const cents = estimateManagedCostCents({ input: 1_000_000, output: 1_000_000 }, "claude-haiku-4-5");
    expect(cents).toBe(600);
  });

  it("rounds to the nearest cent rather than accumulating fractional drift", () => {
    const cents = estimateManagedCostCents({ input: 333, output: 0 }, "claude-haiku-4-5");
    // 333 * 100 / 1_000_000 = 0.0333 cents, rounds to 0 — not carried forward
    // as a fraction that would need its own column to track.
    expect(cents).toBe(0);
  });

  it("returns null for a model outside the table rather than treating it as free", () => {
    // Unpriced must block spend-limit enforcement, not silently bypass it —
    // this is the one case the route has to treat as "can't verify, refuse."
    expect(estimateManagedCostCents({ input: 100, output: 100 }, "some-custom-endpoint-model")).toBeNull();
  });

  it("costs nothing for a turn with no usage reported", () => {
    expect(estimateManagedCostCents({}, "claude-opus-5")).toBe(0);
  });

  it("lists every model the table can actually price", () => {
    expect(MANAGED_PRICED_MODELS).toContain("claude-opus-5");
    expect(MANAGED_PRICED_MODELS.length).toBeGreaterThan(0);
  });
});
