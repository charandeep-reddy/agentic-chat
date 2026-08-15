"use client";

import { useRef, useState } from "react";
import { useTheme } from "./theme-provider";
import { IconAlert, IconCheck } from "./icons";

/**
 * Imports a skin exported from an external theme editor/marketplace — this
 * app only ever consumes that JSON, it doesn't author or host one itself.
 * Accepts a `.json` file or pasted text, either works the same way once
 * parsed: validated by `importTheme`, which is the single point that decides
 * what's actually safe to paint (see sanitizeThemeSkinSet in lib/theme.ts).
 */
export function ThemeImport() {
  const { importTheme, customTheme } = useTheme();
  const [pasted, setPasted] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function apply(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setStatus({ ok: false, message: "That's not valid JSON." });
      return;
    }
    const result = importTheme(parsed);
    setStatus(
      result.ok
        ? { ok: true, message: "Theme imported and applied." }
        : { ok: false, message: result.error },
    );
  }

  async function onFile(file: File) {
    apply(await file.text());
  }

  return (
    <div className="space-y-2.5">
      {customTheme && (
        <p className="text-micro text-text-faint">
          Currently imported: <span className="text-text-secondary">{customTheme.name}</span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="rounded-lg border border-border px-2.5 py-1.5 text-dense text-text-muted hover:border-border-strong hover:text-text"
        >
          Import theme file…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void onFile(file);
          }}
        />
      </div>

      <details className="text-dense text-text-muted">
        <summary className="cursor-pointer select-none hover:text-text">Or paste the JSON</summary>
        <div className="mt-2 space-y-2">
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder='{"name": "My theme", "dark": {"--bg": "#111111", ...}}'
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-bg-elevated p-2 font-mono text-micro text-text placeholder:text-text-faint"
          />
          <button
            type="button"
            onClick={() => apply(pasted)}
            disabled={!pasted.trim()}
            className="rounded-lg bg-accent px-2.5 py-1.5 text-dense font-medium text-accent-text hover:brightness-110 disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </details>

      {status && (
        <p
          className={`flex items-center gap-1.5 text-micro ${status.ok ? "text-accent" : "text-danger"}`}
        >
          {status.ok ? <IconCheck size={12} /> : <IconAlert size={12} />}
          {status.message}
        </p>
      )}
    </div>
  );
}
