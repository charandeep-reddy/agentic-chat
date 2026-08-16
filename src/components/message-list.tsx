"use client";

import { memo, useState } from "react";
import type { UIMessage } from "ai";
import { Markdown } from "./markdown";
import { ChartWidget } from "./chart-view";
import { FlowWidget } from "./flow-view";
import { HtmlWidget } from "./html-view";
import { DataTable } from "./data-table";
import { QuestionCard } from "./question-card";
import { ToolChipRow, type ToolPart, isToolPart } from "./tool-part";
import { MemoryNotice } from "./memory-notice";
import { Skeleton } from "./skeleton";
import { messageModel, messagePartial, messageUsage } from "./conversation-cost";
import { usePrices } from "./use-prices";
import { estimateCost, formatCost, formatTokens } from "@/lib/usage";
import { IconAlert, IconCheck, IconCopy, IconEdit, IconLogo, IconPaperclip, IconRefresh } from "./icons";
import type { AttachmentSummary } from "@/lib/document";
import type { ChartSpec } from "@/lib/tools/render-chart";
import type { FlowSpec } from "@/lib/tools/render-flow";
import type { HtmlSpec } from "@/lib/tools/render-html";
import type { ParsedTable } from "@/lib/tools/parse-data";
import type { MemorySaved } from "@/lib/tools/memory";

function Widget({
  part,
  readOnly,
  questionAnswers,
  liveQuestion,
}: {
  part: ToolPart;
  readOnly: boolean;
  questionAnswers: Map<string, string>;
  liveQuestion: string | null;
}) {
  if (part.state !== "output-available" || part.output === undefined) return null;
  const name = part.type.slice("tool-".length);
  const output = part.output as Record<string, unknown> & { kind?: string };

  switch (name) {
    case "ask_user_question":
      // The one still waiting on the user is docked above the composer, not
      // left in the scrollback where it can drift out of view.
      if (!readOnly && liveQuestion === part.toolCallId) return null;
      return <QuestionCard payload={output} answer={questionAnswers.get(part.toolCallId) ?? null} />;
    case "render_chart":
      return output.kind === "chart" ? <ChartWidget spec={output as unknown as ChartSpec} /> : null;
    case "render_flow":
      return output.kind === "flow" ? <FlowWidget spec={output as unknown as FlowSpec} /> : null;
    case "render_html":
      return output.kind === "html" ? <HtmlWidget spec={output as unknown as HtmlSpec} /> : null;
    case "parse_data":
      return output.kind === "table" ? <DataTable table={output as unknown as ParsedTable} /> : null;
    case "save_memory":
      return output.kind === "memory_saved" ? (
        <MemoryNotice saved={output as unknown as MemorySaved} />
      ) : null;
    default:
      return null;
  }
}

function messageText(message: UIMessage): string {
  return message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy message"}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="rounded-md p-1.5 text-text-faint transition-colors hover:bg-surface hover:text-text"
    >
      {copied ? <IconCheck size={13} className="text-accent" /> : <IconCopy size={13} />}
    </button>
  );
}

/**
 * Memoized, along with `AssistantMessage` below.
 *
 * The transcript re-renders on every streamed token, so without this each token
 * re-rendered every earlier message: re-parsing their Markdown, re-running
 * Mermaid, and re-mounting nothing but still doing the work. A long
 * conversation got measurably slower the longer the answer ran.
 *
 * The AI SDK replaces message objects rather than mutating them, so a shallow
 * prop comparison is enough — only the message actually being streamed has a
 * new identity. The callbacks that come with it are stable by construction; see
 * `messagesRef` in `chat.tsx` for why that took work.
 */
const UserMessage = memo(function UserMessage({
  message,
  busy,
  readOnly,
  onEdit,
}: {
  message: UIMessage;
  busy: boolean;
  readOnly: boolean;
  onEdit: (id: string, text: string) => void;
}) {
  const text = messageText(message);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  const answerMeta = message.metadata as
    | {
        answerTo?: string;
        answerPicked?: boolean;
        attachments?: AttachmentSummary[];
        displayText?: string;
      }
    | undefined;
  const attachments = answerMeta?.attachments;
  // `text` is what was actually sent to the model — extracted document text
  // included. That's never what the bubble should show; with an attachment,
  // show only what was typed alongside it, and let the chip stand for the
  // rest. `displayText` can legitimately be "" (a document with no message).
  const shown = attachments?.length ? (answerMeta?.displayText ?? "") : text;
  // Transcripts written before a question could be answered in prose have no
  // `answerPicked`, and every answer they hold was picked from the list.
  const isPickedAnswer = Boolean(answerMeta?.answerTo) && answerMeta?.answerPicked !== false;
  if (isPickedAnswer) {
    return (
      <div className="flex justify-end">
        <div className="rounded-lg border border-border-subtle bg-surface/60 px-3 py-1.5">
          <span className="text-micro text-text-faint">
            answered: <span className="font-medium text-text-secondary">{text}</span>
          </span>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="flex justify-end">
        <div className="w-full max-w-[85%] rounded-2xl border border-accent/40 bg-surface p-2">
          <textarea
            autoFocus
            value={draft}
            rows={Math.min(10, draft.split("\n").length + 1)}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setDraft(text);
                setEditing(false);
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (draft.trim() && draft.trim() !== text) onEdit(message.id, draft.trim());
                setEditing(false);
              }
            }}
            className="w-full resize-none bg-transparent px-2 py-1 text-prose text-text focus:outline-none"
          />
          <div className="flex items-center justify-end gap-2 px-1 pt-1">
            <button
              type="button"
              onClick={() => {
                setDraft(text);
                setEditing(false);
              }}
              className="rounded-md px-2.5 py-1 text-dense text-text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draft.trim() || draft.trim() === text}
              onClick={() => {
                onEdit(message.id, draft.trim());
                setEditing(false);
              }}
              className="rounded-md bg-accent px-3 py-1 text-dense font-medium text-accent-text hover:brightness-110 disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex flex-col items-end gap-1">
      {attachments && attachments.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
          {attachments.map((a) => (
            <span
              key={a.name}
              title={
                a.hasUncapturedImages
                  ? `${a.name} may also contain images or charts not shown as text`
                  : a.name
              }
              className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-raised px-2 py-1 text-micro text-text-muted"
            >
              <IconPaperclip size={11} />
              <span className="max-w-[12rem] truncate">
                {a.name}
                {a.pageCount ? ` · ${a.pageCount}p` : ""}
              </span>
            </span>
          ))}
        </div>
      )}
      {shown && (
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-user-bubble-bg px-4 py-2.5 text-prose text-user-bubble-text">
          {shown}
        </div>
      )}
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <CopyButton text={text} />
        {!readOnly && !attachments?.length && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft(text);
              setEditing(true);
            }}
            aria-label="Edit and resend"
            className="rounded-md p-1.5 text-text-faint transition-colors hover:bg-surface hover:text-text disabled:opacity-30"
          >
            <IconEdit size={13} />
          </button>
        )}
      </div>
    </div>
  );
});

/**
 * What one turn cost, in the action row.
 *
 * Deliberately quiet: it sits with copy and regenerate at the same weight as
 * the rest of that row, and disappears entirely when the provider reported no
 * usage — which plenty of OpenAI-compatible endpoints do.
 */
function UsageNote({ message }: { message: UIMessage }) {
  const prices = usePrices();
  const usage = messageUsage(message);
  if (!usage) return null;

  const model = messageModel(message);
  const cost = model ? estimateCost(usage, prices[model]) : undefined;

  const detail = [
    usage.input !== undefined ? `${usage.input.toLocaleString()} in` : "",
    usage.output !== undefined ? `${usage.output.toLocaleString()} out` : "",
    usage.reasoning ? `${usage.reasoning.toLocaleString()} reasoning (of out)` : "",
    usage.cached ? `${usage.cached.toLocaleString()} cached (of in)` : "",
    model ?? "",
    cost === undefined && model ? "Set a price in Settings to estimate cost" : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <span title={detail} className="ml-1 font-mono text-micro text-text-faint">
      {formatTokens(usage.total ?? 0)} tok
      {cost !== undefined && <span className="ml-1.5">{formatCost(cost)}</span>}
    </span>
  );
}

const AssistantMessage = memo(function AssistantMessage({
  message,
  busy,
  isLast,
  readOnly,
  questionAnswers,
  liveQuestion,
  onRegenerate,
}: {
  message: UIMessage;
  busy: boolean;
  isLast: boolean;
  readOnly: boolean;
  questionAnswers: Map<string, string>;
  liveQuestion: string | null;
  onRegenerate: (id: string) => void;
}) {
  const toolParts = message.parts.filter(isToolPart);
  const text = messageText(message);
  // Gated on `!busy` too: a message can carry a stale `partial` from an
  // earlier interruption while a *different*, current turn is streaming.
  const interrupted = messagePartial(message) && !busy;

  return (
    <div className="group w-full space-y-3">
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          return (
            <Markdown key={i}>{part.text}</Markdown>
          );
        }
        if (isToolPart(part)) {
          return (
            <Widget
              key={part.toolCallId}
              part={part}
              readOnly={readOnly}
              questionAnswers={questionAnswers}
              liveQuestion={liveQuestion}
            />
          );
        }
        return null;
      })}

      {toolParts.length > 0 && <ToolChipRow parts={toolParts} />}

      {interrupted && (
        <div className="flex items-center gap-1.5 text-micro text-text-faint">
          <IconAlert size={12} className="shrink-0 text-accent" />
          Generation was interrupted — this reply may be incomplete.
        </div>
      )}

      {!busy && (
        <div
          className={`flex items-center gap-0.5 transition-opacity ${
            isLast ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100"
          }`}
        >
          {text && <CopyButton text={text} />}
          {!readOnly && (
            <button
              type="button"
              onClick={() => onRegenerate(message.id)}
              aria-label="Regenerate response"
              className="rounded-md p-1.5 text-text-faint transition-colors hover:bg-surface hover:text-text"
            >
              <IconRefresh size={13} />
            </button>
          )}
          <UsageNote message={message} />
        </div>
      )}
    </div>
  );
});

export function MessageList({
  messages,
  busy,
  waiting = false,
  readOnly = false,
  questionAnswers,
  liveQuestion,
  onEdit,
  onRegenerate,
}: {
  messages: UIMessage[];
  busy: boolean;
  /** Request sent, nothing streamed back yet — the gap worth filling. */
  waiting?: boolean;
  /** Public share view: render everything, offer nothing that mutates. */
  readOnly?: boolean;
  questionAnswers: Map<string, string>;
  liveQuestion: string | null;
  onEdit: (id: string, text: string) => void;
  onRegenerate: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      {messages.map((message, index) =>
        message.role === "user" ? (
          <UserMessage
            key={message.id}
            message={message}
            busy={busy}
            readOnly={readOnly}
            onEdit={onEdit}
          />
        ) : (
          <AssistantMessage
            key={message.id}
            message={message}
            busy={busy && index === messages.length - 1}
            isLast={index === messages.length - 1}
            readOnly={readOnly}
            questionAnswers={questionAnswers}
            liveQuestion={liveQuestion}
            onRegenerate={onRegenerate}
          />
        ),
      )}

      {/*
        Two different waits. Before the first chunk there is nothing on screen
        to show progress, so the reply's shape stands in for it. Once text is
        streaming the words are the feedback, and a skeleton underneath them
        would just be noise — the dot carries it from there.
      */}
      {waiting ? (
        <div className="space-y-2.5" role="status" aria-label="Waiting for a reply">
          <Skeleton className="h-3.5 w-[92%]" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-[64%]" />
        </div>
      ) : (
        busy && (
          <div role="status" className="flex items-center gap-2 text-dense text-text-faint">
            <IconLogo size={14} pulse className="text-accent" />
            Working…
          </div>
        )
      )}

      <StreamAnnouncer messages={messages} busy={busy || waiting} />
    </div>
  );
}

/**
 * Announces the answer to a screen reader, which otherwise gets nothing at all
 * — the transcript is an ordinary div and text arriving into it is silent.
 *
 * The finished answer is announced once rather than each token as it lands: a
 * live region fed a stream repeats itself constantly and is unusable. So the
 * region says only that work is happening while it streams, then reads the
 * result when it settles.
 */
function StreamAnnouncer({ messages, busy }: { messages: UIMessage[]; busy: boolean }) {
  const last = messages[messages.length - 1];
  const finished = !busy && last?.role === "assistant" ? messageText(last) : "";

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {busy ? "Generating a response" : finished}
    </div>
  );
}
