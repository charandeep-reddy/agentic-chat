"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChartView } from "./chart-view";
import { FlowView } from "./flow-view";
import { QuestionCard } from "./question-card";
import { DataTable } from "./data-table";
import { SettingsPanel } from "./settings-panel";
import { KEY_STORAGE, MODEL_STORAGE } from "./settings-panel";
import type { ChartSpec } from "@/lib/tools/render-chart";
import type { FlowSpec } from "@/lib/tools/render-flow";
import type { QuestionPayload } from "@/lib/tools/ask-question";
import type { ParsedTable } from "@/lib/tools/parse-data";
import type { FetchResult } from "@/lib/tools/fetch-url";

const SUGGESTIONS = [
  "Show me a chart from this data: Jan 120, Feb 210, Mar 175, Apr 290",
  "Fetch https://api.github.com/repos/anomalyco/opencode and summarize it",
  "Draw a flowchart of a customer support ticket lifecycle",
  "Help me compare bar vs line charts — when should I use each?",
];

const DEFAULT_MODEL = "deepseek-v4-flash";

function loadStorage(key: string): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key) ?? "";
}

function loadModel(): string {
  const stored = loadStorage(MODEL_STORAGE);
  if (stored.startsWith("openrouter/")) return DEFAULT_MODEL;
  return stored || DEFAULT_MODEL;
}

const TOOL_LABELS: Record<string, string> = {
  ask_user_question: "Asking you",
  render_chart: "Building chart",
  render_flow: "Rendering diagram",
  fetch_url: "Fetching URL",
  parse_data: "Parsing data",
};

function isToolPart(part: UIMessage["parts"][number]): part is Extract<UIMessage["parts"][number], { type: `tool-${string}` }> {
  return part.type.startsWith("tool-");
}

function ToolPartView({
  part,
  answeredQuestions,
  onAnswerQuestion,
}: {
  part: Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;
  answeredQuestions: Set<string>;
  onAnswerQuestion: (option: string) => void;
}) {
  const toolName = part.type.slice("tool-".length);
  const label = TOOL_LABELS[toolName] ?? toolName.replace(/_/g, " ");

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <span className="h-3 w-3 animate-pulse rounded-full bg-zinc-600" />
        <span className="text-xs text-zinc-400">{label}…</span>
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2">
        <span className="text-xs font-medium text-red-400">{label} failed</span>
        <p className="mt-1 font-mono text-xs text-red-300/80">{part.errorText}</p>
      </div>
    );
  }

  if (part.state !== "output-available" || part.output === undefined) return null;

  const output = part.output as Record<string, unknown> & { kind?: string };

  switch (toolName) {
    case "ask_user_question": {
      const payload = output as unknown as QuestionPayload;
      return (
        <QuestionCard payload={payload} answered={answeredQuestions.has(part.toolCallId)} onAnswer={onAnswerQuestion} />
      );
    }
    case "render_chart": {
      const spec = output as unknown as ChartSpec;
      return spec.kind === "chart" ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <ChartView spec={spec} />
        </div>
      ) : null;
    }
    case "render_flow": {
      const spec = output as unknown as FlowSpec;
      return spec.kind === "flow" ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          {spec.title && <p className="mb-2 text-sm font-medium text-zinc-300">{spec.title}</p>}
          <FlowView spec={spec} />
        </div>
      ) : null;
    }
    case "parse_data": {
      const table = output as unknown as ParsedTable;
      return table.kind === "table" ? <DataTable table={table} /> : null;
    }
    case "fetch_url": {
      const result = output as unknown as FetchResult;
      return (
        <details className="group rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
          <summary className="cursor-pointer text-xs text-zinc-300">
            Fetched <span className="font-mono text-emerald-400">{result.url}</span>{" "}
            <span className="text-zinc-600">· {result.status} · {result.contentType.split(";")[0]}</span>
            {result.truncated && <span className="ml-1 text-amber-400">(truncated)</span>}
          </summary>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-950 p-3 font-mono text-[11px] text-zinc-400">
            {result.text.slice(0, 4000)}
          </pre>
        </details>
      );
    }
    default:
      return (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-xs text-zinc-400">
          {toolName}: {JSON.stringify(output).slice(0, 500)}
        </div>
      );
  }
}

export function Chat() {
  const [apiKey, setApiKey] = useState(() => loadStorage(KEY_STORAGE));
  const [model, setModel] = useState(loadModel);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: apiKey ? { "x-openrouter-key": apiKey } : {},
        body: { model },
      }),
    [apiKey, model],
  );

  const { messages, sendMessage, status, error, stop } = useChat({ transport });

  const busy = status === "submitted" || status === "streaming";
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ role: "user", parts: [{ type: "text", text: trimmed }] });
    if (composerRef.current) composerRef.current.value = "";
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const handleKeyChange = (key: string) => {
    setApiKey(key);
    if (key) window.localStorage.setItem(KEY_STORAGE, key);
    else window.localStorage.removeItem(KEY_STORAGE);
  };

  const handleModelChange = (m: string) => {
    setModel(m);
    window.localStorage.setItem(MODEL_STORAGE, m);
  };

  const handleAnswerQuestion = (option: string) => {
    send(option);
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-zinc-900 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold tracking-tight text-zinc-100">Agentic Chat</h1>
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
            <div className="mt-16">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">Bring your key. Ask anything.</h2>
              <p className="mt-2 max-w-lg text-sm text-zinc-500">
                Your model, your data, rendered inline: charts, diagrams, tables and live fetches.
                {!apiKey && <span className="text-amber-400"> Connect an OpenCode API key to start.</span>}
              </p>
              <div className="mt-6 space-y-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={!apiKey || busy}
                    onClick={() => send(s)}
                    className="block w-full rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2.5 text-left text-sm text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <div key={message.id} className={message.role === "user" ? "flex justify-end" : ""}>
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
                            <ToolPartView
                              part={part}
                              answeredQuestions={answeredQuestions}
                              onAnswerQuestion={(option) => {
                                const questionPart = part;
                                setAnsweredQuestions((prev) => new Set(prev).add(questionPart.toolCallId));
                                handleAnswerQuestion(option);
                              }}
                            />
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              ))}

              {busy && (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  Working…
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
                  {error.message}
                  {!apiKey && " Add your OpenCode API key in Settings."}
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
            placeholder={apiKey ? "Ask anything — paste data, request a chart or a flow…" : "Add an API key to start chatting"}
            disabled={!apiKey || busy}
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
              className="shrink-0 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              disabled={!apiKey}
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
