"use client";

import { memo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { IconCheck, IconCopy } from "./icons";

/**
 * Syntax highlighting, for fenced blocks that name their language.
 *
 * Language guessing is deliberately left off. Highlighting arrives a token at a
 * time here, so a block is re-highlighted on every keystroke of the stream, and
 * a guess made from a half-written block changes as the rest arrives — the
 * colours would flicker between languages while the model typed. A fence with
 * no language stays plain, which is also what it means.
 *
 * Declared at module scope: passing a new array to `rehypePlugins` on every
 * render would rebuild the whole pipeline for each streamed token.
 */
const REHYPE_PLUGINS = [rehypeHighlight];
const REMARK_PLUGINS = [remarkGfm];

/** Pulls the raw text out of a `<pre>`'s children for the copy button. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && "props" in node) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const source = textOf(children);

  return (
    <div className="group/code relative">
      <pre>{children}</pre>
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy code"}
        onClick={() => {
          void navigator.clipboard.writeText(source).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          });
        }}
        className="absolute right-2 top-2 rounded-md border border-border-subtle bg-bg-elevated p-1.5 text-text-faint opacity-0 transition-opacity hover:text-text focus-visible:opacity-100 group-hover/code:opacity-100"
      >
        {copied ? <IconCheck size={13} className="text-accent" /> : <IconCopy size={13} />}
      </button>
    </div>
  );
}

/**
 * Assistant prose. Links open in a new tab with `noreferrer`, since their
 * targets come from model output rather than from the app.
 */
export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
