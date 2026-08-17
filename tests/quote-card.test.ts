import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "@/components/chat/markdown";

const render = (markdown: string) => renderToStaticMarkup(createElement(Markdown, null, markdown));

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("quoted drafts", () => {
  it("gives a top-level quote a card and its controls", () => {
    const html = render("> a drafted post");
    expect(html).toContain("quote-card");
    expect(html).toContain('aria-label="Copy text"');
    expect(html).toContain('aria-label="Expand"');
  });

  it("leaves ordinary prose alone", () => {
    const html = render("just a paragraph");
    expect(html).not.toContain("quote-card");
    expect(html).not.toContain("Copy text");
  });

  it("keeps a nested quote a quotation rather than a second card", () => {
    // A card inside a card would claim the inner text is a second deliverable,
    // when it is a quotation inside the draft.
    const html = render("> outer draft\n>\n> > an inner quotation");
    expect(count(html, "quote-card")).toBe(1);
    expect(count(html, 'aria-label="Copy text"')).toBe(1);
  });

  it("renders one blockquote element per quote level", () => {
    // One element per level, so a card never doubles up its own container.
    expect(count(render("> one level"), "<blockquote")).toBe(1);
    expect(count(render("> outer\n>\n> > inner"), "<blockquote")).toBe(2);
  });

  it("renders the quote's content, formatting and all", () => {
    // The card shows rendered Markdown, never its source — `*italic*` must not
    // survive as asterisks.
    const html = render("> **bold** and *italic* text");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).not.toContain("*italic*");
  });

  it("keeps list structure inside a draft", () => {
    const html = render("> intro\n>\n> 1. first\n> 2. second");
    expect(html).toContain("<ol");
    expect(count(html, "<li")).toBe(2);
  });
});
