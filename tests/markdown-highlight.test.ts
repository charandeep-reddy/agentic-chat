import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "@/components/markdown";

/**
 * Rendered through the real component rather than the plugin alone, so the test
 * covers the wiring too — a `rehypePlugins` prop that never reached
 * `ReactMarkdown` would still pass a test that called `rehype-highlight`
 * directly.
 *
 * Written with `createElement` because the test glob only picks up `.ts`.
 */
function render(markdown: string): string {
  return renderToStaticMarkup(createElement(Markdown, null, markdown));
}

const fence = (lang: string, code: string) => ["```" + lang, code, "```"].join("\n");

describe("markdown syntax highlighting", () => {
  it("marks up a fenced block that names its language", () => {
    const html = render(fence("ts", `const answer: number = 42; // sure`));

    expect(html).toContain("language-ts");
    expect(html).toContain("hljs-keyword"); // const
    expect(html).toContain("hljs-number"); // 42
    expect(html).toContain("hljs-comment"); // // sure
  });

  it("highlights the languages a chat actually produces", () => {
    for (const [lang, code] of [
      ["python", "def go(x):\n    return x + 1"],
      ["sql", "select id from chat where archived = false"],
      ["json", '{ "a": 1 }'],
      ["bash", "echo hi"],
      ["css", ".a { color: red; }"],
    ] as const) {
      expect(render(fence(lang, code)), lang).toContain("hljs-");
    }
  });

  it("leaves a fence with no language alone", () => {
    // Guessing would re-decide the language as more of the block streamed in,
    // so an unlabelled block stays plain rather than flickering between them.
    const html = render(["```", "const answer = 42;", "```"].join("\n"));
    expect(html).not.toContain("hljs-keyword");
  });

  it("does not highlight inline code", () => {
    const html = render("Use the `const` keyword.");
    expect(html).not.toContain("hljs-keyword");
    expect(html).toContain("<code>const</code>");
  });

  it("escapes markup inside a code block", () => {
    // The block is model output, and highlighting rebuilds it as elements —
    // so the escaping has to survive that rebuild. Asserted as "no live markup
    // anywhere" rather than against one escaped string, because highlighting
    // splits the tag across spans (`&lt;` then `img`).
    const html = render(fence("html", '<img src=x onerror="alert(1)">'));
    expect(html).not.toMatch(/<img|onerror=/);
    expect(html).toContain("&lt;");
    expect(html).toContain("alert(1)");
  });

  it("keeps the copy button's source as the plain text of the block", () => {
    // The button reads `textOf(children)`, which now walks highlight spans
    // rather than a single string — the copied text must not gain markup.
    const html = render(fence("ts", "const a = 1;"));
    const text = html.replace(/<[^>]*>/g, "");
    expect(text).toContain("const a = 1;");
  });
});
