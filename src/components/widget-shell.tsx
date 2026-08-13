"use client";

import type { ReactNode } from "react";

export function WidgetShell({
  icon,
  title,
  status,
  actions,
  children,
  footer,
  accent,
  id,
}: {
  icon?: ReactNode;
  title: string;
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  accent?: boolean;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-label={title}
      className={`animate-fade-up overflow-hidden rounded-xl border bg-surface/70 ${
        accent ? "border-accent/30" : "border-border"
      }`}
    >
      <header className="flex h-10 items-center gap-2 border-b border-border-subtle px-3">
        <span className={accent ? "text-accent" : "text-text-faint"}>{icon}</span>
        <h3 className="truncate text-dense font-medium text-text-secondary">{title}</h3>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {status}
          {actions}
        </div>
      </header>
      <div className="p-3.5">{children}</div>
      {footer && <footer className="border-t border-border-subtle px-3.5 py-2">{footer}</footer>}
    </section>
  );
}

export function StatusChip({ tone, children }: { tone: "ok" | "warn" | "info" | "err"; children: ReactNode }) {
  const tones = {
    ok: "border-accent/30 text-accent",
    warn: "border-warn/30 text-warn",
    info: "border-border-strong text-text-muted",
    err: "border-danger/40 text-danger",
  } as const;
  return (
    <span className={`mr-1 rounded-full border px-2 py-0.5 font-mono text-micro ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function WidgetAction({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-md p-1.5 text-text-faint transition-colors hover:bg-surface-raised hover:text-text"
    >
      {children}
    </button>
  );
}
