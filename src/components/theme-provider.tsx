"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getStorage, setStorage, subscribeStorage } from "@/lib/local-storage";
import {
  applyTheme,
  isThemePreference,
  resolveTheme,
  systemTheme,
  THEME_STORAGE,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

interface ThemeContextValue {
  /** What the user picked, including "system". */
  preference: ThemePreference;
  /** What is painted right now. Widgets that can't read CSS need this one. */
  theme: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  theme: "dark",
  setPreference: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Starts at the server-safe default and is corrected in the effect below.
  // The document itself is already correct — THEME_INIT_SCRIPT set the
  // attribute before paint — so this catch-up is invisible.
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [theme, setTheme] = useState<ResolvedTheme>("dark");

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

  return (
    <ThemeContext.Provider value={{ preference, theme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
