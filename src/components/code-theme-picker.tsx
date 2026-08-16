"use client";

import { useRef, useState } from "react";
import { CODE_SKIN_LABELS, CODE_SKINS } from "@/lib/code-theme";
import { IconAlert, IconCheck } from "./icons";
import { useTheme } from "./theme-provider";

/**
 * Syntax-highlighting theme, independent of the UI skin above it — the same
 * separation most editors make between a window theme and a code theme.
 * "Auto" (the default) leaves code exactly as the active UI skin already
 * paints it. "Imported" accepts a pasted or uploaded JSON palette — the
 * seven `--syntax-*` tokens, optionally split into `light`/`dark` — the same
 * shape and import flow as the full theme importer above it.
 */
export function CodeThemePicker() {
  const { codeSkin, setCodeSkin, customCodeSkin, importCodeSkin } = useTheme();
  const [pasted, setPasted] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // "Imported" only appears as a live option once something has actually
  // been imported — same reasoning as ThemeSkinToggle hiding "Custom".
  const options = CODE_SKINS.filter((s) => s !== "custom" || customCodeSkin !== null);

  function apply(raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setStatus({ ok: false, message: "That's not valid JSON." });
      return;
    }
    const result = importCodeSkin(parsed);
    setStatus(
      result.ok
        ? { ok: true, message: "Code theme imported and applied." }
        : { ok: false, message: result.error },
    );
  }

  async function onFile(file: File) {
    apply(await file.text());
  }

  return (
    <div className="w-fit space-y-3">
      <div
        role="radiogroup"
        aria-label="Code theme"
        className="flex w-fit flex-wrap gap-1 rounded-lg border border-border-subtle bg-surface p-1"
      >
        {options.map((option) => {
          const active = codeSkin === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setCodeSkin(option)}
              className={`rounded-md px-2.5 py-1.5 text-dense transition-colors ${
                active
                  ? "bg-surface-raised font-medium text-text"
                  : "text-text-muted hover:text-text"
              }`}
            >
              {CODE_SKIN_LABELS[option]}
            </button>
          );
        })}
      </div>

      <div className="space-y-2.5">
        {customCodeSkin && (
          <p className="text-micro text-text-faint">
            Currently imported: <span className="text-text-secondary">{customCodeSkin.name}</span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-lg border border-border px-2.5 py-1.5 text-dense text-text-muted hover:border-border-strong hover:text-text"
          >
            Import code theme file…
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
              placeholder='{"name": "My code theme", "dark": {"--syntax-keyword": "#ff79c6", ...}}'
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

        <CodeThemeSample />
      </div>
    </div>
  );
}

/**
 * A static snippet styled with the same `.markdown .hljs-*` classes the real
 * markdown renderer uses, so it picks up whatever `--syntax-*` tokens are
 * currently applied to the document — no highlighting library needed here,
 * just enough token variety (comment, keyword, string, number, function,
 * name, type) to preview every colour the picker above controls.
 */
function CodeThemeSample() {
  return (
    <div className="markdown">
      <pre className="my-0! text-micro">
        <code>
          <span className="hljs-comment">{"// fibonacci"}</span>
          {"\n"}
          <span className="hljs-keyword">function</span>{" "}
          <span className="hljs-title">fib</span>
          {"("}
          <span className="hljs-attr">n</span>
          {": "}
          <span className="hljs-type">number</span>
          {") {"}
          {"\n  "}
          <span className="hljs-keyword">if</span> {"(n <= "}
          <span className="hljs-number">1</span>
          {") "}
          <span className="hljs-keyword">return</span> n{";"}
          {"\n  "}
          <span className="hljs-keyword">return</span> fib(n -{" "}
          <span className="hljs-number">1</span>
          {") + fib(n - "}
          <span className="hljs-number">2</span>
          {");"}
          {"\n}"}
          {"\n\n"}
          <span className="hljs-keyword">const</span> <span className="hljs-variable">label</span>{" "}
          {"= "}
          <span className="hljs-string">{'"result"'}</span>
          {";"}
        </code>
      </pre>
    </div>
  );
}
