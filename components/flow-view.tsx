"use client";

import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";
import type { FlowSpec } from "@/lib/tools/render-flow";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  themeVariables: { background: "#09090b", fontSize: "13px" },
});

function FlowDiagram({ id, diagram }: { id: string; diagram: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    mermaid
      .render(`mermaid-${id}`, diagram)
      .then(({ svg: rendered }) => {
        if (!cancelled) setSvg(rendered);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to render diagram.");
      });
    return () => {
      cancelled = true;
    };
  }, [id, diagram]);

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-400">Could not render this diagram:</p>
        <pre className="whitespace-pre-wrap rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-400">{diagram}</pre>
      </div>
    );
  }

  if (!svg) {
    return <div className="flex h-32 items-center justify-center text-sm text-zinc-500">Rendering diagram…</div>;
  }

  return <div className="flex justify-center" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function FlowView({ spec }: { spec: FlowSpec }) {
  const id = useId().replace(/[:]/g, "");
  return <FlowDiagram key={spec.diagram} id={id} diagram={spec.diagram} />;
}
