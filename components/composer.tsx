"use client";

import { useEffect, useRef } from "react";
import { IconArrowUp, IconStop } from "./icons";

export function Composer({
  hasKey,
  busy,
  model,
  onSend,
  onStop,
  onOpenSettings,
}: {
  hasKey: boolean;
  busy: boolean;
  model: string;
  onSend: (text: string) => void;
  onStop: () => void;
  onOpenSettings: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  useEffect(() => {
    resize();
  }, []);

  const submit = () => {
    const value = ref.current?.value ?? "";
    if (!value.trim() || busy || !hasKey) return;
    onSend(value);
    if (ref.current) {
      ref.current.value = "";
      resize();
    }
  };

  return (
    <div className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-4 pt-2 sm:pb-6">
      <div
        className={`rounded-2xl border border-border bg-surface/90 backdrop-blur-xl transition-shadow ${
          busy ? "composer-active" : "shadow-[0_0_0_1px_var(--border),0_8px_32px_-12px_rgba(0,0,0,0.55)]"
        }`}
      >
        <textarea
          ref={ref}
          rows={1}
          placeholder={
            hasKey
              ? "Ask anything — paste data, request a chart, fetch a URL…"
              : "Connect an API key to start chatting"
          }
          disabled={!hasKey}
          onInput={resize}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-40 w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm leading-relaxed text-text placeholder:text-text-faint focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />

        <div className="flex items-center justify-between gap-3 px-3 pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onOpenSettings}
              className="truncate rounded-md border border-border-subtle bg-bg-elevated px-2 py-1 font-mono text-[11px] text-text-muted transition-colors hover:border-border hover:text-text-secondary"
              title="Change model"
            >
              {model}
            </button>
            <span className="hidden text-[11px] text-text-faint sm:inline">
              <kbd className="rounded border border-border-subtle px-1 font-mono text-[10px]">↵</kbd> send
              <span className="mx-1.5 text-border-strong">·</span>
              <kbd className="rounded border border-border-subtle px-1 font-mono text-[10px]">⇧↵</kbd> newline
            </span>
          </div>

          {busy ? (
            <button
              type="button"
              onClick={onStop}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3 text-xs font-medium text-text-secondary transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger"
            >
              <IconStop size={12} />
              Stop
            </button>
          ) : (
            <button
              type="button"
              disabled={!hasKey}
              onClick={submit}
              aria-label="Send message"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-text transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <IconArrowUp size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
