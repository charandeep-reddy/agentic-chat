import { isValidColorValue, THEME_STORAGE, THEME_TOKEN_KEYS, type ThemeTokenKey } from "./theme";

export const CODE_SKIN_STORAGE = "agentic-chat.code-skin";
export const CODE_SKIN_CUSTOM_STORAGE = "agentic-chat.code-skin-custom";

/**
 * The seven tokens `rehype-highlight`'s token groups are mapped to in
 * globals.css. A subset of THEME_TOKEN_KEYS, declared with `satisfies` so a
 * rename over there is caught here rather than silently drifting.
 */
export const SYNTAX_TOKEN_KEYS = [
  "--syntax-comment",
  "--syntax-keyword",
  "--syntax-string",
  "--syntax-number",
  "--syntax-function",
  "--syntax-name",
  "--syntax-type",
] as const satisfies readonly ThemeTokenKey[];

export type SyntaxTokenKey = (typeof SYNTAX_TOKEN_KEYS)[number];
export type SyntaxTokenMap = Partial<Record<SyntaxTokenKey, string>>;

/**
 * "auto" follows whatever the active UI skin already sets in globals.css —
 * today's behaviour, and the default. "custom" is an imported palette, same
 * shape as the full theme import elsewhere. Everything else overrides just
 * the seven syntax tokens, independent of the UI skin underneath.
 */
export type CodeSkin = "auto" | "dracula" | "github" | "custom";

export const CODE_SKINS: CodeSkin[] = ["auto", "dracula", "github", "custom"];

export function isCodeSkin(value: unknown): value is CodeSkin {
  return typeof value === "string" && (CODE_SKINS as string[]).includes(value);
}

/**
 * Built-in presets. Each carries its own light and dark variant rather than
 * reusing one set of colours for both — Dracula was designed against a dark
 * ground, and reusing its dark colours on a light background reads as
 * low-contrast rather than faithful.
 */
export const CODE_SKIN_PRESETS: Partial<Record<CodeSkin, { light: SyntaxTokenMap; dark: SyntaxTokenMap }>> = {
  dracula: {
    dark: {
      "--syntax-comment": "#6272a4",
      "--syntax-keyword": "#ff79c6",
      "--syntax-string": "#f1fa8c",
      "--syntax-number": "#bd93f9",
      "--syntax-function": "#50fa7b",
      "--syntax-name": "#8be9fd",
      "--syntax-type": "#ffb86c",
    },
    light: {
      "--syntax-comment": "#8890a8",
      "--syntax-keyword": "#c2338a",
      "--syntax-string": "#8a7a12",
      "--syntax-number": "#7c4fc9",
      "--syntax-function": "#1f9e4f",
      "--syntax-name": "#1096ab",
      "--syntax-type": "#b8650f",
    },
  },
  github: {
    light: {
      "--syntax-comment": "#6a737d",
      "--syntax-keyword": "#d73a49",
      "--syntax-string": "#032f62",
      "--syntax-number": "#005cc5",
      "--syntax-function": "#6f42c1",
      "--syntax-name": "#22863a",
      "--syntax-type": "#e36209",
    },
    dark: {
      "--syntax-comment": "#8b949e",
      "--syntax-keyword": "#ff7b72",
      "--syntax-string": "#a5d6ff",
      "--syntax-number": "#79c0ff",
      "--syntax-function": "#d2a8ff",
      "--syntax-name": "#7ee787",
      "--syntax-type": "#ffa657",
    },
  },
};

/** Display names for the picker buttons. */
export const CODE_SKIN_LABELS: Record<CodeSkin, string> = {
  auto: "Auto",
  dracula: "Dracula",
  github: "GitHub",
  custom: "Imported",
};

/**
 * An imported syntax palette — the code-only counterpart of ThemeSkinSet in
 * theme.ts, restricted to just the seven syntax tokens. Either variant may
 * be omitted; resolveCodeTokens below falls back to whichever one exists.
 */
export interface CodeSkinSet {
  name: string;
  light?: SyntaxTokenMap;
  dark?: SyntaxTokenMap;
}

/**
 * Validates a syntax palette read from localStorage or pasted JSON. Reuses
 * THEME_TOKEN_KEYS' colour-shape check (hex/rgb/hsl only) rather than a
 * second definition of "valid colour" — same reasoning as sanitizeTokenMap
 * in theme.ts.
 */
export function sanitizeSyntaxTokenMap(raw: unknown): SyntaxTokenMap | null {
  if (!raw || typeof raw !== "object") return null;
  const out: SyntaxTokenMap = {};
  for (const key of SYNTAX_TOKEN_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (isValidColorValue(value)) out[key] = value.trim();
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Validates an imported code skin. Accepts either `{ light, dark }` (mirrors
 * a full theme export) or a flat token map applied as both — pasting just
 * the seven colours without thinking about light/dark should still work.
 * Returns null rather than throwing on anything malformed.
 */
export function sanitizeCodeSkinSet(raw: unknown): CodeSkinSet | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim().slice(0, 60) : "Imported";

  const hasVariantShape = "light" in obj || "dark" in obj;
  const light = sanitizeSyntaxTokenMap(hasVariantShape ? obj.light : obj);
  const dark = sanitizeSyntaxTokenMap(hasVariantShape ? obj.dark : obj);
  if (!light && !dark) return null;
  return { name, light: light ?? undefined, dark: dark ?? undefined };
}

const NON_SYNTAX_THEME_KEYS = new Set<ThemeTokenKey>(
  THEME_TOKEN_KEYS.filter((key) => !(SYNTAX_TOKEN_KEYS as readonly string[]).includes(key)),
);

/**
 * True when the parsed input carries theme tokens beyond the seven syntax
 * ones — i.e. it looks like a full ThemeSkinSet export rather than a
 * code-skin-only file. `sanitizeCodeSkinSet` already ignores those extra
 * keys silently; this exists only so the import toast can say so, instead
 * of reporting success identically either way.
 */
export function looksLikeFullTheme(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;
  const buckets = [obj, obj.light, obj.dark].filter(
    (b): b is Record<string, unknown> => !!b && typeof b === "object",
  );
  return buckets.some((b) => Object.keys(b).some((k) => NON_SYNTAX_THEME_KEYS.has(k as ThemeTokenKey)));
}

/**
 * The syntax tokens that should be on screen right now, or undefined if
 * "auto" — meaning the active UI skin's own globals.css values should stand,
 * untouched. `custom` prefers the matching variant and falls back to the
 * other one if only one was imported.
 */
export function resolveCodeTokens(
  skin: CodeSkin,
  theme: "light" | "dark",
  custom: CodeSkinSet | null,
): SyntaxTokenMap | undefined {
  if (skin === "auto") return undefined;
  if (skin === "custom") return custom?.[theme] ?? custom?.light ?? custom?.dark;
  return CODE_SKIN_PRESETS[skin]?.[theme];
}

/**
 * Runs before first paint, same reasoning as THEME_INIT_SCRIPT in theme.ts —
 * a code skin applied only after hydration would flash the UI skin's own
 * syntax colours first. Kept as its own script rather than folded into
 * THEME_INIT_SCRIPT to avoid a circular import (this module already imports
 * from theme.ts for colour validation); it re-derives light/dark the same
 * small way that script does, and both are inlined in layout.tsx.
 *
 * Presets are baked into this string via JSON.stringify — there's no way to
 * import CODE_SKIN_PRESETS into a `<head>` script otherwise — so it only
 * needs to look them up by name, not redefine them.
 */
export const CODE_SKIN_INIT_SCRIPT = `(function(){try{
var PRESETS=${JSON.stringify(CODE_SKIN_PRESETS)};
var KEYS=${JSON.stringify(SYNTAX_TOKEN_KEYS)};
var COLOR=/^(#[0-9a-fA-F]{3,8}|rgba?\\([\\d.,%\\s]+\\)|hsla?\\([\\d.,%\\s]+\\))$/;
var p=localStorage.getItem(${JSON.stringify(CODE_SKIN_STORAGE)});
if(p&&p!=="auto"){
var lightPref=localStorage.getItem(${JSON.stringify(THEME_STORAGE)});
var light=lightPref==="light"||((!lightPref||lightPref==="system")&&window.matchMedia("(prefers-color-scheme: light)").matches);
var tokens;
if(p==="custom"){
var set=JSON.parse(localStorage.getItem(${JSON.stringify(CODE_SKIN_CUSTOM_STORAGE)})||"null");
tokens=set&&(light?(set.light||set.dark):(set.dark||set.light));
}else{
tokens=PRESETS[p]&&PRESETS[p][light?"light":"dark"];
}
if(tokens)for(var i=0;i<KEYS.length;i++){
var v=tokens[KEYS[i]];
if(typeof v==="string"&&v.length<=64&&COLOR.test(v.trim()))
document.documentElement.style.setProperty(KEYS[i],v.trim());
}
}
}catch(e){}})();`;
