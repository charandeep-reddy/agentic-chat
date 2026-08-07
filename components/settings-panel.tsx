"use client";

import { useCallback, useEffect, useState } from "react";
import type { ModelInfo } from "@/app/api/models/route";

export const KEY_STORAGE = "agentic-chat.key";
export const MODEL_STORAGE = "agentic-chat.model";

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

  // Reset the draft and cache when the panel opens (derived state during render).
  if (open && !prevOpen) {
    setPrevOpen(true);
    setDraftKey(apiKey);
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
    fetch("/api/models", { headers: { "x-openrouter-key": apiKey } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`OpenRouter rejected the key (${res.status}).`);
        const data = (await res.json()) as { models: ModelInfo[] };
        if (!cancelled) setModels({ key: apiKey, list: data.models });
      })
      .catch((err: unknown) => {
        if (!cancelled) setErrorKey(apiKey);
        console.error("[settings] failed to load models:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [open, apiKey, models, errorKey]);

  const save = useCallback(() => {
    const key = draftKey.trim();
    if (key === "" && apiKey === "") return;
    onKeyChange(key);
    setDraftKey("");
    onClose();
  }, [draftKey, apiKey, onKeyChange, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Settings"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-100">Settings</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300" aria-label="Close">
            ✕
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-zinc-400" htmlFor="or-key">
          OpenRouter API key
        </label>
        <div className="flex gap-2">
          <input
            id="or-key"
            type="password"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            placeholder={apiKey ? `${maskKey(apiKey)} — saved locally` : "sk-or-…"}
            autoComplete="off"
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-200 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={save}
            disabled={draftKey.trim() === "" && apiKey === ""}
            className="shrink-0 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </div>
        <p className="mt-1 text-[11px] text-zinc-600">
          Stored in your browser only. Get one at openrouter.ai/keys — one key unlocks every model.
        </p>

        {apiKey && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-medium text-zinc-400" htmlFor="or-model">
                Model
              </label>
              {errorKey === apiKey && (
                <button
                  type="button"
                  onClick={() => setErrorKey(null)}
                  className="text-[11px] text-red-400 underline-offset-2 hover:underline"
                >
                  Model list failed — retry
                </button>
              )}
            </div>
            {loadingModels ? (
              <p className="text-xs text-zinc-500">Loading models…</p>
            ) : (
              <select
                id="or-model"
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none"
              >
                <option value="openrouter/auto">openrouter/auto (recommended)</option>
                {(models?.list ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.id}
                    {m.context ? ` · ${Math.round(m.context / 1024)}k ctx` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {apiKey && (
          <button
            type="button"
            onClick={() => {
              onKeyChange("");
              onClose();
            }}
            className="mt-4 text-xs text-zinc-600 hover:text-red-400"
          >
            Remove key
          </button>
        )}
      </div>
    </div>
  );
}
