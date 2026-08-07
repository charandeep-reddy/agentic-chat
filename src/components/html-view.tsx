"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { withTheme, type HtmlSpec } from "@/lib/tools/render-html";
import { WidgetAction } from "./widget-shell";
import { useTheme } from "./theme-provider";
import { IconCode, IconCopy, IconDownload, IconExpand, IconEye, IconExternal } from "./icons";

/**
 * `allow-scripts` without `allow-same-origin` gives the document a unique
 * opaque origin: scripts run, but they cannot read the parent page, its
 * cookies, or localStorage. `allow-modals` is included so `alert`/`confirm`
 * in a generated demo behave as the author expected.
 */
const SANDBOX = "allow-scripts allow-modals allow-popups-to-escape-sandbox";

/** Bounds on the height a frame can ask for, so a runaway document can't take over the page. */
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 2000;

export function HtmlWidget({ spec }: { spec: HtmlSpec }) {
  const [view, setView] = useState<"preview" | "code">("preview");
  const [fullscreen, setFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [measured, setMeasured] = useState<number | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const { theme } = useTheme();

  // Changing this reloads the frame, so it must not be recomputed per render.
  const doc = useMemo(() => withTheme(spec.html, theme), [spec.html, theme]);

  // The frame has an opaque origin, so it reports its own height rather than
  // being measured. Only this frame's window is trusted as a source — any
  // other page on the tab can post here too.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { source?: string; height?: unknown };
      if (data?.source !== "agentic-chat-artifact" || typeof data.height !== "number") return;
      setMeasured(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(data.height))));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(spec.html).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }, [spec.html]);

  const download = useCallback(() => {
    const blob = new Blob([spec.html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(spec.title ?? "artifact").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [spec.html, spec.title]);

  const openInTab = useCallback(() => {
    // A blob URL keeps the document off any origin the app controls, so the
    // new tab is as isolated as the frame was.
    const url = URL.createObjectURL(new Blob([spec.html], { type: "text/html" }));
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }, [spec.html]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  return (
    <>
      {/*
        No card, no title bar, no status chip. An artifact is the answer, not an
        attachment to it, and chrome around every one of them competes with the
        thing the model actually designed. The controls stay, revealed on hover.
      */}
      <section aria-label={spec.title ?? "Rendered HTML"} className="group/html relative">
        {view === "preview" ? (
          <iframe
            ref={frameRef}
            title={spec.title ?? "Rendered HTML"}
            srcDoc={doc}
            sandbox={SANDBOX}
            referrerPolicy="no-referrer"
            className="w-full rounded-lg"
            // `measured` arrives once the document reports itself; `spec.height`
            // is only the placeholder for that first paint.
            style={{ height: measured ?? spec.height }}
          />
        ) : (
          <pre className="scroll-thin max-h-[520px] overflow-auto rounded-lg border border-border-subtle bg-bg-elevated p-3 font-mono text-[11px] leading-relaxed text-text-secondary">
            <code>{spec.html}</code>
          </pre>
        )}

        <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-lg border border-border-subtle bg-bg-elevated/90 p-0.5 opacity-0 backdrop-blur transition-opacity focus-within:opacity-100 group-hover/html:opacity-100">
          <WidgetAction
            onClick={() => setView(view === "preview" ? "code" : "preview")}
            label={view === "preview" ? "View source" : "View preview"}
          >
            {view === "preview" ? <IconCode size={14} /> : <IconEye size={14} />}
          </WidgetAction>
          <WidgetAction onClick={copy} label={copied ? "Copied" : "Copy source"}>
            <IconCopy size={14} />
          </WidgetAction>
          <WidgetAction onClick={download} label="Download .html">
            <IconDownload size={14} />
          </WidgetAction>
          <WidgetAction onClick={openInTab} label="Open in a new tab">
            <IconExternal size={14} />
          </WidgetAction>
          <WidgetAction onClick={() => setFullscreen(true)} label="Expand">
            <IconExpand size={14} />
          </WidgetAction>
        </div>

        {/* Sanitiser findings are the one thing worth saying out loud. */}
        {spec.warnings.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {spec.warnings.map((w) => (
              <li key={w} className="text-[11px] text-warn">
                {w}
              </li>
            ))}
          </ul>
        )}
      </section>

      {fullscreen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={spec.title ?? "Rendered HTML"}
        >
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-surface">
            <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
              <IconCode size={14} className="text-accent" />
              <h3 className="text-[13px] font-medium text-text">{spec.title ?? "HTML"}</h3>
              <div className="ml-auto flex items-center gap-2">
                <WidgetAction onClick={openInTab} label="Open in a new tab">
                  <IconExternal size={14} />
                </WidgetAction>
                <button
                  type="button"
                  onClick={() => setFullscreen(false)}
                  className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-raised hover:text-text"
                >
                  Close <kbd className="ml-1 font-mono text-[10px]">esc</kbd>
                </button>
              </div>
            </header>
            <div className="min-h-0 flex-1 p-3">
              <iframe
                title={spec.title ?? "Rendered HTML"}
                srcDoc={doc}
                sandbox={SANDBOX}
                referrerPolicy="no-referrer"
                // No background of its own — the document is transparent now, so
                // it sits on the dialog surface the same way it sits on the chat.
                className="h-full w-full"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
