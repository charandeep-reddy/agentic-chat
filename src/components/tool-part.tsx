"use client";

import { useState } from "react";
import type { UIMessage } from "ai";
import {
  IconAgent,
  IconBrain,
  IconChart,
  IconChevron,
  IconCode,
  IconFetch,
  IconFlow,
  IconQuestion,
  IconTable,
} from "./icons";
import type { ToolMeta } from "@/lib/tools";
import type { ChartSpec } from "@/lib/tools/render-chart";
import type { QuestionPayload } from "@/lib/tools/ask-question";
import type { ParsedTable } from "@/lib/tools/parse-data";
import type { FetchResult } from "@/lib/tools/fetch-url";

export type ToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

export function isToolPart(part: UIMessage["parts"][number]): part is ToolPart {
  return part.type.startsWith("tool-");
}

const TOOL_ICONS: Record<string, typeof IconChart> = {
  ask_user_question: IconQuestion,
  render_chart: IconChart,
  render_flow: IconFlow,
  render_html: IconCode,
  fetch_url: IconFetch,
  parse_data: IconTable,
  save_memory: IconBrain,
  search_memory: IconBrain,
  forget_memory: IconBrain,
};

/** One-line result summary shown on the collapsed chip. */
function outcome(output: unknown): string {
  const o = output as Record<string, unknown> | null;
  if (!o) return "";
  switch (o.kind) {
    case "chart":
      return `${String(o.type)} · ${(o.series as unknown[])?.length ?? (o.data as unknown[])?.length ?? 0} series`;
    case "flow":
      return String(o.type ?? "diagram");
    case "html":
      return `${Math.round(String(o.html).length / 1024)}kb`;
    case "table":
      return `${String(o.totalRows)} rows`;
    case "fetch":
      return `${String(o.status)} · ${String(o.contentType).split(";")[0]}`;
    case "question":
      return "asked";
    case "memory_saved":
      return o.alreadyKnown ? "already known" : "saved";
    case "memory_search":
      return `${(o.matches as unknown[])?.length ?? 0} matches`;
    case "memory_forgotten":
      return "forgotten";
    default:
      return "done";
  }
}

function formatDuration(ms?: number): string {
  if (ms === undefined) return "";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

/** Expanded detail lines — the interesting fields, not the whole payload. */
function summary(name: string, output: unknown): string[] {
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
    case "render_html": {
      const warnings = (o.warnings as string[]) ?? [];
      return [
        `${String(o.html).length} chars · ${String(o.height)}px tall`,
        ...warnings.map((w) => `⚠ ${w}`),
      ];
    }
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
      return [
        `${t.totalRows} rows · ${t.columns.length} columns`,
        t.columns.map((c) => `${c.name}:${c.type}`).join(" · "),
      ];
    }
    case "save_memory":
      return [String(o.content), `Category: ${String(o.category)}`];
    case "search_memory": {
      const matches = (o.matches as Array<{ content: string }>) ?? [];
      return matches.length > 0 ? matches.map((m) => `· ${m.content}`) : ["No matches."];
    }
    default:
      return [];
  }
}

/**
 * The trail of tool calls under an assistant message. Collapsed to chips by
 * default so the answer stays the focus; each chip expands in place.
 */
export function ToolChipRow({ parts }: { parts: ToolPart[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  if (parts.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {parts.map((part) => {
          const name = part.type.slice("tool-".length);
          const Icon = TOOL_ICONS[name] ?? IconAgent;
          const failed = part.state === "output-error";
          const pending = part.state === "input-streaming" || part.state === "input-available";
          const done = part.state === "output-available";
          const duration = done ? (part.output as { _meta?: ToolMeta })?._meta?.durationMs : undefined;
          const isOpen = expanded === part.toolCallId;

          return (
            <button
              key={part.toolCallId}
              type="button"
              disabled={pending}
              onClick={() => setExpanded(isOpen ? null : part.toolCallId)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                failed
                  ? "border-danger/40 bg-danger-soft text-danger hover:bg-danger/15"
                  : isOpen
                    ? "border-border-strong bg-surface-raised text-text-secondary"
                    : "border-border-subtle bg-surface/60 text-text-faint hover:border-border hover:text-text-secondary"
              } ${pending ? "cursor-default" : "cursor-pointer"}`}
            >
              <Icon size={12} />
              <span>{name}</span>
              {pending && <span className="animate-pulse">…</span>}
              {done && (
                <>
                  <span className="opacity-40">·</span>
                  <span className="opacity-80">{outcome(part.output)}</span>
                  {duration !== undefined && (
                    <span className="opacity-50">· {formatDuration(duration)}</span>
                  )}
                </>
              )}
              {failed && <span>failed</span>}
              {(done || failed) && (
                <IconChevron size={11} className={isOpen ? "rotate-180" : undefined} />
              )}
            </button>
          );
        })}
      </div>

      {expanded &&
        parts
          .filter((p) => p.toolCallId === expanded)
          .map((part) => {
            const name = part.type.slice("tool-".length);
            const output = part.output as Record<string, unknown> | null;
            const meta = output?._meta as ToolMeta | undefined;
            const lines =
              part.state === "output-error"
                ? [`Error: ${part.errorText}`]
                : summary(name, output ?? {});
            const clean = output
              ? Object.fromEntries(Object.entries(output).filter(([k]) => k !== "_meta"))
              : {};

            return (
              <div
                key={part.toolCallId}
                className="rounded-xl border border-border-subtle bg-surface/40 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-xs text-text-muted">
                    {name}
                    {meta && (
                      <span className="ml-2 text-text-faint">{formatDuration(meta.durationMs)}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowRaw((v) => !v)}
                    className="font-mono text-[11px] text-text-faint underline-offset-2 hover:text-text-secondary hover:underline"
                  >
                    {showRaw ? "summary" : "raw"}
                  </button>
                </div>
                {showRaw ? (
                  <pre className="scroll-thin max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-bg-elevated p-3 font-mono text-[11px] text-text-muted">
                    {JSON.stringify(clean, null, 2).slice(0, 4000)}
                  </pre>
                ) : (
                  <ul className="space-y-1">
                    {lines.map((line, i) => (
                      <li key={i} className="break-words text-xs text-text-muted">
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
    </div>
  );
}
