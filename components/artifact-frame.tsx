"use client";

import type { ReactNode } from "react";

export function ArtifactFrame({
  icon,
  label,
  title,
  meta,
  accent = "accent",
  children,
}: {
  icon: ReactNode;
  label: string;
  title?: string;
  meta?: string;
  accent?: "accent" | "info" | "human";
  children: ReactNode;
}) {
  const accentClass =
    accent === "human"
      ? "text-human bg-human-soft"
      : accent === "info"
        ? "text-info bg-info-soft"
        : "text-accent bg-accent-soft";

  return (
    <div className="artifact animate-fade-up">
      <div className="flex items-center gap-2.5 border-b border-border-subtle px-3.5 py-2.5">
        <span className={`flex h-6 w-6 items-center justify-center rounded-md ${accentClass}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-text-faint">{label}</span>
            {meta && <span className="truncate font-mono text-[10px] text-text-muted">{meta}</span>}
          </div>
          {title && <p className="truncate text-sm font-medium text-text">{title}</p>}
        </div>
      </div>
      <div className="p-3.5">{children}</div>
    </div>
  );
}
