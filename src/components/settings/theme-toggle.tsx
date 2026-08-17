"use client";

import { THEME_PREFERENCES, THEME_SKINS, type ThemePreference, type ThemeSkin } from "@/lib/theme";
import { IconMonitor, IconMoon, IconSun } from "../icons";
import { useTheme } from "../theme-provider";

const OPTIONS: Record<ThemePreference, { label: string; icon: typeof IconSun }> = {
  system: { label: "System", icon: IconMonitor },
  light: { label: "Light", icon: IconSun },
  dark: { label: "Dark", icon: IconMoon },
};

const SKIN_LABELS: Record<ThemeSkin, string> = {
  default: "Default",
  claude: "Claude",
  chatgpt: "ChatGPT",
  custom: "Custom",
};

/**
 * Three-way theme switch. "System" is the default and stays a first-class
 * option rather than an implicit starting state — once someone picks light or
 * dark there has to be a way back to following the OS.
 *
 * `compact` drops the labels for tight spots like the sidebar menu.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex gap-1 rounded-lg border border-border-subtle bg-surface p-1"
    >
      {THEME_PREFERENCES.map((option) => {
        const { label, icon: Icon } = OPTIONS[option];
        const active = preference === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            // The label is the only thing naming this control when compact.
            aria-label={label}
            title={label}
            onClick={() => setPreference(option)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-dense transition-colors ${
              active
                ? "bg-surface-raised font-medium text-text"
                : "text-text-muted hover:text-text"
            }`}
          >
            <Icon size={compact ? 15 : 13} />
            {!compact && label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Palette picker — independent of ThemeToggle's light/dark axis. Each skin
 * still resolves against light/dark/system on its own, so switching skins
 * never overrides the choice made above it.
 */
export function ThemeSkinToggle() {
  const { skin, setSkin, customTheme } = useTheme();
  // "Custom" only appears once something has actually been imported — an
  // empty slot in the picker with nothing behind it would just be confusing.
  const options = THEME_SKINS.filter((s) => s !== "custom" || customTheme !== null);

  return (
    <div
      role="radiogroup"
      aria-label="Theme style"
      className="flex gap-1 rounded-lg border border-border-subtle bg-surface p-1"
    >
      {options.map((option) => {
        const active = skin === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setSkin(option)}
            className={`flex-1 rounded-md py-1.5 text-dense transition-colors ${
              active
                ? "bg-surface-raised font-medium text-text"
                : "text-text-muted hover:text-text"
            }`}
          >
            {SKIN_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
