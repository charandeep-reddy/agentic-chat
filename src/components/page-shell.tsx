"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useSidebarToggle } from "./app-shell";
import { IconSidebar } from "./icons";

/**
 * Non-chat pages inside the app frame: a titled scroll column instead of a
 * transcript. The sidebar beside it belongs to the layout, so moving between
 * these tabs never rebuilds it.
 */
export function PageShell({
  title,
  description,
  tabs,
  children,
}: {
  title: string;
  description?: string;
  tabs?: Array<{ href: string; label: string; active: boolean }>;
  children: ReactNode;
}) {
  const toggleSidebar = useSidebarToggle();

  return (
    <div className="flex h-dvh min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
          title="Toggle sidebar (⌘B)"
          className="rounded-md p-1.5 text-text-faint hover:bg-surface hover:text-text"
        >
          <IconSidebar size={16} />
        </button>
        <h1 className="text-dense font-medium text-text-secondary">{title}</h1>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <h2 className="text-xl font-semibold tracking-tight text-text">{title}</h2>
          {description && (
            <p className="mt-1.5 text-dense leading-relaxed text-text-muted">{description}</p>
          )}

          {tabs && (
            <nav className="mt-6 flex gap-1 border-b border-border-subtle">
              {tabs.map((tab) => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`-mb-px border-b-2 px-3 py-2 text-dense transition-colors ${
                    tab.active
                      ? "border-accent text-text"
                      : "border-transparent text-text-muted hover:text-text-secondary"
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
          )}

          <div className="mt-8 space-y-8 pb-16">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border-subtle bg-surface/40 p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-ui font-medium text-text">{title}</h3>
          {description && (
            <p className="mt-1 text-dense leading-relaxed text-text-faint">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
