"use client";

import type { UIMessage } from "ai";
import { ChartView } from "./chart-view";
import { FlowView } from "./flow-view";
import { QuestionCard } from "./question-card";
import { DataTable } from "./data-table";
import { ArtifactFrame } from "./artifact-frame";
import {
  IconAlert,
  IconChart,
  IconCheck,
  IconFetch,
  IconFlow,
  IconLoader,
  IconQuestion,
  IconTable,
} from "./icons";
import type { ChartSpec } from "@/lib/tools/render-chart";
import type { FlowSpec } from "@/lib/tools/render-flow";
import type { QuestionPayload } from "@/lib/tools/ask-question";
import type { ParsedTable } from "@/lib/tools/parse-data";
import type { FetchResult } from "@/lib/tools/fetch-url";

const TOOL_META: Record<
  string,
  { label: string; running: string; done: string; Icon: typeof IconChart }
> = {
  ask_user_question: {
    label: "Question",
    running: "Waiting for your choice",
    done: "Asked you",
    Icon: IconQuestion,
  },
  render_chart: {
    label: "Chart",
    running: "Building chart",
    done: "Chart ready",
    Icon: IconChart,
  },
  render_flow: {
    label: "Diagram",
    running: "Rendering diagram",
    done: "Diagram ready",
    Icon: IconFlow,
  },
  fetch_url: {
    label: "Fetch",
    running: "Fetching URL",
    done: "Fetched",
    Icon: IconFetch,
  },
  parse_data: {
    label: "Table",
    running: "Parsing data",
    done: "Parsed",
    Icon: IconTable,
  },
};

export function isToolPart(
  part: UIMessage["parts"][number],
): part is Extract<UIMessage["parts"][number], { type: `tool-${string}` }> {
  return part.type.startsWith("tool-");
}

function ActivityChip({
  label,
  state,
  Icon,
}: {
  label: string;
  state: "running" | "done" | "error";
  Icon: typeof IconChart;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs ${
        state === "running"
          ? "border-accent/30 bg-accent-soft text-accent animate-agent-breathe"
          : state === "error"
            ? "border-danger/30 bg-danger-soft text-danger"
            : "border-border bg-surface text-text-muted"
      }`}
    >
      {state === "running" ? (
        <IconLoader size={12} />
      ) : state === "error" ? (
        <IconAlert size={12} />
      ) : (
        <IconCheck size={12} className="text-accent" />
      )}
      <Icon size={12} className="opacity-70" />
      <span>{label}</span>
    </div>
  );
}

export function ToolPartView({
  part,
  answeredQuestions,
  onAnswerQuestion,
}: {
  part: Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;
  answeredQuestions: Set<string>;
  onAnswerQuestion: (option: string) => void;
}) {
  const toolName = part.type.slice("tool-".length);
  const meta = TOOL_META[toolName] ?? {
    label: toolName.replace(/_/g, " "),
    running: toolName.replace(/_/g, " "),
    done: toolName.replace(/_/g, " "),
    Icon: IconSparkFallback,
  };
  const Icon = meta.Icon;

  if (part.state === "input-streaming" || part.state === "input-available") {
    return <ActivityChip label={meta.running} state="running" Icon={Icon} />;
  }

  if (part.state === "output-error") {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-3 animate-fade-up">
        <div className="flex items-center gap-2 text-xs font-medium text-danger">
          <IconAlert size={14} />
          {meta.label} failed
        </div>
        <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-danger/80">{part.errorText}</p>
      </div>
    );
  }

  if (part.state !== "output-available" || part.output === undefined) return null;

  const output = part.output as Record<string, unknown> & { kind?: string };

  switch (toolName) {
    case "ask_user_question": {
      const payload = output as unknown as QuestionPayload;
      return (
        <QuestionCard
          payload={payload}
          answered={answeredQuestions.has(part.toolCallId)}
          onAnswer={onAnswerQuestion}
        />
      );
    }
    case "render_chart": {
      const spec = output as unknown as ChartSpec;
      if (spec.kind !== "chart") return null;
      return (
        <ArtifactFrame
          icon={<Icon size={14} />}
          label={spec.type}
          title={spec.title}
          meta="interactive"
        >
          <ChartView spec={spec} />
        </ArtifactFrame>
      );
    }
    case "render_flow": {
      const spec = output as unknown as FlowSpec;
      if (spec.kind !== "flow") return null;
      return (
        <ArtifactFrame icon={<Icon size={14} />} label="Mermaid" title={spec.title} meta="diagram">
          <FlowView spec={spec} />
        </ArtifactFrame>
      );
    }
    case "parse_data": {
      const table = output as unknown as ParsedTable;
      if (table.kind !== "table") return null;
      return <DataTable table={table} />;
    }
    case "fetch_url": {
      const result = output as unknown as FetchResult;
      return (
        <details className="group artifact animate-fade-up">
          <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-info-soft text-info">
              <IconFetch size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-text-faint">
                  Fetch
                </span>
                <span className="font-mono text-[10px] text-text-muted">
                  {result.status}
                  <span className="mx-1 text-border-strong">·</span>
                  {result.contentType.split(";")[0]}
                  {result.truncated && <span className="ml-1 text-human">(truncated)</span>}
                </span>
              </div>
              <p className="truncate font-mono text-xs text-accent">{result.url}</p>
            </div>
            <span className="text-[11px] text-text-faint group-open:hidden">Expand</span>
            <span className="hidden text-[11px] text-text-faint group-open:inline">Collapse</span>
          </summary>
          <pre className="max-h-56 overflow-auto border-t border-border-subtle bg-bg px-3.5 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-text-muted">
            {result.text.slice(0, 4000)}
          </pre>
        </details>
      );
    }
    default:
      return (
        <div className="rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs text-text-muted">
          {toolName}: {JSON.stringify(output).slice(0, 500)}
        </div>
      );
  }
}

function IconSparkFallback({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}
