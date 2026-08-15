export const THEME_STORAGE = "agentic-chat.theme";
export const THEME_SKIN_STORAGE = "agentic-chat.theme-skin";
export const CUSTOM_THEME_STORAGE = "agentic-chat.theme-custom";

/** What the user picked. "system" follows the OS and can change without them. */
export type ThemePreference = "system" | "light" | "dark";

/** What is actually painted. Never "system". */
export type ResolvedTheme = "light" | "dark";

/**
 * The palette, independent of light/dark. "custom" is an imported skin (see
 * ThemeSkinSet below) rather than a block in globals.css — everyone else's
 * palette lives in the stylesheet, this one lives in localStorage and is
 * applied as inline style overrides.
 */
export type ThemeSkin = "default" | "claude" | "chatgpt" | "custom";

export const THEME_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

export const THEME_SKINS: ThemeSkin[] = ["default", "claude", "chatgpt", "custom"];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function isThemeSkin(value: unknown): value is ThemeSkin {
  return value === "default" || value === "claude" || value === "chatgpt" || value === "custom";
}

export function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

/**
 * Writes the resolved theme where CSS can see it. Dark is the stylesheet's
 * unqualified default, so the attribute is removed rather than set to "dark" —
 * one source of truth for "no attribute means dark".
 */
export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  if (theme === "light") root.dataset.theme = "light";
  else delete root.dataset.theme;
}

/**
 * Writes the skin where CSS can see it, same "absence means default" shape as
 * applyTheme — "default" is the stylesheet's unqualified palette.
 */
export function applySkin(skin: ThemeSkin): void {
  const root = document.documentElement;
  if (skin === "default") delete root.dataset.skin;
  else root.dataset.skin = skin;
}

/*
 * ---------------------------------------------------------------------------
 * Imported skins.
 *
 * A skin is a set of CSS custom properties — the same names globals.css
 * defines for "claude"/"chatgpt" above, just supplied at runtime instead of
 * baked into the stylesheet. This is the wire format an external theme
 * marketplace targets: export the active tokens here, or import a JSON file
 * shaped like ThemeSkinSet, and the app applies it without a code change.
 * ---------------------------------------------------------------------------
 */

/** Every token an imported skin may set. Anything else in the JSON is dropped. */
export const THEME_TOKEN_KEYS = [
  "--background",
  "--foreground",
  "--bg",
  "--bg-elevated",
  "--surface",
  "--surface-raised",
  "--border-subtle",
  "--border",
  "--border-strong",
  "--text",
  "--text-secondary",
  "--text-muted",
  "--text-faint",
  "--accent",
  "--accent-text",
  "--accent-soft",
  "--accent-glow",
  "--info",
  "--info-soft",
  "--human",
  "--human-soft",
  "--danger",
  "--danger-soft",
  "--warn",
  "--warn-soft",
  "--code-bg",
  "--code-border",
  "--code-text",
  "--link",
  "--syntax-comment",
  "--syntax-keyword",
  "--syntax-string",
  "--syntax-number",
  "--syntax-function",
  "--syntax-name",
  "--syntax-type",
] as const;

export type ThemeTokenKey = (typeof THEME_TOKEN_KEYS)[number];

export type ThemeTokenMap = Partial<Record<ThemeTokenKey, string>>;

export interface ThemeSkinSet {
  name: string;
  light?: ThemeTokenMap;
  dark?: ThemeTokenMap;
}

/**
 * Accepts hex, rgb()/rgba() and hsl()/hsla() only. This is the one pack type
 * whose payload gets injected straight into inline style rather than shown as
 * text, so anything that isn't unambiguously a colour — url(), var()
 * referencing something else, calc(), raw CSS with a trailing `;` — is
 * rejected rather than sanitized, since sanitizing a style value correctly is
 * much harder than recognising a small allow-listed shape.
 */
export function isValidColorValue(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  return /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.]+%?\s*,?\s*[\d.]+%?\s*,?\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)|hsla?\(\s*[\d.]+\s*,?\s*[\d.]+%?\s*,?\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\))$/.test(
    value.trim(),
  );
}

function sanitizeTokenMap(raw: unknown): ThemeTokenMap | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: ThemeTokenMap = {};
  for (const key of THEME_TOKEN_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (isValidColorValue(value)) out[key] = value.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Validates an imported skin. Returns null rather than throwing on anything malformed. */
export function sanitizeThemeSkinSet(raw: unknown): ThemeSkinSet | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim().slice(0, 60) : "Imported";
  const light = sanitizeTokenMap(obj.light);
  const dark = sanitizeTokenMap(obj.dark);
  if (!light && !dark) return null;
  return { name, light, dark };
}

/**
 * Clears any previous inline overrides before applying the next set, so
 * switching away from a custom skin (or importing a new one that no longer
 * sets a token the old one did) can't leave a stale value behind.
 */
export function applyCustomTokens(tokens: ThemeTokenMap | undefined): void {
  const root = document.documentElement.style;
  for (const key of THEME_TOKEN_KEYS) root.removeProperty(key);
  if (!tokens) return;
  for (const key of THEME_TOKEN_KEYS) {
    const value = tokens[key];
    if (value) root.setProperty(key, value);
  }
}

/**
 * Runs before first paint, inlined in <head>. React cannot do this job: the
 * server has no way to know the preference, so the first client render would
 * paint dark and then correct itself — a white page flashing black, or worse.
 * Reading localStorage synchronously here means the very first paint is right.
 *
 * Kept deliberately small and total: any throw (Safari private mode denying
 * localStorage) must leave the document on the default theme, not blank.
 *
 * The custom-skin branch re-validates the stored JSON with the same
 * allow-list/colour-shape rules as sanitizeThemeSkinSet rather than trusting
 * it — localStorage can be edited directly, and this runs before any of the
 * app's own validation code has loaded.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var KEYS=${JSON.stringify(THEME_TOKEN_KEYS)};
var COLOR=/^(#[0-9a-fA-F]{3,8}|rgba?\\([\\d.,%\\s]+\\)|hsla?\\([\\d.,%\\s]+\\))$/;
var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE)});
var light=p==="light"||((!p||p==="system")&&window.matchMedia("(prefers-color-scheme: light)").matches);
if(light)document.documentElement.dataset.theme="light";
var s=localStorage.getItem(${JSON.stringify(THEME_SKIN_STORAGE)});
if(s==="claude"||s==="chatgpt"||s==="custom")document.documentElement.dataset.skin=s;
if(s==="custom"){
var raw=localStorage.getItem(${JSON.stringify(CUSTOM_THEME_STORAGE)});
if(raw){
var set=JSON.parse(raw);
var tokens=light?set.light:set.dark;
if(tokens)for(var i=0;i<KEYS.length;i++){
var v=tokens[KEYS[i]];
if(typeof v==="string"&&v.length<=64&&COLOR.test(v.trim()))
document.documentElement.style.setProperty(KEYS[i],v.trim());
}
}
}
}catch(e){}})();`;
