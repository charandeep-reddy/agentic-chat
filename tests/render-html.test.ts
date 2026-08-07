import { describe, expect, it } from "vitest";
import { renderHtml } from "@/lib/tools/render-html";
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

  it("rejects source that is empty once fences are removed", () => {
    expect(() => renderHtml({ html: "```html\n\n```" })).toThrow(ToolError);
  });

  it("rejects source that is empty once sanitised", () => {
    expect(() => renderHtml({ html: "<iframe src='https://evil.test'></iframe>" })).toThrow(
      ToolError,
    );
  });
});
