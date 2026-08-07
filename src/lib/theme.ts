export const THEME_STORAGE = "agentic-chat.theme";

/** What the user picked. "system" follows the OS and can change without them. */
export type ThemePreference = "system" | "light" | "dark";

/** What is actually painted. Never "system". */
export type ResolvedTheme = "light" | "dark";

export const THEME_PREFERENCES: ThemePreference[] = ["system", "light", "dark"];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
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
 * Runs before first paint, inlined in <head>. React cannot do this job: the
 * server has no way to know the preference, so the first client render would
 * paint dark and then correct itself — a white page flashing black, or worse.
 * Reading localStorage synchronously here means the very first paint is right.
 *
 * Kept deliberately small and total: any throw (Safari private mode denying
 * localStorage) must leave the document on the default theme, not blank.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE)});
var l=p==="light"||((!p||p==="system")&&window.matchMedia("(prefers-color-scheme: light)").matches);
if(l)document.documentElement.dataset.theme="light";
}catch(e){}})();`;
