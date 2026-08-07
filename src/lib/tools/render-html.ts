import { z } from "zod";
import { ToolError } from "./errors";

export const renderHtmlSchema = z.object({
  html: z
    .string()
    .min(12, "html must be at least 12 characters")
    .max(200_000, "html must be under 200000 characters"),
  title: z.string().max(120).optional(),
  /** Rendered iframe height in CSS pixels. */
  height: z.number().int().min(120).max(1600).optional(),
});

export type RenderHtmlArgs = z.infer<typeof renderHtmlSchema>;

export interface HtmlSpec {
  kind: "html";
  title?: string;
  html: string;
  height: number;
  /** Notes about anything stripped, surfaced in the widget footer. */
  warnings: string[];
}

const DEFAULT_HEIGHT = 420;

/**
 * Tags that can reach outside the frame or exfiltrate what it renders.
 * The iframe itself is sandboxed without `allow-same-origin`, so scripts can't
 * touch the parent page or its cookies — this is defence in depth against the
 * frame becoming a beacon for whatever the model was told to embed.
 */
const BLOCKED_TAGS = ["iframe", "object", "embed", "form", "base"] as const;

function stripFences(source: string): string {
  const trimmed = source.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const lines = trimmed.split("\n");
  lines.shift();
  if (lines[lines.length - 1]?.trim().startsWith("```")) lines.pop();
  return lines.join("\n").trim();
}

function removeTag(html: string, tag: string): { html: string; removed: boolean } {
  const paired = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi");
  const selfClosing = new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi");
  const next = html.replace(paired, "").replace(selfClosing, "");
  return { html: next, removed: next !== html };
}

function stripBlockedProtocols(html: string): { html: string; removed: boolean } {
  const next = html.replace(/(href|src|action)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, '$1="#"');
  return { html: next, removed: next !== html };
}

/**
 * Drops `<meta http-equiv=…>`, which could otherwise set a weaker CSP than
 * ours or navigate the frame with a refresh. Plain metas (charset, viewport,
 * description) are left alone.
 */
function stripHttpEquivMeta(html: string): { html: string; removed: boolean } {
  const next = html.replace(/<meta\b[^>]*\bhttp-equiv\b[^>]*>/gi, "");
  return { html: next, removed: next !== html };
}

/**
 * Blocks the frame from reaching the network. Everything must be inline, so
 * a generated artifact cannot beacon out what it renders, pull a remote
 * script, or load a tracking pixel. `'unsafe-inline'` is required for the
 * inline `<style>`/`<script>` that make artifacts work at all — the isolation
 * that matters here comes from the opaque origin and this `connect-src 'none'`.
 */
const CSP =
  "default-src 'none'; " +
  "style-src 'unsafe-inline'; " +
  "script-src 'unsafe-inline'; " +
  "img-src data: blob:; " +
  "font-src data:; " +
  "connect-src 'none'; " +
  "form-action 'none'; " +
  "frame-src 'none'; " +
  "base-uri 'none'";

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;

/**
 * Reports the document's rendered height to the parent so the frame can size
 * itself to its content instead of sitting in a fixed box with its own
 * scrollbar. The frame has an opaque origin — no `allow-same-origin` — so the
 * parent cannot measure it directly; the document has to volunteer the number.
 * `postMessage` is the one channel that stays open across that boundary.
 */
const MEASURE_SCRIPT = `<script>
(function () {
  var last = 0;
  var observer = null;
  function report() {
    var body = document.body;
    if (!body) return;
    // Measured from <body>, never <html>: documentElement.scrollHeight is
    // clamped to the viewport, which is the frame's current height — so it can
    // only ever report "as tall as it already is" and the frame never shrinks.
    var box = body.getBoundingClientRect();
    var height = Math.ceil(Math.max(box.bottom, body.scrollHeight));
    // Layout hasn't run yet on the first ticks in a srcdoc frame, and an
    // offscreen frame is not rendered at all — both report 0, which is not a
    // height, just an absence of one.
    if (!height || Math.abs(height - last) < 2) return;
    last = height;
    parent.postMessage({ source: "agentic-chat-artifact", height: height }, "*");
  }
  function start() {
    if (window.requestAnimationFrame) {
      requestAnimationFrame(function () { requestAnimationFrame(report); });
    }
    try {
      if (window.ResizeObserver) {
        observer = new ResizeObserver(report);
        observer.observe(document.body);
      }
    } catch (e) {}
    window.addEventListener("load", report);
    // Fonts, images and anything that lays out after first paint. Cheap, and
    // it also covers a frame that only becomes visible later.
    [60, 250, 800, 2000].forEach(function (delay) { setTimeout(report, delay); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
</script>`;

/**
 * The chat's own typography and palette, given to the frame so a widget looks
 * like part of the conversation instead of a pasted-in web page.
 *
 * This exists because the opposite approach failed. The model used to be told
 * to style everything itself, and it did: every artifact arrived with its own
 * background colour, its own font stack and its own idea of an accent, so each
 * one landed in the transcript as a coloured slab. Nobody asked for a theme.
 * Supplying the defaults here means the model can write plain HTML and get
 * something that belongs on the page.
 *
 * The background is transparent on purpose — the chat surface shows through,
 * and the widget has no visible edges. Values mirror `globals.css`; they are
 * duplicated rather than referenced because the frame has an opaque origin and
 * cannot read a single custom property from the parent document.
 */
const BASE_STYLES = `<style>
  :root {
    --text: #f4f4f5;
    --text-secondary: #d4d4d8;
    --text-muted: #a1a1aa;
    --text-faint: #71717a;
    --border-subtle: #1f1f23;
    --border: #27272a;
    --border-strong: #3f3f46;
    --surface: #141417;
    --surface-raised: #1a1a1e;
    --accent: #10b981;
    --danger: #f87171;
  }
  *, *::before, *::after { box-sizing: border-box; }
  /* color-scheme belongs on the controls, never on :root. Setting it at the
     root makes the browser paint an opaque dark canvas behind the whole frame,
     which background:transparent cannot undo — the widget lands in the
     transcript as a black slab. Scoped here, the native controls and their
     dropdowns still render dark and the frame stays see-through. */
  input, select, textarea, button, progress, meter { color-scheme: dark; }
  html, body { background: transparent; }
  body {
    margin: 0;
    color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 15px;
    line-height: 1.6;
  }
  h1, h2, h3, h4 { margin: 0 0 0.5em; font-weight: 600; line-height: 1.3; }
  h1 { font-size: 1.25rem; }
  h2 { font-size: 1.1rem; }
  h3 { font-size: 1rem; }
  p { margin: 0 0 0.75em; }
  p:last-child { margin-bottom: 0; }
  small { color: var(--text-muted); }
  a { color: var(--accent); }
  hr { border: 0; border-top: 1px solid var(--border-subtle); margin: 1em 0; }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
  label { display: block; margin-bottom: 0.35em; color: var(--text-muted); font-size: 13px; }
  input, select, textarea, button { font: inherit; color: inherit; }
  input[type="text"], input[type="number"], input[type="date"], input[type="email"],
  select, textarea {
    width: 100%;
    padding: 0.5em 0.65em;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: var(--surface);
    color: var(--text);
  }
  /* One line instead of a hand-built track: the browser themes the thumb, the
     fill and the checkbox tick from this. */
  input[type="range"], input[type="checkbox"], input[type="radio"], progress {
    accent-color: var(--accent);
  }
  input[type="range"] { width: 100%; }
  button {
    padding: 0.45em 0.9em;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: var(--surface-raised);
    cursor: pointer;
  }
  button:hover { border-color: var(--border-strong); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { padding: 0.45em 0.6em; text-align: left; border-bottom: 1px solid var(--border-subtle); }
  th { font-weight: 500; color: var(--text-muted); }
  svg, img { max-width: 100%; }
</style>`;

const HEAD = `${CSP_META}${BASE_STYLES}${MEASURE_SCRIPT}`;

/**
 * Injects the CSP meta and base styles into a document the model wrote itself.
 * They go first in `<head>` so anything the model wrote still wins.
 */
function injectCsp(html: string): string {
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${HEAD}`);
  }
  // No <head>: put it directly after <html>, where the parser will hoist it
  // into the implicit head before any resource can be requested.
  return html.replace(/<html([^>]*)>/i, `<html$1><head>${HEAD}</head>`);
}

/** Wraps a fragment in a full document. */
function ensureDocument(html: string): string {
  if (/<html[\s>]/i.test(html)) return injectCsp(html);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${HEAD}
</head>
<body>
${html}
</body>
</html>`;
}

export function renderHtml(args: RenderHtmlArgs): HtmlSpec {
  let html = stripFences(args.html);
  if (html.length < 12) {
    throw new ToolError("The HTML is empty after removing code fences.");
  }

  const warnings: string[] = [];

  for (const tag of BLOCKED_TAGS) {
    const result = removeTag(html, tag);
    html = result.html;
    if (result.removed) warnings.push(`Removed <${tag}> — not allowed in rendered HTML.`);
  }

  const meta = stripHttpEquivMeta(html);
  html = meta.html;
  if (meta.removed) warnings.push("Removed a <meta http-equiv> directive.");

  const protocols = stripBlockedProtocols(html);
  html = protocols.html;
  if (protocols.removed) warnings.push("Neutralised a javascript: URL.");

  if (html.trim().length < 12) {
    throw new ToolError("Nothing renderable was left after sanitising the HTML.");
  }

  return {
    kind: "html",
    title: args.title,
    html: ensureDocument(html),
    height: args.height ?? DEFAULT_HEIGHT,
    warnings,
  };
}
