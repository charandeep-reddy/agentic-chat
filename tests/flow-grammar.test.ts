import { describe, expect, it, vi } from "vitest";

// DOMPurify is the only thing in the parse path that needs a browser. Stubbing
// it is what lets the grammar run end-to-end here; it sanitises label text,
// which is irrelevant to whether the syntax parses.
vi.mock("dompurify", () => ({
  default: {
    addHook: () => {},
    removeHook: () => {},
    removeAllHooks: () => {},
    setConfig: () => {},
    clearConfig: () => {},
    sanitize: (value: string) => value,
    isSupported: true,
  },
}));
import { readdirSync } from "node:fs";
import { quoteFlowLabels } from "@/lib/tools/render-flow";

/**
 * `mermaid.parse` cannot run in Node — it dies on `DOMPurify.addHook` before it
 * ever reaches the grammar, which is exactly why bad flowcharts used to reach
 * the browser. The per-diagram parser underneath has no such dependency until a
 * label is sanitised, so it can answer the only question that matters here:
 * does the flowchart grammar accept this text?
 */
const CHUNKS = "mermaid/dist/chunks/mermaid.core";
const chunkFile = readdirSync(
  new URL(`../node_modules/${CHUNKS}/`, import.meta.url),
).find((f) => /^flowDiagram-.*\.mjs$/.test(f));

async function grammarAccepts(diagram: string): Promise<true | string> {
  const mod = await import(/* @vite-ignore */ `${CHUNKS}/${chunkFile}`);
  interface FlowParser {
    db: { clear?: () => void };
    parser: { yy: unknown; parser?: { yy: unknown }; parse: (input: string) => void };
  }
  const d = (mod as { createFlowDiagram: () => FlowParser }).createFlowDiagram();
  d.db.clear?.();
  d.parser.yy = d.db;
  if (d.parser.parser) d.parser.parser.yy = d.db;
  try {
    d.parser.parse(diagram);
    return true;
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("DOMPurify")) throw new Error("sanitize stub did not hold");
    return message.split("\n")[0];
  }
}

describe("flowchart label quoting", () => {
  it("has a parser chunk to test against", () => {
    expect(chunkFile).toBeTruthy();
  });

  it("rejects the unquoted label the grammar cannot read", async () => {
    const raw = "flowchart LR\n  X[Pure execute()<br/>returns typed spec]";
    expect(await grammarAccepts(raw)).toMatch(/Parse error/);
  });

  it("accepts that same label once quoted", async () => {
    const raw = "flowchart LR\n  X[Pure execute()<br/>returns typed spec]";
    expect(await grammarAccepts(quoteFlowLabels(raw))).toBe(true);
  });

  it("fixes the whole diagram from the bug report", async () => {
    const raw = [
      "flowchart LR",
      "  M[Model calls tool] --> S[Zod inputSchema validation]",
      "  S -- invalid --> E[ToolError with fixable message<br/>fed back to the model]",
      "  S -- valid --> X[Pure execute()<br/>returns typed spec + _meta.durationMs]",
      "  X --> R{Spec kind}",
      "  R -- chart --> C[chart-view.tsx<br/>ECharts 6]",
      "  R -- memory / fetch --> P[results streamed back to model]",
      "  C & F & H & T & Q --> UI[UIMessage tool-parts persisted as JSONB<br/>→ widgets survive reload]",
      "  X -. state: output-available .-> CHIP[tool-part.tsx: chip + expand<br/>summary, duration, raw]",
    ].join("\n");
    expect(await grammarAccepts(raw)).toMatch(/Parse error/);
    expect(await grammarAccepts(quoteFlowLabels(raw))).toBe(true);
  });

  it("leaves a diagram that already parses untouched", () => {
    const fine = "flowchart TD\n  A[Start] --> B{Choose}\n  B -- yes --> C[Done]";
    expect(quoteFlowLabels(fine)).toBe(fine);
  });

  it("does not double-quote a label the model already quoted", () => {
    const quoted = 'flowchart LR\n  A["Start (here)"] --> B[End]';
    expect(quoteFlowLabels(quoted)).toBe(quoted);
  });

  it("keeps each node separate on a chained line", () => {
    const raw = "flowchart LR\n  A[run()] --> B[stop()]";
    expect(quoteFlowLabels(raw)).toBe('flowchart LR\n  A["run()"] --> B["stop()"]');
  });

  it("escapes a quote inside a label instead of ending it early", () => {
    const raw = 'flowchart LR\n  A[say "hi" (loudly)]';
    expect(quoteFlowLabels(raw)).toBe('flowchart LR\n  A["say #quot;hi#quot; (loudly)"]');
  });

  it("preserves the other node shapes", () => {
    expect(quoteFlowLabels("flowchart LR\n  A((boot()))")).toContain('A(("boot()"))');
    expect(quoteFlowLabels("flowchart LR\n  A{{pick()}}")).toContain('A{{"pick()"}}');
    expect(quoteFlowLabels("flowchart LR\n  A[[call()]]")).toContain('A[["call()"]]');
  });

  it("leaves directives alone", () => {
    const raw = "flowchart LR\n  A[x]\n  click A call cb()\n  style A fill:#fff";
    expect(quoteFlowLabels(raw)).toBe(raw);
  });

  it("refuses to guess when a label's brackets do not balance", () => {
    const raw = "flowchart LR\n  A[a [b] c]";
    expect(quoteFlowLabels(raw)).toBe(raw);
  });
});
