import { describe, expect, it } from "vitest";
import { formatContext } from "@/components/settings-panel";

/**
 * Providers quote context windows in decimal even when the API reports a
 * binary figure, so the label has to match how the model is sold rather than
 * how the number is stored.
 */
describe("formatContext", () => {
  it("calls Gemini's 1048576 tokens 1M, not 1024k", () => {
    // Dividing by 1024 produced "1024k ctx", a unit nobody uses.
    expect(formatContext(1_048_576)).toBe("1M");
  });

  it("keeps the round numbers providers advertise", () => {
    expect(formatContext(200_000)).toBe("200k");
    expect(formatContext(128_000)).toBe("128k");
    expect(formatContext(2_000_000)).toBe("2M");
  });

  it("shows one decimal only when it carries information", () => {
    expect(formatContext(1_500_000)).toBe("1.5M");
    expect(formatContext(1_000_000)).toBe("1M");
  });

  it("stays readable at the small end", () => {
    expect(formatContext(4096)).toBe("4k");
    expect(formatContext(32_768)).toBe("33k");
  });
});
