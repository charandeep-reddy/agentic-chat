"use client";

import { useState } from "react";
import type { UIMessage } from "ai";
import { Markdown } from "./markdown";
import { ChartWidget } from "./chart-view";
import { FlowWidget } from "./flow-view";
import { HtmlWidget } from "./html-view";
import { DataTable } from "./data-table";
import { QuestionCard, type QuestionState } from "./question-card";
import { ToolChipRow, type ToolPart, isToolPart } from "./tool-part";
import { MemoryNotice } from "./memory-notice";
import { Skeleton } from "./skeleton";
import { messageModel, messageUsage } from "./conversation-cost";
import { usePrices } from "./use-prices";
import { estimateCost, formatCost, formatTokens } from "@/lib/usage";
import { IconCheck, IconCopy, IconEdit, IconRefresh } from "./icons";
import type { ChartSpec } from "@/lib/tools/render-chart";
import type { FlowSpec } from "@/lib/tools/render-flow";
import type { HtmlSpec } from "@/lib/tools/render-html";
import type { QuestionPayload } from "@/lib/tools/ask-question";
import type { ParsedTable } from "@/lib/tools/parse-data";
import type { MemorySaved } from "@/lib/tools/memory";

function Widget({
  part,
  readOnly,
  answeredQuestions,
  onAnswerQuestion,
}: {
  part: ToolPart;
  readOnly: boolean;
  answeredQuestions: Set<string>;
  onAnswerQuestion: (option: string, toolCallId: string) => void;
}) {
  if (part.state !== "output-available" || part.output === undefined) return null;
  const name = part.type.slice("tool-".length);
  const output = part.output as Record<string, unknown> & { kind?: string };

  switch (name) {
    case "ask_user_question": {
      const state: QuestionState =
        readOnly || answeredQuestions.has(part.toolCallId) ? "answered" : "pending";
      return (
        <QuestionCard
          payload={output as unknown as QuestionPayload}
          state={state}
          onAnswer={(option) => onAnswerQuestion(option, part.toolCallId)}
          onTypedAnswer={(text) => onAnswerQuestion(text, part.toolCallId)}
        />
      );
    }
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

function UserMessage({
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

  const isAnswer = Boolean((message.metadata as { answerTo?: string } | undefined)?.answerTo);
  if (isAnswer) {
    return (
      <div className="flex justify-end">
        <div className="rounded-lg border border-border-subtle bg-surface/60 px-3 py-1.5">
          <span className="text-[11px] text-text-faint">
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
            className="w-full resize-none bg-transparent px-2 py-1 text-sm text-text focus:outline-none"
          />
          <div className="flex items-center justify-end gap-2 px-1 pt-1">
            <button
              type="button"
              onClick={() => {
                setDraft(text);
                setEditing(false);
              }}
              className="rounded-md px-2.5 py-1 text-xs text-text-muted hover:text-text"
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
              className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-text hover:brightness-110 disabled:opacity-40"
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
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-accent-text">
        {text}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <CopyButton text={text} />
        {!readOnly && (
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
}

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
    <span title={detail} className="ml-1 font-mono text-[11px] text-text-faint">
      {formatTokens(usage.total ?? 0)} tok
      {cost !== undefined && <span className="ml-1.5">{formatCost(cost)}</span>}
    </span>
  );
}

function AssistantMessage({
  message,
  busy,
  isLast,
  readOnly,
  answeredQuestions,
  onAnswerQuestion,
  onRegenerate,
}: {
  message: UIMessage;
  busy: boolean;
  isLast: boolean;
  readOnly: boolean;
  answeredQuestions: Set<string>;
  onAnswerQuestion: (option: string, toolCallId: string) => void;
  onRegenerate: (id: string) => void;
}) {
  const toolParts = message.parts.filter(isToolPart);
  const text = messageText(message);

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
              answeredQuestions={answeredQuestions}
              onAnswerQuestion={onAnswerQuestion}
            />
          );
        }
        return null;
      })}

      {toolParts.length > 0 && <ToolChipRow parts={toolParts} />}

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
}

export function MessageList({
  messages,
  busy,
  waiting = false,
  readOnly = false,
  answeredQuestions,
  onAnswerQuestion,
  onEdit,
  onRegenerate,
}: {
  messages: UIMessage[];
  busy: boolean;
  /** Request sent, nothing streamed back yet — the gap worth filling. */
  waiting?: boolean;
  /** Public share view: render everything, offer nothing that mutates. */
  readOnly?: boolean;
  answeredQuestions: Set<string>;
  onAnswerQuestion: (option: string, toolCallId: string) => void;
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
            answeredQuestions={answeredQuestions}
            onAnswerQuestion={onAnswerQuestion}
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
          <div className="flex items-center gap-2 text-xs text-text-faint">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            Working…
          </div>
        )
      )}
    </div>
  );
}
