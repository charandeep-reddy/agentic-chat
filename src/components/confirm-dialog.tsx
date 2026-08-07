"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Confirmation for a destructive action. `confirmPhrase` adds a type-to-confirm
 * input — reserve it for actions that take out more than one thing, so deleting
 * a single chat stays one click away rather than a spelling test.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Delete",
  confirmPhrase,
  pending = false,
  pendingLabel = "Deleting…",
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  confirmPhrase?: string;
  pending?: boolean;
  pendingLabel?: string;
  /** `neutral` for a reversible action — signing out isn't data loss. */
  tone?: "danger" | "neutral";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus lands on Cancel, not the destructive button, so a stray Enter or
  // Space right after opening can't confirm the delete.
  useEffect(() => {
    if (!confirmPhrase) cancelRef.current?.focus();
  }, [confirmPhrase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, pending]);

  const ready = !pending && (!confirmPhrase || typed === confirmPhrase);

  // Rendered into <body>, not in place. A transformed or clipping ancestor —
  // the sidebar is both — becomes the containing block for `position: fixed`,
  // which would trap the overlay inside that column instead of the viewport.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70"
        onClick={() => !pending && onCancel()}
        aria-hidden
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-sm rounded-xl border border-border bg-surface-raised p-5 shadow-2xl"
      >
        <h3 className="text-[15px] font-medium text-text">{title}</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-text-muted">{description}</p>

        {confirmPhrase && (
          <>
            <p className="mt-4 text-[12px] text-text-faint">
              Type <span className="font-mono text-text-secondary">{confirmPhrase}</span> to confirm.
            </p>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && ready) onConfirm();
              }}
              autoComplete="off"
              className="mt-1.5 w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 font-mono text-[13px] text-text focus:border-danger focus:outline-none"
            />
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg px-3 py-2 text-[13px] text-text-muted hover:text-text disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={onConfirm}
            className={`rounded-lg px-3.5 py-2 text-[13px] font-medium hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${
              tone === "danger" ? "bg-danger text-bg" : "bg-accent text-accent-text"
            }`}
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
