import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { chatToMarkdown } from "@/lib/export-markdown";

function toolPart(name: string, output: unknown) {
  return {
    type: `tool-${name}`,
    toolCallId: `call_${name}`,
    state: "output-available",
    output,
  } as unknown as UIMessage["parts"][number];
}

function message(role: "user" | "assistant", parts: UIMessage["parts"]): UIMessage {
  return { id: `m_${role}`, role, parts };
}

describe("chatToMarkdown", () => {
  it("renders the title and speaker headings", () => {
    const md = chatToMarkdown("Revenue analysis", [
      message("user", [{ type: "text", text: "Chart my revenue." }]),
      message("assistant", [{ type: "text", text: "Here you go." }]),
    ]);

    expect(md).toContain("# Revenue analysis");
    expect(md).toContain("## You");
    expect(md).toContain("## Assistant");
    expect(md).toContain("Chart my revenue.");
  });

  it("emits mermaid diagrams in a fenced mermaid block", () => {
    const md = chatToMarkdown("Flow", [
      message("assistant", [
        toolPart("render_flow", { kind: "flow", type: "flowchart", diagram: "flowchart TD\nA-->B" }),
      ]),
    ]);

    expect(md).toContain("```mermaid");
    expect(md).toContain("flowchart TD");
  });

  it("emits HTML artifacts as fenced html with a naming comment", () => {
    const md = chatToMarkdown("Calc", [
      message("assistant", [
        toolPart("render_html", { kind: "html", title: "Calculator", html: "<p>hi</p>" }),
      ]),
    ]);

    expect(md).toContain("<!-- render_html: Calculator -->");
    expect(md).toContain("```html");
    expect(md).toContain("<p>hi</p>");
  });

  it("renders parsed tables as GFM tables", () => {
    const md = chatToMarkdown("Data", [
      message("assistant", [
        toolPart("parse_data", {
          kind: "table",
          columns: [{ name: "month" }, { name: "revenue" }],
          rows: [
            { month: "Jan", revenue: 100 },
            { month: "Feb", revenue: 200 },
          ],
        }),
      ]),
    ]);

    expect(md).toContain("| month | revenue |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| Jan | 100 |");
  });

  it("truncates very long tables with a note", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ n: i }));
    const md = chatToMarkdown("Big", [
      message("assistant", [
        toolPart("parse_data", { kind: "table", columns: [{ name: "n" }], rows }),
      ]),
    ]);

    expect(md).toContain("_… 10 more rows omitted._");
  });

  it("skips tool calls that never produced output", () => {
    const md = chatToMarkdown("Partial", [
      message("assistant", [
        { type: "tool-render_chart", toolCallId: "c1", state: "input-available" } as never,
        { type: "text", text: "Still working." },
      ]),
    ]);

    expect(md).toContain("Still working.");
    expect(md).not.toContain("```json");
  });

  it("drops the timing metadata from chart specs", () => {
    const md = chatToMarkdown("Chart", [
      message("assistant", [
        toolPart("render_chart", {
          kind: "chart",
          type: "bar",
          title: "Revenue",
          series: [{ name: "r", data: [1, 2] }],
          _meta: { durationMs: 12 },
        }),
      ]),
    ]);

    expect(md).toContain("**Chart — Revenue**");
    expect(md).not.toContain("_meta");
    expect(md).not.toContain("durationMs");
  });
});
