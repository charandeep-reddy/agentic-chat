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

/** Injects the CSP meta into a document the model wrote itself. */
function injectCsp(html: string): string {
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${CSP_META}`);
  }
  // No <head>: put it directly after <html>, where the parser will hoist it
  // into the implicit head before any resource can be requested.
  return html.replace(/<html([^>]*)>/i, `<html$1><head>${CSP_META}</head>`);
}

/**
 * Wraps a fragment in a full document so a bare `<div>` still renders with
 * sensible typography instead of Times New Roman on white.
 */
function ensureDocument(html: string): string {
  if (/<html[\s>]/i.test(html)) return injectCsp(html);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${CSP_META}
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    padding: 16px;
    background: #0f0f11;
    color: #e4e4e7;
    font: 14px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  a { color: #34d399; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #27272a; padding: 6px 10px; text-align: left; }
  th { background: #18181b; }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  pre { background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 12px; overflow: auto; }
  button { font: inherit; cursor: pointer; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 999px; }
</style>
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
