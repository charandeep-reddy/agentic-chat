"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ModelInfo } from "@/app/api/models/route";
import { PROVIDERS, PROVIDER_LIST, type ProviderId } from "@/lib/providers";
import { TOGGLEABLE_TOOLS, type ToggleableTool } from "@/lib/tool-visibility";
import { Skeleton } from "../skeleton";
import { setPrice, usePrices } from "../use-prices";
import { setSendKeyPreference, useSendKeyPreference } from "../chat/use-send-key";
import { IconClose, IconKey } from "../icons";

/** Fixed shortcuts. Send/newline are appended dynamically — see SHORTCUTS below. */
const FIXED_SHORTCUTS = [
  { keys: "⌘ K", label: "Search chats / jump" },
  { keys: "⌘ ⇧ O", label: "New chat" },
  { keys: "⌘ ⇧ P", label: "New private chat" },
  { keys: "⌘ B", label: "Show / hide sidebar" },
  { keys: "⌘ /", label: "Focus composer" },
  { keys: "esc", label: "Stop generating" },
];

function maskKey(key: string): string {
  if (key.length <= 10) return "•".repeat(Math.min(key.length, 8));
  return `…${key.slice(-4)}`;
}

/**
 * A context window as its provider would describe it.
 *
 * Dividing by 1024 is the obvious thing and the wrong one: Gemini reports
 * 1048576 tokens, which came out as "1024k ctx" where the whole industry —
 * Google included — says 1M. Providers quote these in decimal, so we do too.
 */
export function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  return `${Math.round(tokens / 1000)}k`;
}

/**
 * Per-million-token prices for the selected model.
 *
 * Typed in by hand because there is nothing to look them up from: the provider
 * is any OpenAI-compatible endpoint, and none of them publish a machine-readable
 * price list. Without a price the app still shows token counts — it just does
 * not pretend to know what they cost.
 */
function PriceFields({ model }: { model: string }) {
  const prices = usePrices();
  const price = prices[model];

  const update = (field: "input" | "output", raw: string) => {
    const value = raw.trim() === "" ? NaN : Number(raw);
    const next = {
      input: price?.input ?? 0,
      output: price?.output ?? 0,
      [field]: Number.isFinite(value) && value >= 0 ? value : 0,
    };
    // Both back to zero means "no price", not "free" — drop the entry so the
    // cost estimate disappears instead of reading $0.
    setPrice(model, next.input === 0 && next.output === 0 ? null : next);
  };

  return (
    <div className="mt-6">
      <h3 className="mb-1.5 text-dense font-medium text-text-secondary">
        Price per 1M tokens
      </h3>
      <div className="flex gap-2">
        {(
          [
            { field: "input" as const, label: "Input" },
            { field: "output" as const, label: "Output" },
          ]
        ).map(({ field, label }) => (
          <label key={field} className="min-w-0 flex-1">
            <span className="mb-1 block text-micro text-text-faint">{label}</span>
            <div className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface px-3 py-2 focus-within:border-accent">
              <span className="text-dense text-text-faint">$</span>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={price?.[field] ?? ""}
                onChange={(e) => update(field, e.target.value)}
                placeholder="0.00"
                className="min-w-0 flex-1 bg-transparent font-mono text-dense text-text placeholder:text-text-faint focus:outline-none"
              />
            </div>
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-micro leading-relaxed text-text-faint">
        Optional, and only for <span className="font-mono">{model}</span>. Stored in this browser;
        token counts show either way.
      </p>
    </div>
  );
}

export function SettingsPanel({
  provider,
  apiKey,
  model,
  providersWithKey,
  onProviderChange,
  onKeyChange,
  onModelChange,
  onClearKey,
  onClearAllKeys,
  disabledTools,
  onDisabledToolsChange,
  open,
  onClose,
}: {
  provider: ProviderId;
  apiKey: string;
  model: string;
  providersWithKey: ProviderId[];
  onProviderChange: (provider: ProviderId) => void;
  onKeyChange: (key: string) => void;
  onModelChange: (model: string) => void;
  onClearKey: () => void;
  onClearAllKeys: () => void;
  /** Tools turned off for this one chat — see useDisabledTools. */
  disabledTools: ToggleableTool[];
  onDisabledToolsChange: (next: ToggleableTool[]) => void;
  open: boolean;
  onClose: () => void;
}) {
  const sendKey = useSendKeyPreference();
  const shortcuts = [
    ...FIXED_SHORTCUTS.slice(0, 4),
    sendKey === "enter"
      ? { keys: "↵", label: "Send" }
      : { keys: "⇧ ↵", label: "Send" },
    sendKey === "enter"
      ? { keys: "⇧ ↵", label: "Newline" }
      : { keys: "↵", label: "Newline" },
    ...FIXED_SHORTCUTS.slice(4),
  ];
  const [draftKey, setDraftKey] = useState("");
  const [prevOpen, setPrevOpen] = useState(false);
  const [models, setModels] = useState<{ token: string; list: ModelInfo[] } | null>(null);
  const [errorToken, setErrorToken] = useState<string | null>(null);
  /** Two-step confirm for clearing every provider's key at once. */
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const info = PROVIDERS[provider];

  /**
   * Identifies one model list. Both halves matter: the same key against a
   * different provider is a different catalogue, and switching provider has to
   * invalidate a list fetched for the previous one rather than show Claude's
   * models under Gemini.
   */
  const token = `${provider}:${apiKey}`;

  // Reset the draft when the panel opens (derived state during render).
  if (open && !prevOpen) {
    setPrevOpen(true);
    setDraftKey("");
  }
  if (!open && prevOpen) {
    setPrevOpen(false);
    setErrorToken(null);
    // Closing the panel abandons a half-made decision rather than leaving it
    // armed for the next time it opens.
    setConfirmClearAll(false);
  }

  const loadingModels = open && apiKey !== "" && models?.token !== token && errorToken !== token;

  /**
   * The list to offer, with this provider's default guaranteed to be in it.
   *
   * The default has to be selectable before the live list arrives, and it must
   * not appear twice once it does — which it otherwise would, since every
   * provider lists its own default model.
   */
  const modelOptions = useMemo(() => {
    const fetched = models?.token === token ? models.list : [];
    if (fetched.some((m) => m.id === info.defaultModel)) return fetched;
    return [{ id: info.defaultModel, name: info.defaultModel, context: null }, ...fetched];
  }, [models, token, info.defaultModel]);

  useEffect(() => {
    if (!open || !apiKey) return;
    if (models?.token === token || errorToken === token) return;
    let cancelled = false;

    fetch("/api/models", { headers: { "x-model-key": apiKey, "x-model-provider": provider } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`The provider rejected the key (${res.status}).`);
        const data = (await res.json()) as { models: ModelInfo[] };
        if (!cancelled) setModels({ token, list: data.models });
      })
      .catch((error: unknown) => {
        if (!cancelled) setErrorToken(token);
        console.error("[settings] failed to load models:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [open, apiKey, provider, token, models, errorToken]);

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
    setErrorToken(null);
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
          <h2 className="text-ui font-semibold text-text">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-md p-1 text-text-faint hover:bg-surface hover:text-text"
          >
            <IconClose size={15} />
          </button>
        </div>

        <label
          htmlFor="model-provider"
          className="mb-1.5 block text-dense font-medium text-text-secondary"
        >
          Provider
        </label>
        <select
          id="model-provider"
          value={provider}
          onChange={(e) => onProviderChange(e.target.value as ProviderId)}
          className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-dense text-text focus:border-accent focus:outline-none"
        >
          {/* Marking which providers already hold a key turns the picker into
              a switch: you can see you have an Anthropic key before choosing
              it, instead of switching and discovering an empty field. */}
          {PROVIDER_LIST.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {providersWithKey.includes(p.id) ? " ✓" : ""}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-micro leading-relaxed text-text-faint">
          {info.hint}{" "}
          <a
            href={info.keysUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-text-muted underline underline-offset-2 hover:text-text"
          >
            Get a key ↗
          </a>
        </p>

        {/* Whether a key is stored is the one fact this section exists to
            report, so it gets its own element beside the label. It used to be
            tacked onto the input's placeholder, where it was the first thing
            to be truncated as the row got busier — leaving a bare row of dots
            that reads like six typed characters. */}
        <div className="mb-1.5 mt-6 flex items-baseline justify-between gap-2">
          <label htmlFor="model-key" className="text-dense font-medium text-text-secondary">
            {info.label} API key
          </label>
          {apiKey && (
            <span className="flex shrink-0 items-center gap-1.5 text-micro text-accent">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
              Saved {maskKey(apiKey)}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            id="model-key"
            type="password"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            placeholder={apiKey ? "Paste a new key to replace it" : info.keyPlaceholder}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface px-3 py-2 font-mono text-dense text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
          />
          {/* Accent only while it can actually do something. Rendering a
              faded-accent Save next to an empty field made the panel's
              loudest element its one no-op control. */}
          <button
            type="button"
            onClick={save}
            disabled={draftKey.trim() === ""}
            className="shrink-0 rounded-lg border border-transparent bg-accent px-3 py-2 text-dense font-medium text-accent-text transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-transparent disabled:text-text-faint"
          >
            Save
          </button>
        </div>
        {/* One line instead of four. The old paragraph said the same thing
            three ways and was long enough that nobody read any of them. */}
        <div className="mt-1.5 flex items-center gap-1.5 text-micro text-text-faint">
          <IconKey size={11} className="shrink-0" />
          <span className="min-w-0 flex-1">Kept in this browser. Never sent to our server.</span>
          {apiKey && (
            <button
              type="button"
              onClick={() => {
                onClearKey();
                setDraftKey("");
                setModels(null);
                setErrorToken(null);
              }}
              className="shrink-0 underline underline-offset-2 transition-colors hover:text-danger"
            >
              Clear key
            </button>
          )}
        </div>

        {apiKey && (
          <div className="mt-6">
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="model-select" className="block text-dense font-medium text-text-secondary">
                Model
              </label>
              {errorToken === token && (
                <button
                  type="button"
                  onClick={() => setErrorToken(null)}
                  className="text-micro text-danger underline-offset-2 hover:underline"
                >
                  Model list failed — retry
                </button>
              )}
            </div>
            {loadingModels ? (
              <Skeleton className="h-[38px] w-full rounded-lg" />
            ) : (
              <select
                id="model-select"
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-dense text-text focus:border-accent focus:outline-none"
              >
                {/* The selected model always has an option of its own, even
                    when the fetched list has not arrived or does not contain
                    it. A controlled <select> whose value matches no option
                    renders blank, which would read as "no model chosen" while
                    a model was in fact about to be used. */}
                {!modelOptions.some((m) => m.id === model) && (
                  <option value={model}>{model}</option>
                )}
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.id === info.defaultModel ? " (default)" : ""}
                    {m.context ? ` · ${formatContext(m.context)} ctx` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <PriceFields model={model} />

        <div className="mt-6">
          <h3 className="mb-1.5 text-dense font-medium text-text-secondary">Send with</h3>
          <div className="flex gap-2">
            {(
              [
                { value: "enter" as const, label: "Enter", hint: "Shift+Enter for a newline" },
                { value: "shift-enter" as const, label: "Shift+Enter", hint: "Enter for a newline" },
              ]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSendKeyPreference(opt.value)}
                title={opt.hint}
                className={`flex-1 rounded-lg border px-3 py-2 text-dense transition-colors ${
                  sendKey === opt.value
                    ? "border-accent/40 bg-accent-soft text-text"
                    : "border-border-subtle text-text-muted hover:border-border hover:text-text"
                }`}
              >
                {opt.label} sends
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <h3 className="mb-1.5 text-dense font-medium text-text-secondary">Tools for this chat</h3>
          <p className="mb-2 text-micro text-text-faint">
            Turned off here means the model cannot call it in this conversation — other chats are
            unaffected.
          </p>
          <div className="space-y-1">
            {TOGGLEABLE_TOOLS.map((t) => {
              const on = !disabledTools.includes(t.name);
              return (
                <label
                  key={t.name}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 hover:bg-surface"
                >
                  <span className="text-dense text-text-secondary">{t.label}</span>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      onDisabledToolsChange(
                        on
                          ? [...disabledTools, t.name]
                          : disabledTools.filter((name) => name !== t.name),
                      )
                    }
                    className="h-4 w-4 accent-accent"
                  />
                </label>
              );
            })}
          </div>
        </div>

        {/* The whole section, heading included — a reference table for keys
            the reader has no way to press is not a shorter list, it is a list
            of things that do not apply to them. */}
        <div className="mt-6 hidden pointer-fine:block">
          <h3 className="mb-2 text-dense font-medium text-text-secondary">Shortcuts</h3>
          <dl className="space-y-1.5">
            {shortcuts.map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <dt className="text-dense text-text-muted">{s.label}</dt>
                <dd className="rounded border border-border-subtle bg-surface px-1.5 py-px font-mono text-micro text-text-faint">
                  {s.keys}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Negative margin cancels the links' own hover padding, so their text
            lines up with every heading above instead of sitting ~20px inset. */}
        <div className="-mx-2.5 mt-6 space-y-1">
          {[
            { href: "/profile", label: "Profile & custom instructions" },
            { href: "/memory", label: "Memory & packs" },
            { href: "/skills", label: "Skills" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-lg px-2.5 py-2 text-dense text-text-muted transition-colors hover:bg-surface hover:text-text"
            >
              {link.label} →
            </Link>
          ))}
        </div>

        {/* Only worth offering once a second provider holds a key — with one
            stored, the Clear button beside the field already does this, and
            two controls for one action is worse than one. */}
        {providersWithKey.length > 1 && (
          <div className="mt-6 border-t border-border-subtle pt-4">
            {confirmClearAll ? (
              <>
                {/* The provider names belong here, at the moment of decision,
                    rather than as a standing second line restating the button
                    above them. */}
                <p className="text-dense leading-relaxed text-text-secondary">
                  Remove stored keys for{" "}
                  {providersWithKey.map((id) => PROVIDERS[id].label).join(" and ")}? You&apos;ll
                  need to paste them again.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClearAllKeys();
                      setConfirmClearAll(false);
                      setDraftKey("");
                      setModels(null);
                      setErrorToken(null);
                    }}
                    className="rounded-md border border-danger/40 px-2.5 py-1 text-dense text-danger transition-colors hover:bg-danger/10"
                  >
                    Clear all keys
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="px-1 text-dense text-text-faint transition-colors hover:text-text"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                className="text-dense text-text-faint transition-colors hover:text-danger"
              >
                Clear all stored keys ({providersWithKey.length})
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
