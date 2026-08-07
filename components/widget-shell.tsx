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
  breakout,
  id,
}: {
  icon?: ReactNode;
  title: string;
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  accent?: boolean;
  breakout?: boolean;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-label={title}
      className={`overflow-hidden rounded-xl border bg-white/[0.03] ${
        accent ? "border-emerald-500/30" : "border-zinc-800"
      } ${breakout ? "" : ""}`}
    >
      <header className="flex h-10 items-center gap-2 border-b border-zinc-800/70 px-3">
        <span className={accent ? "text-emerald-400" : "text-zinc-500"}>{icon}</span>
        <h3 className="text-[13px] font-medium text-zinc-300">{title}</h3>
        <div className="ml-auto flex items-center gap-2">
          {status}
          {actions}
        </div>
      </header>
      <div className="p-4">{children}</div>
      {footer && <footer className="border-t border-zinc-800/70 px-4 py-2">{footer}</footer>}
    </section>
  );
}

export function StatusChip({ tone, children }: { tone: "ok" | "warn" | "info" | "err"; children: ReactNode }) {
  const tones = {
    ok: "border-emerald-500/30 text-emerald-400",
    warn: "border-amber-500/30 text-amber-400",
    info: "border-zinc-700 text-zinc-400",
    err: "border-red-500/40 text-red-400",
  } as const;
  return (
    <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${tones[tone]}`}>{children}</span>
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
      className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
    >
      {children}
    </button>
  );
}
