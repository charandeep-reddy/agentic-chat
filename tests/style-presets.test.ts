import { describe, expect, it } from "vitest";
import { STYLE_PRESETS, isCustom, matchPreset } from "@/lib/style-presets";

const named = STYLE_PRESETS.filter((p) => p.id !== "default");

describe("style presets", () => {
  it("has unique ids and labels", () => {
    expect(new Set(STYLE_PRESETS.map((p) => p.id)).size).toBe(STYLE_PRESETS.length);
    expect(new Set(STYLE_PRESETS.map((p) => p.label)).size).toBe(STYLE_PRESETS.length);
  });

  it("clears the field for the default and fills it for the rest", () => {
    expect(STYLE_PRESETS.find((p) => p.id === "default")?.text).toBe("");
    for (const preset of named) expect(preset.text.trim(), preset.id).not.toBe("");
  });

  it("keeps every preset short enough to sit in the cached prefix", () => {
    // This text goes into the system prompt of every request in every
    // conversation it is used in, so a preset that grew into a manifesto costs
    // real money. Roughly 50 tokens each.
    for (const preset of named) expect(preset.text.length, preset.id).toBeLessThan(220);
  });

  it("stores text that is already trimmed, so it round-trips", () => {
    // matchPreset compares against the trimmed field; a preset with its own
    // leading space would never match itself back.
    for (const preset of STYLE_PRESETS) expect(preset.text, preset.id).toBe(preset.text.trim());
  });
});

describe("matchPreset", () => {
  it("recognises each preset's own text", () => {
    for (const preset of named) expect(matchPreset(preset.text)?.id).toBe(preset.id);
  });

  it("survives the whitespace a save round-trip adds", () => {
    const preset = named[0];
    expect(matchPreset(`\n${preset.text}  `)?.id).toBe(preset.id);
  });

  it("returns null for text the user wrote", () => {
    expect(matchPreset("Answer in limericks.")).toBeNull();
    expect(matchPreset("")).toBeNull();
  });

  it("never matches the default, which would make an empty field look preset", () => {
    expect(matchPreset("")).toBeNull();
    expect(matchPreset("   ")).toBeNull();
  });
});

describe("isCustom", () => {
  it("is false for empty and for a preset", () => {
    expect(isCustom("")).toBe(false);
    expect(isCustom("   ")).toBe(false);
    for (const preset of named) expect(isCustom(preset.text), preset.id).toBe(false);
  });

  it("is true for anything the user typed", () => {
    // This is what decides whether clicking a preset asks before overwriting,
    // so a false negative silently destroys the user's instructions.
    expect(isCustom("Answer in limericks.")).toBe(true);
    expect(isCustom(`${named[0].text} Also use British spelling.`)).toBe(true);
  });
});
