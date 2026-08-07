"use client";

import { IconChart, IconFetch, IconFlow, IconSpark, IconTable } from "./icons";

const CAPABILITIES = [
  {
    icon: IconChart,
    title: "Visualize",
    hint: "Charts from raw numbers",
    prompt: "Show me a chart from this data: Jan 120, Feb 210, Mar 175, Apr 290",
  },
  {
    icon: IconFetch,
    title: "Fetch live",
    hint: "Pull public APIs & pages",
    prompt: "Fetch https://api.github.com/repos/anomalyco/opencode and summarize it",
  },
  {
    icon: IconFlow,
    title: "Diagram",
    hint: "Flows, sequences, states",
    prompt: "Draw a flowchart of a customer support ticket lifecycle",
  },
  {
    icon: IconTable,
    title: "Parse data",
    hint: "CSV / JSON → clean table",
    prompt: "Parse this CSV and show a table:\nname,score\nAlice,92\nBob,78\nCara,85",
  },
] as const;

export function EmptyState({
  hasKey,
  busy,
  onPrompt,
  onConnect,
}: {
  hasKey: boolean;
  busy: boolean;
  onPrompt: (text: string) => void;
  onConnect: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 pt-10 pb-8 sm:pt-16">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface shadow-[0_0_40px_-8px_var(--accent-soft)]">
        <IconSpark size={22} className="text-accent" />
      </div>

      <h2
        className="text-center text-3xl tracking-tight text-text sm:text-4xl"
        style={{ fontFamily: "var(--font-instrument), serif" }}
      >
        Ask. Act. <em className="text-accent not-italic">Render.</em>
      </h2>

      <p className="mt-3 max-w-md text-center text-sm leading-relaxed text-text-muted">
        An agentic workbench for data — charts, diagrams, tables, and live fetches rendered inline.
        Your key stays in the browser.
      </p>

      {!hasKey && (
        <button
          type="button"
          onClick={onConnect}
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-human/40 bg-human-soft px-4 py-2 text-sm font-medium text-human transition-colors hover:bg-human/15"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-human animate-pulse-dot" />
          Connect your API key to start
        </button>
      )}

      <div className="mt-10 grid w-full gap-2.5 sm:grid-cols-2">
        {CAPABILITIES.map((cap, i) => {
          const Icon = cap.icon;
          return (
            <button
              key={cap.title}
              type="button"
              disabled={!hasKey || busy}
              onClick={() => onPrompt(cap.prompt)}
              className={`group flex items-start gap-3 rounded-xl border border-border bg-surface/60 p-3.5 text-left transition-all hover:border-border-strong hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40 animate-fade-up stagger-${i + 1}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-elevated text-text-muted transition-colors group-hover:border-accent/30 group-hover:text-accent">
                <Icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-text">{cap.title}</span>
                <span className="mt-0.5 block text-xs text-text-muted">{cap.hint}</span>
                <span className="mt-2 block truncate font-mono text-[11px] text-text-faint group-hover:text-text-muted">
                  {cap.prompt.split("\n")[0]}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
