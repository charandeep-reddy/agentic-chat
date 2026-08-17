"use client";

import type { ReactNode, Ref } from "react";

/**
 * The chrome around every fullscreen artifact view — HTML render, flow
 * diagram, expanded quote — extracted because it was identical (backdrop,
 * rounded shell, header, the literal "Close <kbd>esc</kbd>" button markup)
 * in all three. Escape/focus-trap *behavior* was already shared via
 * `useMenu`; only this JSX/styling shell was still copy-pasted.
 *
 * The body stays with each caller rather than being absorbed here too — an
 * iframe wrapper, a pan/zoom scroll container and a markdown column each want
 * different padding and overflow behavior, and forcing one shape on all
 * three would be exactly the premature abstraction this codebase's
 * CLAUDE.md warns against.
 */
export function FullscreenDialog({
  overlayRef,
  icon,
  title,
  actions,
  onClose,
  ariaLabel,
  maxWidthClassName = "max-w-6xl",
  padding = "p-2 sm:p-8",
  children,
}: {
  overlayRef: Ref<HTMLDivElement>;
  icon?: ReactNode;
  /** Omitted for a dialog whose header is just actions + close, e.g. an expanded quote. */
  title?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  ariaLabel: string;
  maxWidthClassName?: string;
  padding?: string;
  children: ReactNode;
}) {
  return (
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm ${padding}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        className={`mx-auto flex h-full w-full ${maxWidthClassName} flex-col overflow-hidden rounded-xl border border-border bg-surface`}
      >
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
          {icon}
          {title && <h3 className="truncate text-dense font-medium text-text">{title}</h3>}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {actions}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-dense text-text-muted hover:bg-surface-raised hover:text-text"
            >
              {/* The button stays; only the key it doubles for goes. */}
              Close <kbd className="ml-1 hidden font-mono text-micro pointer-fine:inline">esc</kbd>
            </button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
