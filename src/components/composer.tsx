"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { getStorage, removeStorage, setStorage } from "@/lib/local-storage";
import { formatDocumentBlock, type AttachmentSummary } from "@/lib/document";
import { useSendKeyPreference } from "./use-send-key";
import { IconArrowUp, IconClose, IconIncognito, IconLoader, IconPaperclip, IconStop } from "./icons";

const MAX_HEIGHT = 200;
const DRAFT_SAVE_DELAY = 250;

const draftKey = (chatId: string) => `composer:draft:${chatId}`;

/**
 * A PDF attached in the composer. Extraction happens the moment the file is
 * picked, not on send — so the text is ready (or the error is visible)
 * before the user commits to sending, and a slow extraction doesn't stall
 * the message itself.
 */
interface Attachment {
  id: string;
  name: string;
  status: "extracting" | "ready" | "error";
  block?: string;
  pageCount?: number;
  hasUncapturedImages?: boolean;
  error?: string;
}

export function Composer({
  ref,
  chatId,
  ephemeral = false,
  hasKey,
  busy,
  questionPending,
  model,
  onSend,
  onStop,
  onOpenSettings,
}: {
  ref?: Ref<HTMLTextAreaElement>;
  /** Unsent text is kept per chat, so switching chats and back restores it. */
  chatId: string;
  /**
   * A private chat keeps no draft. Persisting one to localStorage would leave
   * behind exactly the text the mode exists to not leave behind.
   */
  ephemeral?: boolean;
  hasKey: boolean;
  busy: boolean;
  questionPending: boolean;
  model: string;
  /**
   * `text` is the full string sent to the model, attachment blocks and all.
   * `attachment` info is display-only — no extracted text — so the transcript
   * can show a chip and just what was typed, instead of dumping the whole
   * document into the bubble.
   */
  onSend: (text: string, attachments?: { summaries: AttachmentSummary[]; typed: string }) => void;
  onStop: () => void;
  onOpenSettings: () => void;
}) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement, []);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendKey = useSendKeyPreference();
  const fileInput = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const resize = () => {
    const el = inner.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  };

  // Chat remounts the composer per chat id, so this runs once per chat and
  // restores whatever was left unsent last time it was open.
  useEffect(() => {
    if (inner.current && !ephemeral) inner.current.value = getStorage(draftKey(chatId));
    resize();
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [chatId, ephemeral]);

  const disabled = !hasKey;

  const saveDraft = () => {
    if (ephemeral) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      const value = inner.current?.value ?? "";
      if (value) setStorage(draftKey(chatId), value);
      else removeStorage(draftKey(chatId));
    }, DRAFT_SAVE_DELAY);
  };

  const extracting = attachments.some((a) => a.status === "extracting");

  const attachFile = async (file: File) => {
    const id = `${Date.now()}-${file.name}`;
    setAttachments((prev) => [...prev, { id, name: file.name, status: "extracting" }]);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/documents/extract", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not read this PDF.");
      const block = formatDocumentBlock(data.name, data);
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...a,
                status: "ready",
                block,
                pageCount: data.pageCount,
                hasUncapturedImages: data.hasUncapturedImages,
              }
            : a,
        ),
      );
    } catch (err) {
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, status: "error", error: err instanceof Error ? err.message : "Extraction failed." }
            : a,
        ),
      );
    }
  };

  const submit = () => {
    const value = inner.current?.value ?? "";
    const ready = attachments.filter((a) => a.status === "ready");
    if ((!value.trim() && ready.length === 0) || busy || disabled || extracting) return;
    const text = [...ready.map((a) => a.block as string), value].filter((part) => part.trim()).join("\n\n");
    const summaries: AttachmentSummary[] = ready.map((a) => ({
      name: a.name,
      pageCount: a.pageCount ?? 0,
      hasUncapturedImages: a.hasUncapturedImages ?? false,
    }));
    onSend(text, summaries.length ? { summaries, typed: value.trim() } : undefined);
    setAttachments([]);
    if (inner.current) {
      inner.current.value = "";
      resize();
    }
    if (draftTimer.current) clearTimeout(draftTimer.current);
    if (!ephemeral) removeStorage(draftKey(chatId));
  };

  // Deliberately independent of `hasKey`. A placeholder is an attribute, so
  // unlike the key pill it cannot be swapped by CSS, and keying it on a value
  // that is unreadable until after hydration put a third flash on every
  // refresh. The missing-key state is already carried by the disabled input,
  // the key pill in the header and the empty state's own copy.
  const placeholder = questionPending
    ? "Or reply directly…"
    : ephemeral
      ? "Ask anything — this chat isn't saved"
      : "Ask anything";

  return (
    <div className="relative z-10 mx-auto w-full max-w-3xl shrink-0 px-4 pb-4 pt-2 sm:pb-6">
      <div
        className={`rounded-2xl bg-surface/90 backdrop-blur-xl transition-shadow ${
          // Dashed, and deliberately not a new accent colour. Private mode is
          // the absence of everything the app normally remembers, so it reads
          // as quieter than an ordinary chat rather than louder — and a broken
          // outline is the one border that means "not written down".
          ephemeral ? "border border-dashed border-border-strong" : "border border-border"
        } ${busy ? "composer-active" : "shadow-[0_8px_32px_-12px_rgba(0,0,0,0.55)]"}`}
      >
        {/* The signal lives here rather than in the header because this is the
            element in permanent view and the one you are about to type into.
            Full text at every breakpoint: the header chip it replaced
            collapsed to a bare icon on phones, which is where the mode matters
            most and was least legible. */}
        {ephemeral && (
          <p
            id="composer-private-note"
            className="flex items-center gap-1.5 border-b border-dashed border-border-subtle px-4 py-2 text-micro text-text-muted"
          >
            <IconIncognito size={12} className="shrink-0" />
            Private — not saved, no memories read or written
          </p>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-3">
            {attachments.map((a) => (
              <span
                key={a.id}
                title={a.status === "error" ? a.error : undefined}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-micro ${
                  a.status === "error"
                    ? "border-danger/40 bg-danger-soft text-danger"
                    : "border-border-subtle bg-bg-elevated text-text-muted"
                }`}
              >
                {a.status === "extracting" ? (
                  <IconLoader size={11} className="animate-spin" />
                ) : (
                  <IconPaperclip size={11} />
                )}
                <span className="max-w-[14rem] truncate">
                  {a.name}
                  {a.status === "ready" && a.pageCount ? ` · ${a.pageCount}p` : ""}
                  {a.status === "error" ? " · couldn't read" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  aria-label={`Remove ${a.name}`}
                  className="text-text-faint hover:text-text"
                >
                  <IconClose size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        <textarea
          ref={inner}
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          aria-describedby={ephemeral ? "composer-private-note" : undefined}
          onInput={() => {
            resize();
            saveDraft();
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // The other combination always falls through un-prevented, which
            // is what makes it insert a newline — the textarea's own default
            // Enter behaviour, still available whichever key sends.
            const sends = sendKey === "enter" ? !e.shiftKey : e.shiftKey;
            if (sends) {
              e.preventDefault();
              submit();
            }
          }}
          className="scroll-thin w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-ui leading-relaxed text-text placeholder:text-text-faint focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />

        <div className="flex items-center justify-between gap-3 px-3 pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void attachFile(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => fileInput.current?.click()}
              title="Attach a PDF"
              aria-label="Attach a PDF"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-faint transition-colors hover:bg-bg-elevated hover:text-text-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconPaperclip size={14} />
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              title="Change model"
              className="truncate rounded-md border border-border-subtle bg-bg-elevated px-2 py-1 font-mono text-micro text-text-muted transition-colors hover:border-border hover:text-text-secondary"
            >
              {model}
            </button>
            {/* Keyed on the input hardware, not the viewport. `sm:` was the
                wrong test in both directions: a narrow desktop window lost
                shortcuts it can use, and a tablet was told to press Shift
                when it has no Shift to press. */}
            <span className="hidden text-micro text-text-faint pointer-fine:inline">
              <kbd className="rounded border border-border-subtle px-1 font-mono text-micro">
                {sendKey === "enter" ? "↵" : "⇧↵"}
              </kbd>{" "}
              send
              <span className="mx-1.5 opacity-50">·</span>
              <kbd className="rounded border border-border-subtle px-1 font-mono text-micro">
                {sendKey === "enter" ? "⇧↵" : "↵"}
              </kbd>{" "}
              newline
            </span>
          </div>

          {busy ? (
            <button
              type="button"
              onClick={onStop}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3 text-dense font-medium text-text-secondary transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger"
            >
              <IconStop size={12} />
              Stop
            </button>
          ) : (
            <button
              type="button"
              disabled={disabled || extracting}
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
