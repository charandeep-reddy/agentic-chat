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

  it("rejects a diagram mermaid cannot parse, and says how to fix it", async () => {
    // Unquoted parentheses in a node label — the most common way a generated
    // diagram fails. Letting it through renders mermaid's own syntax-error
    // graphic in the chat instead of a diagram.
    await expect(
      renderFlow({ diagram: 'flowchart TD\n  A[Start (here)] --> B{Ok?}' }),
    ).rejects.toThrow(/could not parse[\s\S]*double quotes/i);
  });

  it("accepts the quoted form of the same labels", async () => {
    const spec = await renderFlow({ diagram: 'flowchart TD\n  A["Start (here)"] --> B{"Ok?"}' });
    expect(spec.type).toBe("flowchart");
  });
});
