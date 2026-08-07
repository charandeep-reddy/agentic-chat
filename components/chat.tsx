"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { z } from "zod";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChartWidget } from "./chart-view";
import { FlowWidget } from "./flow-view";
import { QuestionCard } from "./question-card";
import type { QuestionState } from "./question-card";
import { DataTable } from "./data-table";
import { SettingsPanel } from "./settings-panel";
import { KEY_STORAGE, MODEL_STORAGE } from "./settings-panel";
import { getStorage, setStorage, removeStorage, subscribeStorage } from "@/lib/local-storage";
import { IconAgent, IconChart, IconChevron, IconFetch, IconFlow, IconKey, IconQuestion, IconSpark, IconStop, IconTable } from "./icons";
import type { ChartSpec } from "@/lib/tools/render-chart";
import type { FlowSpec } from "@/lib/tools/render-flow";
import type { QuestionPayload } from "@/lib/tools/ask-question";
import type { ParsedTable } from "@/lib/tools/parse-data";
import type { FetchResult } from "@/lib/tools/fetch-url";
import type { ToolMeta } from "@/lib/tools";

const SUGGESTIONS = [
  "Show me a chart from this data: Jan 120, Feb 210, Mar 175, Apr 290",
  "Fetch https://api.github.com/repos/anomalyco/opencode and summarize it",
  "Draw a flowchart of a customer support ticket lifecycle",
  "Help me compare bar vs line charts — when should I use each?",
];

const DEFAULT_MODEL = "deepseek-v4-flash";

type ToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

function isToolPart(part: UIMessage["parts"][number]): part is ToolPart {
  return part.type.startsWith("tool-");
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  ask_user_question: <IconQuestion size={13} />,
  render_chart: <IconChart size={13} />,
  render_flow: <IconFlow size={13} />,
  fetch_url: <IconFetch size={13} />,
  parse_data: <IconTable size={13} />,
};

function toolIcon(name: string): React.ReactNode {
  return TOOL_ICONS[name] ?? <IconAgent size={13} />;
}

function toolOutcome(output: unknown): string {
  const o = output as Record<string, unknown> | null;
  if (!o) return "";
  switch (o.kind) {
    case "chart":
      return `${String(o.type)} · ${(o.series as unknown[] | undefined)?.length ?? (o.data as unknown[] | undefined)?.length ?? 0} series`;
    case "flow":
      return String(o.type ?? "diagram");
    case "table":
      return `${String(o.totalRows)} rows · ${String((o.columns as unknown[] | undefined)?.length ?? 0)} cols`;
    case "fetch":
      return `${String(o.status)} · ${String((o.contentType as string).split(";")[0])}`;
    case "question":
      return "asked";
    default:
      return "done";
  }
}

function formatDuration(ms?: number): string {
  if (ms === undefined) return "";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function toolSummary(name: string, output: unknown): string[] {
  const o = output as Record<string, unknown> | null;
  if (!o) return [];
  switch (name) {
    case "ask_user_question": {
      const q = o as unknown as QuestionPayload;
      return [`Asked: "${q.question}"`, `Options: ${q.options.join(" · ")}`];
    }
    case "render_chart": {
      const s = o as unknown as ChartSpec;
      return [
        s.title ? `Title: ${s.title}` : "",
        s.type === "pie"
          ? `${s.data?.length ?? 0} slices`
          : `${s.series?.length ?? 0} series · ${s.xLabels?.length ?? 0} points`,
      ].filter(Boolean);
    }
    case "render_flow":
      return [`Type: ${String(o.type)}`];
    case "fetch_url": {
      const r = o as unknown as FetchResult;
      return [
        `URL: ${r.url}`,
        `Status: ${r.status} · ${r.contentType.split(";")[0]}`,
        `${r.text.length} chars${r.truncated ? " (truncated)" : ""}`,
      ];
    }
    case "parse_data": {
      const t = o as unknown as ParsedTable;
      return [`${t.totalRows} rows · ${t.columns.length} columns`, t.columns.map((c) => `${c.name}:${c.type}`).join(" · ")];
    }
    default:
      return [];
  }
}

function ToolChipRow({ parts }: { parts: ToolPart[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  if (parts.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {parts.map((part) => {
          const name = part.type.slice("tool-".length);
          const failed = part.state === "output-error";
          const pending = part.state === "input-streaming" || part.state === "input-available";
          const done = part.state === "output-available";
          const duration = done && part.output ? ((part.output as { _meta?: ToolMeta })._meta?.durationMs ?? undefined) : undefined;
          const expandedHere = expanded === part.toolCallId;

          return (
            <button
              key={part.toolCallId}
              type="button"
              disabled={pending || (!done && !failed)}
              onClick={() => setExpanded(expandedHere ? null : part.toolCallId)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                failed
                  ? "border-red-500/40 bg-red-500/5 text-red-400 hover:bg-red-500/10"
                  : expandedHere
                    ? "border-zinc-600 bg-zinc-800/80 text-zinc-200"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
              } ${pending ? "cursor-default" : "cursor-pointer"}`}
            >
              {toolIcon(name)}
              <span>{name}</span>
              {pending && <span className="animate-pulse text-zinc-500">…</span>}
              {done && (
                <>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-500">{toolOutcome(part.output)}</span>
                  {duration !== undefined && <span className="text-zinc-600">· {formatDuration(duration)}</span>}
                </>
              )}
              {failed && <span>failed</span>}
              {(done || failed) && <IconChevron size={11} className={`transition-transform ${expandedHere ? "rotate-180" : ""}`} />}
            </button>
          );
        })}
      </div>

      {expanded && (
        <div className="rounded-xl border border-zinc-800 bg-white/[0.02] p-3">
          {parts
            .filter((p) => p.toolCallId === expanded)
            .map((part) => {
              const name = part.type.slice("tool-".length);
              const output = part.output as Record<string, unknown> | null;
              const meta = output?._meta as ToolMeta | undefined;
              const lines = part.state === "output-error" ? [`Error: ${part.errorText}`] : toolSummary(name, output ?? {});
              const cleanOutput = output
                ? Object.fromEntries(Object.entries(output).filter(([k]) => k !== "_meta"))
                : {};

              return (
                <div key={part.toolCallId} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-zinc-400">
                      {name}
                      {meta && <span className="ml-2 text-zinc-600">{formatDuration(meta.durationMs)}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowRaw((v) => !v)}
                      className="font-mono text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
                    >
                      {showRaw ? "summary" : "raw"}
                    </button>
                  </div>
                  {showRaw ? (
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-950 p-3 font-mono text-[11px] text-zinc-400">
                      {JSON.stringify(cleanOutput, null, 2).slice(0, 4000)}
                    </pre>
                  ) : (
                    <ul className="space-y-1">
                      {lines.map((line, i) => (
                        <li key={i} className="break-words text-xs text-zinc-400">
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

function WidgetView({
  part,
  answeredQuestions,
  onAnswerQuestion,
}: {
  part: ToolPart;
  answeredQuestions: Set<string>;
  onAnswerQuestion: (option: string, toolCallId: string) => void;
}) {
  const name = part.type.slice("tool-".length);
  if (part.state === "output-error") return null;
  if (part.state !== "output-available" || part.output === undefined) return null;

  const output = part.output as Record<string, unknown> & { kind?: string };

  switch (name) {
    case "ask_user_question": {
      const payload = output as unknown as QuestionPayload;
      const state: QuestionState = answeredQuestions.has(part.toolCallId) ? "answered" : "pending";
      return (
        <QuestionCard
          payload={payload}
          state={state}
          onAnswer={(option) => onAnswerQuestion(option, part.toolCallId)}
          onTypedAnswer={(text) => onAnswerQuestion(text, part.toolCallId)}
        />
      );
    }
    case "render_chart": {
      const spec = output as unknown as ChartSpec;
      return spec.kind === "chart" ? <ChartWidget spec={spec} /> : null;
    }
    case "render_flow": {
      const spec = output as unknown as FlowSpec;
      return spec.kind === "flow" ? <FlowWidget spec={spec} /> : null;
    }
    case "parse_data": {
      const table = output as unknown as ParsedTable;
      return table.kind === "table" ? <DataTable table={table} /> : null;
    }
    default:
      return null;
  }
}

function EmptyState({
  hasKey,
  busy,
  onSend,
  onOpenSettings,
}: {
  hasKey: boolean;
  busy: boolean;
  onSend: (text: string) => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="mt-14 flex flex-col items-center text-center">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
        <IconSpark size={22} />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">Bring your key. Ask anything.</h2>
      <p className="mt-2 max-w-lg text-sm text-zinc-500">
        Your model, your data — charts, diagrams, tables and live fetches, rendered inline in the chat.
      </p>

      {!hasKey && (
        <div className="mt-8 grid w-full max-w-xl gap-3 sm:grid-cols-3">
          {[
            { n: "1", t: "Get a key", d: "OpenCode Go key from ~/.local/share/opencode/auth.json" },
            { n: "2", t: "Paste it", d: "Stored in your browser only — never on the server" },
            { n: "3", t: "Pick a model", d: "deepseek-v4-flash is pre-selected" },
          ].map((s) => (
            <div key={s.n} className="rounded-xl border border-zinc-800 bg-white/[0.02] p-4 text-left">
              <span className="font-mono text-[11px] text-emerald-400">{s.n}</span>
              <p className="mt-1 text-[13px] font-medium text-zinc-200">{s.t}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{s.d}</p>
            </div>
          ))}
        </div>
      )}

      {!hasKey ? (
        <button
          type="button"
          onClick={onOpenSettings}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-zinc-950 hover:bg-emerald-500"
        >
          <IconKey size={15} />
          Connect your key
        </button>
      ) : (
        <div className="mt-8 grid w-full max-w-xl gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => onSend(s)}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2.5 text-left text-[13px] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Chat() {
  const apiKey = useSyncExternalStore(
    (cb) => subscribeStorage(KEY_STORAGE, cb),
    () => getStorage(KEY_STORAGE),
    () => "",
  );
  const storedModel = useSyncExternalStore(
    (cb) => subscribeStorage(MODEL_STORAGE, cb),
    () => getStorage(MODEL_STORAGE),
    () => "",
  );
  const model = storedModel.startsWith("openrouter/") ? DEFAULT_MODEL : storedModel || DEFAULT_MODEL;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (storedModel.startsWith("openrouter/")) setStorage(MODEL_STORAGE, DEFAULT_MODEL);
  }, [storedModel]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: apiKey ? { "x-openrouter-key": apiKey } : {},
        body: { model },
      }),
    [apiKey, model],
  );

  const { messages, sendMessage, status, error, stop } = useChat({
    transport,
    messageMetadataSchema: z.object({ answerTo: z.string().optional() }),
  });

  const busy = status === "submitted" || status === "streaming";
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const pendingQuestion = (() => {
    for (const message of messages) {
      for (const part of message.parts) {
        if (!isToolPart(part)) continue;
        if (part.type !== "tool-ask_user_question") continue;
        if (part.state !== "output-available") continue;
        if (answeredQuestions.has(part.toolCallId)) continue;
        return { toolCallId: part.toolCallId, question: (part.output as QuestionPayload).question };
      }
    }
    return null;
  })();

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy || pendingQuestion) return;
    void sendMessage({ role: "user", parts: [{ type: "text", text: trimmed }] });
    if (composerRef.current) composerRef.current.value = "";
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const handleKeyChange = (key: string) => {
    if (key) setStorage(KEY_STORAGE, key);
    else removeStorage(KEY_STORAGE);
  };

  const handleModelChange = (m: string) => {
    setStorage(MODEL_STORAGE, m);
  };

  const handleAnswerQuestion = (option: string, toolCallId: string) => {
    setAnsweredQuestions((prev) => new Set(prev).add(toolCallId));
    void sendMessage({
      role: "user",
      parts: [{ type: "text", text: option }],
      metadata: { answerTo: toolCallId },
    });
  };

  const composerPlaceholder = pendingQuestion
    ? "Awaiting your answer — pick an option or type below"
    : apiKey
      ? "Ask anything — paste data, request a chart or a flow…"
      : "Add an API key to start chatting";

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-zinc-900 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-100">
            <IconSpark size={15} className="text-emerald-400" />
            Agentic Chat
          </h1>
          <span className="font-mono text-[11px] text-zinc-600">{model}</span>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
            apiKey
              ? "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
              : "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
          }`}
        >
          {apiKey ? "● Connected" : "○ Add API key"}
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {messages.length === 0 ? (
            <EmptyState hasKey={apiKey !== ""} busy={busy} onSend={send} onOpenSettings={() => setSettingsOpen(true)} />
          ) : (
            <div className="space-y-6">
              {messages.map((message) => {
                const isAnswerLine = message.role === "user" && Boolean((message.metadata as { answerTo?: string } | undefined)?.answerTo);
                const toolParts = message.parts.filter(isToolPart);

                return (
                  <div key={message.id} className={message.role === "user" ? "flex justify-end" : ""}>
                    {isAnswerLine ? (
                      <div className="rounded-lg border border-zinc-800/70 bg-white/[0.02] px-3 py-1.5">
                        <span className="text-[11px] text-zinc-500">
                          answered: <span className="font-medium text-zinc-300">{message.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}</span>
                        </span>
                      </div>
                    ) : (
                      <div
                        className={
                          message.role === "user"
                            ? "max-w-[85%] rounded-2xl rounded-br-sm bg-emerald-600 px-4 py-2.5 text-sm text-zinc-950"
                            : "w-full space-y-3"
                        }
                      >
                        {message.parts.map((part, i) => {
                          if (part.type === "text") {
                            return message.role === "user" ? (
                              <p key={i} className="whitespace-pre-wrap">
                                {part.text}
                              </p>
                            ) : (
                              <div key={i} className="markdown">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
                              </div>
                            );
                          }
                          if (isToolPart(part)) {
                            return (
                              <div key={i}>
                                <WidgetView
                                  part={part}
                                  answeredQuestions={answeredQuestions}
                                  onAnswerQuestion={handleAnswerQuestion}
                                />
                              </div>
                            );
                          }
                          return null;
                        })}
                        {toolParts.length > 0 && <ToolChipRow parts={toolParts} />}
                      </div>
                    )}
                  </div>
                );
              })}

              {busy && (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  Working…
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
                  {error.message}
                  {!apiKey && " Add your OpenCode API key in Settings."}
                  {apiKey && (
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(true)}
                      className="ml-auto shrink-0 rounded-md border border-red-500/40 px-2.5 py-1 text-xs hover:bg-red-500/10"
                    >
                      Open settings
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-zinc-900 bg-zinc-950/95 px-4 py-3">
        <div className="mx-auto flex max-w-3xl gap-2">
          <textarea
            ref={composerRef}
            placeholder={composerPlaceholder}
            disabled={!apiKey || busy || Boolean(pendingQuestion)}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(e.currentTarget.value);
              }
            }}
            className="max-h-40 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => stop()}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              <IconStop size={14} />
              Stop
            </button>
          ) : (
            <button
              type="button"
              disabled={!apiKey || Boolean(pendingQuestion)}
              onClick={() => send(composerRef.current?.value ?? "")}
              className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-zinc-950 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send
            </button>
          )}
        </div>
      </div>

      <SettingsPanel
        apiKey={apiKey}
        model={model}
        onKeyChange={handleKeyChange}
        onModelChange={handleModelChange}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
