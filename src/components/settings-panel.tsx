"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ModelInfo } from "@/app/api/models/route";
import { DEFAULT_MODEL } from "@/lib/models";
import { IconClose, IconKey } from "./icons";

export const KEY_STORAGE = "agentic-chat.key";
export const MODEL_STORAGE = "agentic-chat.model";

const SHORTCUTS = [
  { keys: "⌘ K", label: "Search chats / jump" },
  { keys: "⌘ ⇧ O", label: "New chat" },
  { keys: "⌘ /", label: "Focus composer" },
  { keys: "↵", label: "Send" },
  { keys: "⇧ ↵", label: "Newline" },
  { keys: "esc", label: "Stop generating" },
];

function maskKey(key: string): string {
  if (key.length <= 10) return "•".repeat(Math.min(key.length, 8));
  return `…${key.slice(-4)}`;
}

export function SettingsPanel({
  apiKey,
  model,
  onKeyChange,
  onModelChange,
  open,
  onClose,
}: {
  apiKey: string;
  model: string;
  onKeyChange: (key: string) => void;
  onModelChange: (model: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  const [draftKey, setDraftKey] = useState("");
  const [prevOpen, setPrevOpen] = useState(false);
  const [models, setModels] = useState<{ key: string; list: ModelInfo[] } | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  // Reset the draft when the panel opens (derived state during render).
  if (open && !prevOpen) {
    setPrevOpen(true);
    setDraftKey("");
  }
  if (!open && prevOpen) {
    setPrevOpen(false);
    setErrorKey(null);
  }

  const loadingModels = open && apiKey !== "" && models?.key !== apiKey && errorKey !== apiKey;

  useEffect(() => {
    if (!open || !apiKey) return;
    if (models?.key === apiKey || errorKey === apiKey) return;
    let cancelled = false;

    fetch("/api/models", { headers: { "x-model-key": apiKey } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`The provider rejected the key (${res.status}).`);
        const data = (await res.json()) as { models: ModelInfo[] };
        if (!cancelled) setModels({ key: apiKey, list: data.models });
      })
      .catch((error: unknown) => {
        if (!cancelled) setErrorKey(apiKey);
        console.error("[settings] failed to load models:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [open, apiKey, models, errorKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const save = useCallback(() => {
    const key = draftKey.trim();
    if (!key) return;
    onKeyChange(key);
    setDraftKey("");
    setModels(null);
    setErrorKey(null);
  }, [draftKey, onKeyChange]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} aria-hidden />
      <div
        className="scroll-thin fixed inset-y-0 right-0 z-50 flex w-[420px] max-w-[92vw] flex-col overflow-y-auto border-l border-border bg-bg-elevated p-5 shadow-2xl"
        role="dialog"
        aria-label="Settings"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-md p-1 text-text-faint hover:bg-surface hover:text-text"
          >
            <IconClose size={15} />
          </button>
        </div>

        <label htmlFor="model-key" className="mb-1.5 block text-[12px] font-medium text-text-secondary">
          Model API key
        </label>
        <div className="flex gap-2">
          <input
            id="model-key"
            type="password"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            placeholder={apiKey ? `${maskKey(apiKey)} — saved in this browser` : "sk-…"}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface px-3 py-2 font-mono text-[13px] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={save}
            disabled={draftKey.trim() === ""}
            className="shrink-0 rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-accent-text hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </div>
        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-text-faint">
          <IconKey size={11} className="mt-0.5 shrink-0" />
          Stored in this browser&apos;s localStorage and sent with each request. It is never written to
          the server or the database.
        </p>

        {apiKey && (
          <div className="mt-6">
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="model-select" className="block text-[12px] font-medium text-text-secondary">
                Model
              </label>
              {errorKey === apiKey && (
                <button
                  type="button"
                  onClick={() => setErrorKey(null)}
                  className="text-[11px] text-danger underline-offset-2 hover:underline"
                >
                  Model list failed — retry
                </button>
              )}
            </div>
            {loadingModels ? (
              <p className="text-[12px] text-text-faint">Loading models…</p>
            ) : (
              <select
                id="model-select"
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[13px] text-text focus:border-accent focus:outline-none"
              >
                <option value={DEFAULT_MODEL}>{DEFAULT_MODEL} (default)</option>
                {(models?.list ?? [])
                  .filter((m) => m.id !== DEFAULT_MODEL)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.context ? ` · ${Math.round(m.context / 1024)}k ctx` : ""}
                    </option>
                  ))}
              </select>
            )}
          </div>
        )}

        <div className="mt-6">
          <h3 className="mb-2 text-[12px] font-medium text-text-secondary">Shortcuts</h3>
          <dl className="space-y-1.5">
            {SHORTCUTS.map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <dt className="text-[12px] text-text-muted">{s.label}</dt>
                <dd className="rounded border border-border-subtle bg-surface px-1.5 py-px font-mono text-[11px] text-text-faint">
                  {s.keys}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-6 space-y-1">
          {[
            { href: "/profile", label: "Profile & custom instructions" },
            { href: "/memory", label: "Memory & packs" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-lg px-2.5 py-2 text-[13px] text-text-muted transition-colors hover:bg-surface hover:text-text"
            >
              {link.label} →
            </Link>
          ))}
        </div>

        {apiKey && (
          <button
            type="button"
            onClick={() => {
              onKeyChange("");
              setModels(null);
              onClose();
            }}
            className="mt-6 self-start text-[12px] text-text-faint hover:text-danger"
          >
            Remove key from this browser
          </button>
        )}
      </div>
    </>
  );
}
