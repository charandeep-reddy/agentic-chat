"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getStorage, setStorage, subscribeStorage } from "@/lib/local-storage";
import {
  applyCustomTokens,
  applySkin,
  applyTheme,
  CUSTOM_THEME_STORAGE,
  isThemePreference,
  isThemeSkin,
  resolveTheme,
  sanitizeThemeSkinSet,
  systemTheme,
  THEME_SKIN_STORAGE,
  THEME_STORAGE,
  type ResolvedTheme,
  type ThemePreference,
  type ThemeSkin,
  type ThemeSkinSet,
} from "@/lib/theme";

type ImportResult = { ok: true } | { ok: false; error: string };

interface ThemeContextValue {
  /** What the user picked, including "system". */
  preference: ThemePreference;
  /** What is painted right now. Widgets that can't read CSS need this one. */
  theme: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
  /** The palette — independent of light/dark, see ThemeSkin. */
  skin: ThemeSkin;
  setSkin: (next: ThemeSkin) => void;
  /** The imported skin, if any. Present even when a different skin is active. */
  customTheme: ThemeSkinSet | null;
  /** Validates and stores `raw` as the custom skin, and switches to it. */
  importTheme: (raw: unknown) => ImportResult;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  theme: "dark",
  setPreference: () => {},
  skin: "default",
  setSkin: () => {},
  customTheme: null,
  importTheme: () => ({ ok: false, error: "not ready" }),
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Starts at the server-safe default and is corrected in the effect below.
  // The document itself is already correct — THEME_INIT_SCRIPT set the
  // attribute before paint — so this catch-up is invisible.
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [theme, setTheme] = useState<ResolvedTheme>("dark");
  const [skin, setSkinState] = useState<ThemeSkin>("default");
  const [customTheme, setCustomTheme] = useState<ThemeSkinSet | null>(null);

  useEffect(() => {
    const read = () => {
      const stored = getStorage(THEME_STORAGE);
      const next = isThemePreference(stored) ? stored : "system";
      setPreferenceState(next);
      const resolved = resolveTheme(next);
      setTheme(resolved);
      applyTheme(resolved);
    };
    read();
    return subscribeStorage(THEME_STORAGE, read);
  }, []);

  useEffect(() => {
    const read = () => {
      const stored = getStorage(THEME_SKIN_STORAGE);
      const next = isThemeSkin(stored) ? stored : "default";
      setSkinState(next);
      applySkin(next);
    };
    read();
    return subscribeStorage(THEME_SKIN_STORAGE, read);
  }, []);

  useEffect(() => {
    const read = () => {
      const raw = getStorage(CUSTOM_THEME_STORAGE);
      if (!raw) return setCustomTheme(null);
      try {
        setCustomTheme(sanitizeThemeSkinSet(JSON.parse(raw)));
      } catch {
        setCustomTheme(null);
      }
    };
    read();
    return subscribeStorage(CUSTOM_THEME_STORAGE, read);
  }, []);

  // The one place tokens are actually painted for the "custom" skin — every
  // other skin's palette lives in globals.css and needs no JS to apply.
  // Re-runs on every input that changes what should be on screen: picking
  // "custom", flipping light/dark, or importing a different skin while
  // already on "custom".
  useEffect(() => {
    applyCustomTokens(skin === "custom" ? customTheme?.[theme] : undefined);
  }, [skin, theme, customTheme]);

  // Only matters while the preference is "system": the OS can flip underneath
  // us, and nothing else would tell us.
  useEffect(() => {
    if (preference !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const resolved = systemTheme();
      setTheme(resolved);
      applyTheme(resolved);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    const resolved = resolveTheme(next);
    setTheme(resolved);
    applyTheme(resolved);
    // Notifies this tab's subscribers and other tabs via the storage event.
    setStorage(THEME_STORAGE, next);
  }, []);

  const setSkin = useCallback((next: ThemeSkin) => {
    setSkinState(next);
    applySkin(next);
    setStorage(THEME_SKIN_STORAGE, next);
  }, []);

  const importTheme = useCallback(
    (raw: unknown): ImportResult => {
      const set = sanitizeThemeSkinSet(raw);
      if (!set) {
        return { ok: false, error: "That file isn't a valid theme — no recognisable colours found." };
      }
      setCustomTheme(set);
      setStorage(CUSTOM_THEME_STORAGE, JSON.stringify(set));
      setSkin("custom");
      return { ok: true };
    },
    [setSkin],
  );

  return (
    <ThemeContext.Provider
      value={{ preference, theme, setPreference, skin, setSkin, customTheme, importTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
