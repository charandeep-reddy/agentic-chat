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
});
