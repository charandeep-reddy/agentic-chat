"use client";

import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";
import { IconMonitor, IconMoon, IconSun } from "./icons";
import { useTheme } from "./theme-provider";

const OPTIONS: Record<ThemePreference, { label: string; icon: typeof IconSun }> = {
  system: { label: "System", icon: IconMonitor },
  light: { label: "Light", icon: IconSun },
  dark: { label: "Dark", icon: IconMoon },
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
