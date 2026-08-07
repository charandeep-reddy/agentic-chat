"use client";

import { IconChart, IconCode, IconFetch, IconFlow, IconKey, IconSpark, IconTable } from "./icons";

const CAPABILITIES = [
  {
    icon: IconChart,
    title: "Visualize",
    hint: "Charts from raw numbers",
    prompt: "Chart this: Jan 120, Feb 210, Mar 175, Apr 290, May 260, Jun 340",
  },
  {
    icon: IconCode,
    title: "Build",
    hint: "Live, interactive HTML",
    prompt: "Build me an interactive compound-interest calculator",
  },
  {
    icon: IconFetch,
    title: "Fetch live",
    hint: "Public APIs and pages",
    prompt: "Fetch https://api.github.com/repos/vercel/next.js and summarize it",
  },
  {
    icon: IconFlow,
    title: "Diagram",
    hint: "Mermaid flows and sequences",
    prompt: "Draw a flowchart of an OAuth 2.0 authorization code flow",
  },
  {
    icon: IconTable,
    title: "Parse data",
    hint: "CSV and JSON to tables",
    prompt: "Parse this CSV and tell me the trend:\nmonth,revenue\nJan,4200\nFeb,5100\nMar,4800",
  },
];

export function EmptyState({
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
    <div className="mt-10 flex flex-col items-center text-center sm:mt-16">
      <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <IconSpark size={22} />
      </span>
      <h2 className="text-2xl font-semibold tracking-tight text-text">
        {hasKey ? "What are we working on?" : "Bring your key. Ask anything."}
      </h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-text-muted">
        Your model, your data — charts, diagrams, tables, live fetches and interactive HTML,
        rendered inline.
      </p>

      {!hasKey ? (
        <>
          <div className="mt-8 grid w-full max-w-xl gap-3 sm:grid-cols-3">
            {[
              { n: "1", t: "Get a key", d: "Any OpenAI-compatible provider works" },
              { n: "2", t: "Paste it", d: "Stored in your browser only, never on the server" },
              { n: "3", t: "Pick a model", d: "Then start chatting" },
            ].map((step) => (
              <div
                key={step.n}
                className="rounded-xl border border-border-subtle bg-surface/50 p-4 text-left"
              >
                <span className="font-mono text-[11px] text-accent">{step.n}</span>
                <p className="mt-1 text-[13px] font-medium text-text-secondary">{step.t}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-text-faint">{step.d}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-text hover:brightness-110"
          >
            <IconKey size={15} />
            Connect your key
          </button>
        </>
      ) : (
        <div className="mt-8 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <button
              key={c.title}
              type="button"
              disabled={busy}
              onClick={() => onSend(c.prompt)}
              className="group flex items-start gap-3 rounded-xl border border-border-subtle bg-surface/40 p-3.5 text-left transition-colors hover:border-border hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-bg-elevated text-text-faint transition-colors group-hover:text-accent">
                <c.icon size={14} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-text-secondary">{c.title}</span>
                <span className="block truncate text-[11px] text-text-faint">{c.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
