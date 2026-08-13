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
  IconSpark,
  IconTable,
} from "./icons";
import type { ToolMeta } from "@/lib/tools";
import type { ChartSpec } from "@/lib/tools/render-chart";
import { questionsOf } from "@/lib/tools/ask-question";
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
  load_skill: IconSpark,
  read_skill_resource: IconSpark,
};

/**
 * The site a fetch touched, which is the part a reader actually needs. A full
 * URL is long, usually ugly, and pushes every other chip off the line — the
 * whole thing stays available as the link target and the tooltip.
 */
function hostOf(raw: unknown): string {
  if (typeof raw !== "string") return "";
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** The URL a fetch part is about, whether it's still in flight or finished. */
function urlOf(part: ToolPart): string {
  const fromInput = (part.input as { url?: unknown } | null)?.url;
  if (typeof fromInput === "string") return fromInput;
  const fromOutput = (part.output as { url?: unknown } | null)?.url;
  return typeof fromOutput === "string" ? fromOutput : "";
}

function formatSize(chars: number): string {
  return chars >= 1024 ? `${Math.round(chars / 1024)} KB` : `${chars} chars`;
}

/**
 * What the chip says. Tool names are an implementation detail; the reader wants
 * to know what happened, so each one gets a verb — in the present tense while it
 * is still running.
 */
function chipLabel(name: string, part: ToolPart, pending: boolean): string {
  if (name === "fetch_url") {
    const host = hostOf(urlOf(part));
    if (pending) return host ? `Reading ${host}` : "Reading page";
    return host || "Read page";
  }
  const labels: Record<string, [doing: string, done: string]> = {
    ask_user_question: ["Asking", "Asked"],
    render_chart: ["Charting", "Chart"],
    render_flow: ["Diagramming", "Diagram"],
    render_html: ["Building", "Widget"],
    parse_data: ["Parsing", "Table"],
    save_memory: ["Saving", "Remembered"],
    search_memory: ["Searching memory", "Memory"],
    forget_memory: ["Forgetting", "Forgotten"],
    load_skill: ["Opening skill", "Skill"],
    read_skill_resource: ["Reading", "Skill file"],
  };
  const pair = labels[name];
  if (!pair) return name.replace(/_/g, " ");
  return pending ? pair[0] : pair[1];
}

/** One-line result detail shown after the label on the collapsed chip. */
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
      // Deliberately not the status code or MIME type: neither tells a reader
      // anything they can act on when the call already succeeded.
      return formatSize(String(o.text ?? "").length);
    case "question":
      return "";
    case "memory_saved":
      return o.alreadyKnown ? "already known" : "saved";
    case "memory_search":
      return `${(o.matches as unknown[])?.length ?? 0} matches`;
    case "memory_forgotten":
      return "";
    // Which skill it was is the whole story; the body is in the panel.
    case "skill_loaded":
      return String(o.name);
    case "skill_resource":
      return String(o.path);
    default:
      return "";
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
    case "ask_user_question":
      return questionsOf(o).flatMap((q) => [
        `Asked: "${q.question}"${q.multiSelect ? " (pick any)" : ""}`,
        `Options: ${q.options.map((o) => o.label).join(" · ")}`,
      ]);
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
    // fetch_url is rendered as a source list, not as lines — see SourceList.
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
    case "load_skill": {
      const resources = (o.resources as string[]) ?? [];
      return [
        String(o.description ?? ""),
        `${String(o.body ?? "").length} chars of instructions`,
        resources.length > 0 ? `Resources: ${resources.join(", ")}` : "",
      ].filter(Boolean);
    }
    case "read_skill_resource":
      return [`${String(o.name)} · ${String(o.path)}`, `${String(o.content ?? "").length} chars`];
    default:
      return [];
  }
}

/**
 * The pages a fetch touched, one row each. The link carries the full URL so
 * nothing is hidden from someone who wants it — it just isn't shouted at
 * everyone who doesn't.
 */
function SourceList({ parts }: { parts: ToolPart[] }) {
  return (
    <ul className="space-y-1">
      {parts.map((part) => {
        const url = urlOf(part);
        const host = hostOf(url) || "unknown source";
        const result = part.output as FetchResult | null;
        const failed = part.state === "output-error";

        return (
          <li key={part.toolCallId} className="flex items-baseline gap-2 text-xs">
            <a
              href={url || undefined}
              target="_blank"
              rel="noreferrer noopener"
              title={url}
              className="truncate text-text-secondary underline-offset-2 hover:text-text hover:underline"
            >
              {host}
            </a>
            {failed ? (
              <span className="shrink-0 text-danger">failed</span>
            ) : (
              result && (
                <span className="shrink-0 text-text-faint">
                  {formatSize(result.text.length)}
                  {result.truncated && " · truncated"}
                </span>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A chip and its expanded panel: either one tool call, or every fetch merged. */
type Entry =
  | { id: string; kind: "single"; part: ToolPart }
  | { id: string; kind: "sources"; parts: ToolPart[] };

/**
 * Several fetches in a turn used to mean several near-identical chips, each
 * shouting a status code. They collapse into one "N sources" chip instead —
 * the count is the only thing worth the space, and the sites are one click away.
 */
function toEntries(parts: ToolPart[]): Entry[] {
  const fetches = parts.filter((p) => p.type === "tool-fetch_url");
  if (fetches.length < 2) return parts.map((part) => ({ id: part.toolCallId, kind: "single", part }));

  const entries: Entry[] = [];
  let placed = false;
  for (const part of parts) {
    if (part.type === "tool-fetch_url") {
      if (placed) continue;
      placed = true;
      entries.push({ id: "sources", kind: "sources", parts: fetches });
      continue;
    }
    entries.push({ id: part.toolCallId, kind: "single", part });
  }
  return entries;
}

/**
 * The trail of tool calls under an assistant message. Collapsed to chips by
 * default so the answer stays the focus; each chip expands in place.
 */
export function ToolChipRow({ parts }: { parts: ToolPart[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  if (parts.length === 0) return null;

  const entries = toEntries(parts);
  const open = entries.find((e) => e.id === expanded) ?? null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {entries.map((entry) => {
          const isOpen = entry.id === expanded;

          if (entry.kind === "sources") {
            const busy = entry.parts.some(
              (p) => p.state === "input-streaming" || p.state === "input-available",
            );
            return (
              <ChipButton
                key={entry.id}
                icon={IconFetch}
                label={`${busy ? "Reading" : "Read"} ${entry.parts.length} sources`}
                pending={busy}
                failed={entry.parts.every((p) => p.state === "output-error")}
                open={isOpen}
                onClick={() => setExpanded(isOpen ? null : entry.id)}
              />
            );
          }

          const { part } = entry;
          const name = part.type.slice("tool-".length);
          const failed = part.state === "output-error";
          const pending = part.state === "input-streaming" || part.state === "input-available";
          const done = part.state === "output-available";

          return (
            <ChipButton
              key={entry.id}
              icon={TOOL_ICONS[name] ?? IconAgent}
              label={chipLabel(name, part, pending)}
              detail={done ? outcome(part.output) : ""}
              duration={
                done ? (part.output as { _meta?: ToolMeta })?._meta?.durationMs : undefined
              }
              pending={pending}
              failed={failed}
              open={isOpen}
              onClick={() => setExpanded(isOpen ? null : entry.id)}
            />
          );
        })}
      </div>

      {open && (
        <div className="rounded-xl border border-border-subtle bg-surface/40 p-3">
          {open.kind === "sources" ? (
            <SourceList parts={open.parts} />
          ) : (
            <ExpandedTool part={open.part} showRaw={showRaw} onToggleRaw={() => setShowRaw((v) => !v)} />
          )}
        </div>
      )}
    </div>
  );
}

function ChipButton({
  icon: Icon,
  label,
  detail,
  duration,
  pending,
  failed,
  open,
  onClick,
}: {
  icon: typeof IconChart;
  label: string;
  detail?: string;
  duration?: number;
  pending: boolean;
  failed: boolean;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className={`flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        failed
          ? "border-danger/40 bg-danger-soft text-danger hover:bg-danger/15"
          : open
            ? "border-border-strong bg-surface-raised text-text-secondary"
            : "border-border-subtle bg-surface/60 text-text-faint hover:border-border hover:text-text-secondary"
      } ${pending ? "cursor-default" : "cursor-pointer"}`}
    >
      <Icon size={12} className="shrink-0" />
      <span className="truncate">{label}</span>
      {pending && <span className="animate-pulse">…</span>}
      {detail && (
        <>
          <span className="shrink-0 opacity-40">·</span>
          <span className="shrink-0 opacity-80">{detail}</span>
        </>
      )}
      {duration !== undefined && (
        <span className="shrink-0 opacity-50">· {formatDuration(duration)}</span>
      )}
      {failed && <span className="shrink-0">failed</span>}
      {!pending && <IconChevron size={11} className={open ? "shrink-0 rotate-180" : "shrink-0"} />}
    </button>
  );
}

function ExpandedTool({
  part,
  showRaw,
  onToggleRaw,
}: {
  part: ToolPart;
  showRaw: boolean;
  onToggleRaw: () => void;
}) {
  const name = part.type.slice("tool-".length);
  const output = part.output as Record<string, unknown> | null;
  const meta = output?._meta as ToolMeta | undefined;
  const isFetch = name === "fetch_url";
  const lines =
    part.state === "output-error" ? [`Error: ${part.errorText}`] : summary(name, output ?? {});
  const clean = output
    ? Object.fromEntries(Object.entries(output).filter(([k]) => k !== "_meta"))
    : {};

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-text-muted">
          {chipLabel(name, part, false)}
          {meta && <span className="ml-2 text-text-faint">{formatDuration(meta.durationMs)}</span>}
        </span>
        <button
          type="button"
          onClick={onToggleRaw}
          className="font-mono text-[11px] text-text-faint underline-offset-2 hover:text-text-secondary hover:underline"
        >
          {showRaw ? "summary" : "raw"}
        </button>
      </div>
      {showRaw ? (
        <pre className="scroll-thin max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-bg-elevated p-3 font-mono text-[11px] text-text-muted">
          {JSON.stringify(clean, null, 2).slice(0, 4000)}
        </pre>
      ) : isFetch && part.state !== "output-error" ? (
        <SourceList parts={[part]} />
      ) : (
        <ul className="space-y-1">
          {lines.map((line, i) => (
            <li key={i} className="break-words text-xs text-text-muted">
              {line}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
