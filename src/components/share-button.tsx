"use client";

import { useCallback, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { chatToMarkdown } from "@/lib/export-markdown";
import { useMenu } from "./use-menu";
import { IconCheck, IconCopy, IconDownload, IconShare, IconTrash } from "./icons";

export function ShareButton({
  chatId,
  title,
  messages,
  initialShareId,
}: {
  chatId: string;
  title: string;
  messages: UIMessage[];
  initialShareId: string | null;
}) {
  const [shareId, setShareId] = useState(initialShareId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Not `roving`: this panel holds a text field, so the arrow keys belong to
  // whatever the user is typing in.
  const panelRef = useMenu<HTMLDivElement>({ open, onClose: close, trigger: triggerRef });

  // Read during render, so it has to survive the server pass too — this is a
  // client component, but Next still prerenders it. The origin is only needed
  // once the panel is open, which never happens on the server, so falling back
  // to an empty string here costs nothing and cannot desync hydration.
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = shareId ? `${origin}/share/${shareId}` : "";

  const createLink = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/chats/${chatId}/share`, { method: "POST" });
      const data = (await res.json()) as { shareId: string | null };
      setShareId(data.shareId);
    } catch (error) {
      console.error("[share] failed to create link:", error);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await fetch(`/api/chats/${chatId}/share`, { method: "DELETE" });
      setShareId(null);
    } catch (error) {
      console.error("[share] failed to revoke link:", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Share this chat"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
          shareId
            ? "border-info/40 text-info hover:bg-info-soft"
            : "border-border text-text-muted hover:border-border-strong hover:text-text"
        }`}
      >
        <IconShare size={12} />
        {shareId ? "Shared" : "Share"}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Share this chat"
          className="absolute right-0 top-full z-30 mt-1.5 w-80 rounded-xl border border-border bg-surface-raised p-3 shadow-xl"
        >
          <h3 className="text-[13px] font-medium text-text">Share this chat</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-text-faint">
            Anyone with the link can read the conversation. New messages you send afterwards appear
            there too — revoke the link to stop that.
          </p>

          <button
            type="button"
            onClick={() => {
              const blob = new Blob([chatToMarkdown(title, messages)], {
                type: "text/markdown",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "chat"}.md`;
              a.click();
              URL.revokeObjectURL(url);
              setOpen(false);
            }}
            className="mt-3 flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px] text-text-secondary transition-colors hover:border-border-strong hover:text-text"
          >
            <IconDownload size={14} />
            Download as Markdown
          </button>

          <div className="my-3 border-t border-border-subtle" />

          {shareId ? (
            <>
              <div className="flex gap-1.5">
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-bg-elevated px-2.5 py-2 font-mono text-[11px] text-text-secondary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(url).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    });
                  }}
                  aria-label="Copy link"
                  className="shrink-0 rounded-lg bg-accent px-2.5 text-accent-text hover:brightness-110"
                >
                  {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                </button>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void revoke()}
                className="mt-2.5 flex items-center gap-1.5 text-[11px] text-text-faint hover:text-danger disabled:opacity-50"
              >
                <IconTrash size={11} />
                Revoke link
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void createLink()}
              className="w-full rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-accent-text hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create public link"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
