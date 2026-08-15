import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isValidColorValue, sanitizeThemeSkinSet, THEME_TOKEN_KEYS } from "@/lib/theme";

describe("isValidColorValue", () => {
  it("accepts hex, rgb() and hsl()", () => {
    expect(isValidColorValue("#fff")).toBe(true);
    expect(isValidColorValue("#c15f3c")).toBe(true);
    expect(isValidColorValue("#151515ff")).toBe(true);
    expect(isValidColorValue("rgb(21, 21, 21)")).toBe(true);
    expect(isValidColorValue("rgba(255, 255, 255, 0.1)")).toBe(true);
    expect(isValidColorValue("hsl(24, 58%, 54%)")).toBe(true);
  });

  it("rejects anything that isn't unambiguously a colour", () => {
    // The one payload type that gets injected straight into inline style —
    // these are exactly the shapes that would let untrusted JSON do more
    // than set a colour.
    expect(isValidColorValue("url(javascript:alert(1))")).toBe(false);
    expect(isValidColorValue("red; } body { display: none")).toBe(false);
    expect(isValidColorValue("var(--something-else)")).toBe(false);
    expect(isValidColorValue("calc(1px + 2px)")).toBe(false);
    expect(isValidColorValue(123)).toBe(false);
    expect(isValidColorValue(null)).toBe(false);
    expect(isValidColorValue("a".repeat(100))).toBe(false);
  });
});

describe("sanitizeThemeSkinSet", () => {
  it("keeps only known token keys with valid colour values", () => {
    const result = sanitizeThemeSkinSet({
      name: "My Skin",
      dark: {
        "--bg": "#151515",
        "--accent": "#d97757",
        "--not-a-real-token": "#ffffff",
        "--text": "url(evil)",
      },
    });
    expect(result).toEqual({
      name: "My Skin",
      light: undefined,
      dark: { "--bg": "#151515", "--accent": "#d97757" },
    });
  });

  it("defaults an unnamed skin rather than rejecting it", () => {
    const result = sanitizeThemeSkinSet({ light: { "--bg": "#ffffff" } });
    expect(result?.name).toBe("Imported");
  });

  it("rejects a skin with no usable colours in either mode", () => {
    expect(sanitizeThemeSkinSet({ name: "Empty" })).toBeNull();
    expect(sanitizeThemeSkinSet({ dark: { "--bg": "not-a-color" } })).toBeNull();
  });

  it("rejects non-object input", () => {
    expect(sanitizeThemeSkinSet(null)).toBeNull();
    expect(sanitizeThemeSkinSet("just a string")).toBeNull();
    expect(sanitizeThemeSkinSet(42)).toBeNull();
  });
});

describe("examples/*.json", () => {
  // examples/*.json is gitignored — local scratch files for testing the
  // import flow by hand, not shipped in the repo. So this directory is
  // legitimately empty or entirely absent on a fresh clone or in CI, and
  // that must not fail the suite. When files ARE present, each one is still
  // checked for a real regression: a stale sample silently importing with
  // dropped keys after THEME_TOKEN_KEYS changes. Reads the directory rather
  // than naming files, so anything dropped in here is covered automatically.
  const dir = "examples";
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];

  if (files.length === 0) {
    it.skip("no example themes present locally — nothing to check", () => {});
  } else {
    it.each(files)("%s round-trips with every token intact", (file) => {
      const raw = JSON.parse(readFileSync(`${dir}/${file}`, "utf8"));
      const result = sanitizeThemeSkinSet(raw);

      expect(result?.name).toBe(raw.name);
      for (const mode of ["light", "dark"] as const) {
        expect(Object.keys(result?.[mode] ?? {}).sort()).toEqual([...THEME_TOKEN_KEYS].sort());
        expect(result?.[mode]).toEqual(raw[mode]);
      }
    });
  }
});
