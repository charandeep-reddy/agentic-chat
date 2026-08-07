"use client";

import { useEffect, useId, useState } from "react";
import mermaid from "mermaid";
import type { FlowSpec } from "@/lib/tools/render-flow";
import { WidgetShell } from "./widget-shell";
import { IconFlow } from "./icons";
import { useTheme } from "./theme-provider";
import type { ResolvedTheme } from "@/lib/theme";

/**
 * Mermaid's config is global and read at render time, not at init time, so the
 * theme has to be re-applied before each render rather than once at module
 * load. Every diagram on the page shares the app's one theme, so the fact that
 * this is global state is not a hazard here.
 */
function configureMermaid(theme: ResolvedTheme) {
  mermaid.initialize({
    startOnLoad: false,
    theme: theme === "light" ? "default" : "dark",
    securityLevel: "loose",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    themeVariables: {
      background: theme === "light" ? "#ffffff" : "#09090b",
      fontSize: "13px",
    },
    // Without this, a diagram mermaid can't parse is answered with its own
    // "Syntax error in text / mermaid version …" graphic, drawn straight into
    // the page. We'd rather show the reason and the source the model produced.
    suppressErrorRendering: true,
  });
}

function FlowDiagram({ id, diagram }: { id: string; diagram: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    configureMermaid(theme);
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
  }, [id, diagram, theme]);

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-danger">Could not render this diagram.</p>
        <p className="font-mono text-xs leading-relaxed text-text-faint">{error}</p>
        <pre className="scroll-thin overflow-x-auto whitespace-pre rounded-md border border-border-subtle bg-surface p-3 font-mono text-xs text-text-muted">
          {diagram}
        </pre>
      </div>
    );
  }

  if (!svg) {
    return <div className="flex h-32 items-center justify-center text-sm text-text-faint">Rendering diagram…</div>;
  }

  return <div className="flex justify-center overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function FlowWidget({ spec }: { spec: FlowSpec }) {
  const id = useId().replace(/[:]/g, "");
  return (
    <WidgetShell icon={<IconFlow size={15} />} title={`Diagram · ${spec.type}`}>
      <FlowDiagram key={spec.diagram} id={id} diagram={spec.diagram} />
    </WidgetShell>
  );
}
