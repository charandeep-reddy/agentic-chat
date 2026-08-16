import { describe, expect, it } from "vitest";
import {
  CODE_SKIN_PRESETS,
  isCodeSkin,
  looksLikeFullTheme,
  resolveCodeTokens,
  sanitizeCodeSkinSet,
  sanitizeSyntaxTokenMap,
  SYNTAX_TOKEN_KEYS,
} from "@/lib/code-theme";

describe("isCodeSkin", () => {
  it("accepts every declared skin", () => {
    expect(isCodeSkin("auto")).toBe(true);
    expect(isCodeSkin("dracula")).toBe(true);
    expect(isCodeSkin("github")).toBe(true);
    expect(isCodeSkin("custom")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isCodeSkin("solarized-dark")).toBe(false);
    expect(isCodeSkin(undefined)).toBe(false);
    expect(isCodeSkin(42)).toBe(false);
  });
});

describe("sanitizeSyntaxTokenMap", () => {
  it("keeps only the seven syntax tokens with valid colour values", () => {
    const result = sanitizeSyntaxTokenMap({
      "--syntax-comment": "#71717a",
      "--syntax-keyword": "url(evil)",
      "--not-a-syntax-token": "#ffffff",
    });
    expect(result).toEqual({ "--syntax-comment": "#71717a" });
  });

  it("returns null when nothing valid survives", () => {
    expect(sanitizeSyntaxTokenMap({ "--syntax-keyword": "url(evil)" })).toBeNull();
    expect(sanitizeSyntaxTokenMap(null)).toBeNull();
    expect(sanitizeSyntaxTokenMap("not an object")).toBeNull();
  });
});

describe("sanitizeCodeSkinSet", () => {
  it("accepts the light/dark variant shape", () => {
    const result = sanitizeCodeSkinSet({
      name: "My code theme",
      dark: { "--syntax-keyword": "#ff79c6" },
      light: { "--syntax-keyword": "#c2338a" },
    });
    expect(result).toEqual({
      name: "My code theme",
      dark: { "--syntax-keyword": "#ff79c6" },
      light: { "--syntax-keyword": "#c2338a" },
    });
  });

  it("applies a flat token map to both variants", () => {
    const result = sanitizeCodeSkinSet({ "--syntax-keyword": "#ff79c6" });
    expect(result).toEqual({
      name: "Imported",
      light: { "--syntax-keyword": "#ff79c6" },
      dark: { "--syntax-keyword": "#ff79c6" },
    });
  });

  it("keeps whichever variant is valid when the other is missing or empty", () => {
    const result = sanitizeCodeSkinSet({ dark: { "--syntax-keyword": "#ff79c6" } });
    expect(result).toEqual({ name: "Imported", dark: { "--syntax-keyword": "#ff79c6" }, light: undefined });
  });

  it("returns null when nothing valid survives", () => {
    expect(sanitizeCodeSkinSet({ dark: { "--syntax-keyword": "url(evil)" } })).toBeNull();
    expect(sanitizeCodeSkinSet(null)).toBeNull();
    expect(sanitizeCodeSkinSet("not an object")).toBeNull();
  });
});

describe("looksLikeFullTheme", () => {
  it("is false for a code-skin-only file, variant shape or flat", () => {
    expect(looksLikeFullTheme({ name: "Mine", dark: { "--syntax-keyword": "#ff79c6" } })).toBe(false);
    expect(looksLikeFullTheme({ "--syntax-keyword": "#ff79c6" })).toBe(false);
  });

  it("is true when a non-syntax theme token is present, at top level or in a variant", () => {
    expect(looksLikeFullTheme({ "--accent": "#ff79c6", "--syntax-keyword": "#ff79c6" })).toBe(true);
    expect(looksLikeFullTheme({ dark: { "--background": "#111", "--syntax-keyword": "#ff79c6" } })).toBe(
      true,
    );
  });

  it("is false for non-objects", () => {
    expect(looksLikeFullTheme(null)).toBe(false);
    expect(looksLikeFullTheme("not an object")).toBe(false);
  });
});

describe("resolveCodeTokens", () => {
  it("returns undefined for auto, leaving the UI skin's own colours alone", () => {
    expect(resolveCodeTokens("auto", "dark", null)).toBeUndefined();
  });

  it("returns the matching light/dark variant for a built-in preset", () => {
    expect(resolveCodeTokens("dracula", "dark", null)).toEqual(CODE_SKIN_PRESETS.dracula?.dark);
    expect(resolveCodeTokens("github", "light", null)).toEqual(CODE_SKIN_PRESETS.github?.light);
  });

  it("prefers the matching variant of an imported skin, falling back to the other", () => {
    const set = { name: "Mine", dark: { "--syntax-keyword": "#ff0000" } };
    expect(resolveCodeTokens("custom", "dark", set)).toEqual(set.dark);
    expect(resolveCodeTokens("custom", "light", set)).toEqual(set.dark);
    expect(resolveCodeTokens("custom", "dark", null)).toBeUndefined();
  });
});

describe("CODE_SKIN_PRESETS", () => {
  it("defines every syntax token for both variants of every built-in preset", () => {
    for (const [name, preset] of Object.entries(CODE_SKIN_PRESETS)) {
      for (const variant of ["light", "dark"] as const) {
        for (const key of SYNTAX_TOKEN_KEYS) {
          expect(preset?.[variant]?.[key], `${name}.${variant}.${key}`).toBeTruthy();
        }
      }
    }
  });
});
