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
import {
  CODE_SKIN_CUSTOM_STORAGE,
  CODE_SKIN_STORAGE,
  isCodeSkin,
  resolveCodeTokens,
  sanitizeCodeSkinSet,
  type CodeSkin,
  type CodeSkinSet,
} from "@/lib/code-theme";

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
  /**
   * The code (syntax highlighting) theme — independent of `skin`. "auto"
   * means the active UI skin's own syntax colours stand, which is the
   * default and what everyone had before this existed.
   */
  codeSkin: CodeSkin;
  setCodeSkin: (next: CodeSkin) => void;
  /** The imported syntax palette, if any. Present even when a preset is active. */
  customCodeSkin: CodeSkinSet | null;
  /** Validates and stores `raw` as the imported code skin, and switches to it. */
  importCodeSkin: (raw: unknown) => ImportResult;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "system",
  theme: "dark",
  setPreference: () => {},
  skin: "default",
  setSkin: () => {},
  customTheme: null,
  importTheme: () => ({ ok: false, error: "not ready" }),
  codeSkin: "auto",
  setCodeSkin: () => {},
  customCodeSkin: null,
  importCodeSkin: () => ({ ok: false, error: "not ready" }),
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Starts at the server-safe default and is corrected in the effect below.
  // The document itself is already correct — THEME_INIT_SCRIPT set the
  // attribute before paint — so this catch-up is invisible.
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [theme, setTheme] = useState<ResolvedTheme>("dark");
  const [skin, setSkinState] = useState<ThemeSkin>("default");
  const [customTheme, setCustomTheme] = useState<ThemeSkinSet | null>(null);
  const [codeSkin, setCodeSkinState] = useState<CodeSkin>("auto");
  const [customCodeSkin, setCustomCodeSkin] = useState<CodeSkinSet | null>(null);

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

  useEffect(() => {
    const read = () => {
      const stored = getStorage(CODE_SKIN_STORAGE);
      setCodeSkinState(isCodeSkin(stored) ? stored : "auto");
    };
    read();
    return subscribeStorage(CODE_SKIN_STORAGE, read);
  }, []);

  useEffect(() => {
    const read = () => {
      const raw = getStorage(CODE_SKIN_CUSTOM_STORAGE);
      if (!raw) return setCustomCodeSkin(null);
      try {
        setCustomCodeSkin(sanitizeCodeSkinSet(JSON.parse(raw)));
      } catch {
        setCustomCodeSkin(null);
      }
    };
    read();
    return subscribeStorage(CODE_SKIN_CUSTOM_STORAGE, read);
  }, []);

  // The one place tokens are actually painted for the "custom" UI skin and/or
  // a code skin — every built-in skin's palette lives in globals.css and
  // needs no JS to apply. Computed as one merged map and applied in one call
  // so the two independently-configurable layers (UI skin, code skin) can't
  // race and clobber each other: applyCustomTokens clears every token before
  // setting the ones it's given, so calling it twice per commit would have
  // the second call erase the first's syntax overrides.
  useEffect(() => {
    const base = skin === "custom" ? customTheme?.[theme] : undefined;
    const code = resolveCodeTokens(codeSkin, theme, customCodeSkin);
    applyCustomTokens(base || code ? { ...base, ...code } : undefined);
  }, [skin, theme, customTheme, codeSkin, customCodeSkin]);

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

  const setCodeSkin = useCallback((next: CodeSkin) => {
    setCodeSkinState(next);
    setStorage(CODE_SKIN_STORAGE, next);
  }, []);

  const importCodeSkin = useCallback(
    (raw: unknown): ImportResult => {
      const set = sanitizeCodeSkinSet(raw);
      if (!set) {
        return { ok: false, error: "That JSON isn't a valid code skin — no recognisable colours found." };
      }
      setCustomCodeSkin(set);
      setStorage(CODE_SKIN_CUSTOM_STORAGE, JSON.stringify(set));
      setCodeSkin("custom");
      return { ok: true };
    },
    [setCodeSkin],
  );

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
      value={{
        preference,
        theme,
        setPreference,
        skin,
        setSkin,
        customTheme,
        importTheme,
        codeSkin,
        setCodeSkin,
        customCodeSkin,
        importCodeSkin,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
