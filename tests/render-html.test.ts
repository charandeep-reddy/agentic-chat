import { describe, expect, it } from "vitest";
import { renderHtml, withTheme } from "@/lib/tools/render-html";
import { ToolError } from "@/lib/tools/errors";

describe("renderHtml", () => {
  it("wraps a bare fragment in a styled document", () => {
    const spec = renderHtml({ html: "<div>Hello there</div>" });

    expect(spec.kind).toBe("html");
    expect(spec.html).toMatch(/^<!doctype html>/);
    expect(spec.html).toContain("<div>Hello there</div>");
    expect(spec.html).toContain("<style>");
    expect(spec.warnings).toEqual([]);
  });

  it("renders on the chat's own surface rather than painting its own", () => {
    // The whole point of the base stylesheet: a widget should blend into the
    // conversation, so the frame must stay transparent and inherit the app's
    // type and palette instead of arriving as a coloured slab.
    const out = renderHtml({ html: "<div>Hi</div>" }).html;

    expect(out).toContain("html, body { background: transparent; }");
    expect(out).toContain("--accent: #10b981;");
    expect(out).toContain("accent-color: var(--accent);");
  });

  it("gives a model-authored document the same base styles", () => {
    const out = renderHtml({ html: "<html><head></head><body><p>Mine</p></body></html>" }).html;

    expect(out).toContain("html, body { background: transparent; }");
    // First in <head>, so anything the model wrote still overrides it.
    expect(out.indexOf("background: transparent")).toBeLessThan(out.indexOf("<p>Mine</p>"));
  });

  it("ships both palettes so a persisted widget can follow a later theme choice", () => {
    const out = renderHtml({ html: "<div>Hi</div>" }).html;

    expect(out).toContain('[data-theme="light"]');
    expect(out).toContain("--accent: #059669;");
  });

  it("declares a root color-scheme per theme, so the frame can stay transparent", () => {
    // A frame whose used color-scheme disagrees with its embedder's is given an
    // opaque canvas by the browser — the one thing background:transparent
    // cannot override. Both sides have to name the same scheme.
    const out = renderHtml({ html: "<div>Hi</div>" }).html;

    expect(out).toMatch(/:root \{[\s\S]*?color-scheme: dark;[\s\S]*?\}/);
    expect(out).toMatch(/:root\[data-theme="light"\] \{[\s\S]*?color-scheme: light;[\s\S]*?\}/);
  });

  it("keeps a full document intact but adds the CSP", () => {
    const html = "<html lang='en'><head><title>T</title></head><body><p>Complete</p></body></html>";
    const out = renderHtml({ html }).html;

    expect(out).toContain("<p>Complete</p>");
    expect(out).toContain("<title>T</title>");
    expect(out).toContain("Content-Security-Policy");
  });

  it("gives a document with no <head> one, so the CSP is parsed first", () => {
    const out = renderHtml({ html: "<html><body><p>No head here</p></body></html>" }).html;

    expect(out).toMatch(/<html><head><meta http-equiv="Content-Security-Policy"/);
  });

  it("blocks network access from the frame", () => {
    const out = renderHtml({ html: "<p>some content here</p>" }).html;

    expect(out).toContain("default-src 'none'");
    expect(out).toContain("connect-src 'none'");
    expect(out).toContain("form-action 'none'");
  });

  it("strips code fences the model wrapped around the source", () => {
    const spec = renderHtml({ html: "```html\n<p>Fenced content</p>\n```" });

    expect(spec.html).toContain("<p>Fenced content</p>");
    expect(spec.html).not.toContain("```");
  });

  it("removes nested frames and forms, and reports what it removed", () => {
    const spec = renderHtml({
      html: `<div>Keep this</div><iframe src="https://evil.test"></iframe><form action="/x"><input></form>`,
    });

    expect(spec.html).toContain("Keep this");
    expect(spec.html).not.toContain("<iframe");
    expect(spec.html).not.toContain("<form");
    expect(spec.warnings).toHaveLength(2);
    expect(spec.warnings.join(" ")).toContain("iframe");
  });

  it("drops http-equiv metas that could weaken the CSP or refresh the frame", () => {
    const spec = renderHtml({
      html: `<meta charset="utf-8"><meta http-equiv="refresh" content="0;url=https://evil.test"><p>Kept content</p>`,
    });

    expect(spec.html).not.toContain("refresh");
    expect(spec.html).toContain('<meta charset="utf-8">');
    expect(spec.html).toContain("<p>Kept content</p>");
    expect(spec.warnings.join(" ")).toContain("http-equiv");
  });

  it("removes a <base> tag that would retarget every relative URL", () => {
    const spec = renderHtml({ html: `<base href="https://evil.test/"><a href="/x">go</a>` });

    expect(spec.html).not.toContain("<base");
    expect(spec.warnings.join(" ")).toContain("base");
  });

  it("neutralises javascript: URLs", () => {
    const spec = renderHtml({ html: `<a href="javascript:alert(1)">click me</a>` });

    expect(spec.html).not.toContain("javascript:");
    expect(spec.html).toContain('href="#"');
    expect(spec.warnings.join(" ")).toContain("javascript:");
  });

  it("keeps inline scripts, which are what make the artifact interactive", () => {
    const spec = renderHtml({
      html: `<button id="b">Count</button><script>document.getElementById("b").onclick = () => {};</script>`,
    });

    expect(spec.html).toContain("<script>");
    expect(spec.html).toContain("onclick");
  });

  it("defaults the height and honours an explicit one", () => {
    expect(renderHtml({ html: "<p>default height</p>" }).height).toBe(420);
    expect(renderHtml({ html: "<p>explicit height</p>", height: 900 }).height).toBe(900);
  });

  it("stamps the light theme onto the document root, and leaves dark alone", () => {
    const doc = renderHtml({ html: "<p>themed content</p>" }).html;

    expect(withTheme(doc, "light")).toContain('<html data-theme="light"');
    // Dark needs no attribute — it is what :root already says. Checked on the
    // tag itself, since the stylesheet mentions the selector either way.
    expect(withTheme(doc, "dark")).toMatch(/<html lang="en">/);
  });

  it("repairs an old artifact that predates the root color-scheme", () => {
    // Documents already persisted in a transcript cannot be regenerated, so the
    // scheme has to be forced on at render time or they stay opaque forever.
    const legacy = `<!doctype html><html><head><style>input { color-scheme: dark; }</style></head><body><p>old</p></body></html>`;

    const out = withTheme(legacy, "light");
    // Last in <head>, so it wins over whatever the stored document declared.
    expect(out).toMatch(/color-scheme: light;[\s\S]*<\/head>/);
    expect(out.indexOf("color-scheme: light")).toBeGreaterThan(out.indexOf("input { color-scheme: dark; }"));
  });

  it("themes a model-authored document that brought its own <html> tag", () => {
    const doc = renderHtml({ html: "<html lang='en'><body><p>Mine</p></body></html>" }).html;

    expect(withTheme(doc, "light")).toContain(`<html data-theme="light" lang='en'>`);
  });

  it("rejects source that is empty once fences are removed", () => {
    expect(() => renderHtml({ html: "```html\n\n```" })).toThrow(ToolError);
  });

  it("rejects source that is empty once sanitised", () => {
    expect(() => renderHtml({ html: "<iframe src='https://evil.test'></iframe>" })).toThrow(
      ToolError,
    );
  });
});
