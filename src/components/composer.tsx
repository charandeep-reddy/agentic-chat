"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { getStorage, removeStorage, setStorage } from "@/lib/local-storage";
import { IconArrowUp, IconStop } from "./icons";

const MAX_HEIGHT = 200;
const DRAFT_SAVE_DELAY = 250;

const draftKey = (chatId: string) => `composer:draft:${chatId}`;

export function Composer({
  ref,
  chatId,
  hasKey,
  busy,
  blocked,
  model,
  onSend,
  onStop,
  onOpenSettings,
}: {
  ref?: Ref<HTMLTextAreaElement>;
  /** Unsent text is kept per chat, so switching chats and back restores it. */
  chatId: string;
  hasKey: boolean;
  busy: boolean;
  blocked: boolean;
  model: string;
  onSend: (text: string) => void;
  onStop: () => void;
  onOpenSettings: () => void;
}) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement, []);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resize = () => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  };

  // Chat remounts the composer per chat id, so this runs once per chat and
  // restores whatever was left unsent last time it was open.
  useEffect(() => {
    if (inner.current) inner.current.value = getStorage(draftKey(chatId));
    resize();
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [chatId]);

  const disabled = !hasKey || blocked;

  const saveDraft = () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      const value = inner.current?.value ?? "";
      if (value) setStorage(draftKey(chatId), value);
      else removeStorage(draftKey(chatId));
    }, DRAFT_SAVE_DELAY);
  };

  const submit = () => {
    const value = inner.current?.value ?? "";
    if (!value.trim() || busy || disabled) return;
    onSend(value);
    if (inner.current) {
      inner.current.value = "";
      resize();
    }
    if (draftTimer.current) clearTimeout(draftTimer.current);
    removeStorage(draftKey(chatId));
  };

  const placeholder = blocked
    ? "Pick an option above to continue"
    : hasKey
      ? "Ask anything — paste data, request a chart, build a UI…"
      : "Connect an API key to start chatting";

  return (
    <div className="relative z-10 mx-auto w-full max-w-3xl shrink-0 px-4 pb-4 pt-2 sm:pb-6">
      <div
        className={`rounded-2xl border border-border bg-surface/90 backdrop-blur-xl transition-shadow ${
          busy ? "composer-active" : "shadow-[0_8px_32px_-12px_rgba(0,0,0,0.55)]"
        }`}
      >
        <textarea
          ref={inner}
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          onInput={() => {
            resize();
            saveDraft();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="scroll-thin w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-sm leading-relaxed text-text placeholder:text-text-faint focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />

        <div className="flex items-center justify-between gap-3 px-3 pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onOpenSettings}
              title="Change model"
              className="truncate rounded-md border border-border-subtle bg-bg-elevated px-2 py-1 font-mono text-[11px] text-text-muted transition-colors hover:border-border hover:text-text-secondary"
            >
              {model}
            </button>
            <span className="hidden text-[11px] text-text-faint sm:inline">
              <kbd className="rounded border border-border-subtle px-1 font-mono text-[10px]">↵</kbd>{" "}
              send
              <span className="mx-1.5 opacity-50">·</span>
              <kbd className="rounded border border-border-subtle px-1 font-mono text-[10px]">
                ⇧↵
              </kbd>{" "}
              newline
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
              disabled={disabled}
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
