"use client";

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { IconCheck, IconCopy, IconExpand } from "./icons";
import { WidgetAction } from "./widget-shell";
import { useMenu } from "./use-menu";

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
 * How deep inside quoted blocks we are.
 *
 * A top-level quote is a draft — something written to be taken somewhere else —
 * and gets the card. A quote nested inside one is a quotation within that
 * draft, and keeps the plain bar. Without this, a card would appear inside a
 * card and claim the inner text was a second deliverable.
 */
const QuoteDepthContext = createContext(0);

/**
 * A quoted block. Top level is a draft and gets the card; anything nested
 * inside one is a quotation within that draft and keeps the plain bar.
 *
 * Split from the card rather than returning early inside it: an early return
 * between the hooks and the values derived from them is what stops the compiler
 * preserving their memoization.
 */
function Quote({ children }: { children?: ReactNode }) {
  const depth = useContext(QuoteDepthContext);
  if (depth > 0) return <blockquote>{children}</blockquote>;
  return <QuoteCard depth={depth}>{children}</QuoteCard>;
}

/**
 * A drafted block: a post, an email, a message meant to leave the app.
 *
 * Presented as a card rather than as an indented aside, because that is what it
 * is. The old treatment borrowed the typographic convention for quotation —
 * muted text behind a rule — which reads as something being referred to rather
 * than something being handed over.
 *
 * Copying takes the element's text rather than its Markdown: this block is on
 * its way to a social box or a mail client, both of which want exactly what is
 * on screen and neither of which understands an asterisk.
 */
function QuoteCard({ depth, children }: { depth: number; children?: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setExpanded(false), []);
  const overlayRef = useMenu<HTMLDivElement>({ open: expanded, onClose: close, trap: true });

  const copy = () => {
    const text = bodyRef.current?.innerText ?? "";
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  const controls = (
    <>
      <WidgetAction onClick={copy} label={copied ? "Copied" : "Copy text"}>
        {copied ? <IconCheck size={14} className="text-accent" /> : <IconCopy size={14} />}
      </WidgetAction>
      <WidgetAction onClick={() => setExpanded((v) => !v)} label={expanded ? "Collapse" : "Expand"}>
        <IconExpand size={14} />
      </WidgetAction>
    </>
  );

  const body = (
    <QuoteDepthContext.Provider value={depth + 1}>
      <div ref={bodyRef}>{children}</div>
    </QuoteDepthContext.Provider>
  );

  return (
    <>
      <blockquote className="quote-card group/quote relative overflow-hidden rounded-xl bg-surface/60">
        {/*
          Mounted here or in the overlay, never both. They share one ref, and
          React nulls it when the second copy unmounts — so a card that had been
          expanded and closed would have nothing left to copy from.
        */}
        {expanded ? null : body}
        {/*
          Revealed on hover for a mouse, always present for a finger. There is
          no hover on a touch screen, so the controls would simply not exist
          there — the same reason `pointer-fine:` guards the keyboard hints.
        */}
        <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-lg border border-border-subtle bg-bg-elevated/90 p-0.5 opacity-0 backdrop-blur transition-opacity focus-within:opacity-100 group-hover/quote:opacity-100 pointer-coarse:opacity-100">
          {controls}
        </div>
      </blockquote>

      {expanded && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex flex-col bg-black/80 p-2 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Drafted text"
        >
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface">
            <header className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-3 py-2">
              <div className="ml-auto flex items-center gap-1">
                {controls}
                <button
                  type="button"
                  onClick={close}
                  className="rounded-md px-2 py-1 text-dense text-text-muted hover:bg-surface-raised hover:text-text"
                >
                  Close{" "}
                  <kbd className="ml-1 hidden font-mono text-micro pointer-fine:inline">esc</kbd>
                </button>
              </div>
            </header>
            <div className="markdown scroll-thin min-h-0 flex-1 overflow-auto px-5 py-4">
              {body}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** The renderer itself, without the wrapper — reused for edited quotes. */
function MarkdownBody({ children }: { children: string }) {
  return (
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          blockquote: ({ children }) => <Quote>{children}</Quote>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
  );
}

/**
 * Assistant prose. Links open in a new tab with `noreferrer`, since their
 * targets come from model output rather than from the app.
 */
export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <MarkdownBody>{children}</MarkdownBody>
    </div>
  );
});
