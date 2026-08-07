import { describe, expect, it } from "vitest";
import { renderFlow } from "@/lib/tools/render-flow";

describe("render_flow", () => {
  it("accepts a flowchart", async () => {
    const spec = await renderFlow({ diagram: "flowchart TD\nA[Start] --> B{Ok?}\nB -->|yes| C[End]" });
    expect(spec.kind).toBe("flow");
    expect(spec.type).toBe("flowchart");
  });

  it("detects sequence diagrams", async () => {
    const spec = await renderFlow({ diagram: "sequenceDiagram\nAlice->>Bob: hi" });
    expect(spec.type).toBe("sequenceDiagram");
  });

  it("strips markdown fences", async () => {
    const spec = await renderFlow({ diagram: "```mermaid\ngraph LR\nA --> B\n```" });
    expect(spec.diagram).toBe("graph LR\nA --> B");
    expect(spec.type).toBe("graph");
  });

  it("rejects unknown diagram types", async () => {
    await expect(renderFlow({ diagram: "banana pie\nA -> B" })).rejects.toThrow(/Mermaid diagram type/);
  });

  it("rejects empty diagrams", async () => {
    await expect(renderFlow({ diagram: "```\n```" })).rejects.toThrow(/empty/);
  });

  it("repairs unquoted parentheses instead of failing on them", async () => {
    // The most common way a generated diagram breaks. It used to be rejected so
    // the model could retry — except server-side validation cannot actually see
    // it, so the broken diagram reached the browser. Quoting it is both more
    // reliable and one fewer round trip. See tests/flow-grammar.test.ts.
    const spec = await renderFlow({ diagram: "flowchart TD\n  A[Start (here)] --> B{Ok?}" });
    expect(spec.diagram).toBe('flowchart TD\n  A["Start (here)"] --> B{Ok?}');
  });

  it("accepts the quoted form of the same labels", async () => {
    const spec = await renderFlow({ diagram: 'flowchart TD\n  A["Start (here)"] --> B{"Ok?"}' });
    expect(spec.type).toBe("flowchart");
  });
});
