import { NextRequest } from "next/server";
import { sanitizeThemeSkinSet, THEME_SKIN_STORAGE, CUSTOM_THEME_STORAGE } from "@/lib/theme";

export const dynamic = "force-dynamic";

// A few dozen colour tokens, base64-encoded, comfortably fits an order of
// magnitude under this — the ceiling exists to reject abuse, not real themes.
const MAX_PAYLOAD_LENGTH = 8_000;

/**
 * Hand-off target for external theme editors — e.g. Agentic Skins' "Open in
 * Agentic Chat" button. A skin is client state only (localStorage, see the
 * privacy invariant in CLAUDE.md and ThemeProvider.importTheme): there is no
 * server-side "theme" table this route could write to, and none should be
 * added just for this. So instead of an authenticated JSON endpoint, this is
 * a GET a browser can navigate to directly: it validates the payload with
 * the same `sanitizeThemeSkinSet` the file-import UI uses, then returns a
 * tiny HTML page whose inline script writes the exact localStorage keys
 * `importTheme` would and redirects to "/". No React, no hydration — same
 * reasoning as THEME_INIT_SCRIPT in lib/theme.ts.
 *
 * URL shape: /api/theme/import?t=<base64url(JSON.stringify(ThemeSkinSet))>
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("t");
  const theme = raw ? sanitizeThemeSkinSet(decodePayload(raw)) : null;

  if (!theme) {
    return respond(errorPage(), 400);
  }
  return respond(applyPage(theme));
}

function decodePayload(value: string): unknown {
  if (value.length === 0 || value.length > MAX_PAYLOAD_LENGTH) return null;
  try {
    const json = Buffer.from(value, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function respond(body: string, status = 200): Response {
  return new Response(shell(body), {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function shell(body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Agentic Chat</title>
<style>
  html,body{height:100%}
  body{margin:0;display:flex;align-items:center;justify-content:center;
    background:#0b0b0d;color:#e8e8ea;
    font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  main{text-align:center;padding:24px}
  a{color:#e8a33d}
</style>
</head><body><main>${body}</main></body></html>`;
}

function applyPage(theme: { name: string }): string {
  // The theme is trusted here — it already passed sanitizeThemeSkinSet, whose
  // colour-shape allow-list is what makes embedding it in a script safe. Only
  // `name` is free text, so it alone is escaped for the HTML (not script) context.
  const payload = JSON.stringify(theme).replace(/</g, "\\u003c");
  return `<p>Applying “${escapeHtml(theme.name)}”…</p>
<script>
try {
  localStorage.setItem(${JSON.stringify(CUSTOM_THEME_STORAGE)}, JSON.stringify(${payload}));
  localStorage.setItem(${JSON.stringify(THEME_SKIN_STORAGE)}, "custom");
} catch (e) {}
location.replace("/");
</script>
<noscript><a href="/">Continue to Agentic Chat</a></noscript>`;
}

function errorPage(): string {
  return `<p>That theme link looks broken or out of date.</p>
<p><a href="/">Continue to Agentic Chat</a></p>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
