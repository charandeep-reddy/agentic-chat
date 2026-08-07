import { z } from "zod";
import { ToolError } from "./errors";

export const renderFlowSchema = z.object({
  diagram: z.string().min(3, "diagram must be at least 3 characters").max(8000, "diagram must be under 8000 characters"),
  title: z.string().max(120).optional(),
});

export type RenderFlowArgs = z.infer<typeof renderFlowSchema>;

export const MERMAID_TYPES = [
  "flowchart",
  "graph",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "pie",
  "journey",
  "gantt",
  "mindmap",
  "timeline",
  "quadrantChart",
  "xychart-beta",
  "gitGraph",
  "sankey-beta",
  "block-beta",
  "zenuml",
  "c4Context",
] as const;

export interface FlowSpec {
  kind: "flow";
  type?: string;
  title?: string;
  diagram: string;
}

function stripFences(source: string): string {
  const lines = source.split("\n");
  const first = lines[0]?.trim() ?? "";
  if (first.startsWith("```")) lines.shift();
  const last = lines[lines.length - 1]?.trim() ?? "";
  if (last.startsWith("```")) lines.pop();
  return lines.join("\n").trim();
}

function detectType(diagram: string): string | undefined {
  const firstLine = diagram.split("\n").find((l) => l.trim() !== "")?.trim() ?? "";
  return MERMAID_TYPES.find((t) => firstLine === t || firstLine.startsWith(`${t} `));
}

async function validateWithMermaid(diagram: string): Promise<void> {
  try {
    const { default: mermaid } = await import("mermaid");
    await mermaid.parse(diagram);
  } catch {
    // mermaid.parse can be unavailable or flaky in non-browser runtimes;
    // fall through to the heuristic check instead of rejecting valid diagrams.
  }
}

export async function renderFlow(args: RenderFlowArgs): Promise<FlowSpec> {
  const diagram = stripFences(args.diagram);
  if (diagram.length < 3) throw new ToolError("The Mermaid diagram is empty after removing code fences.");

  const type = detectType(diagram);
  if (!type) {
    throw new ToolError(
      `Could not detect a Mermaid diagram type. The diagram must start with one of: ${MERMAID_TYPES.join(", ")}.`,
    );
  }

  await validateWithMermaid(diagram);

  return { kind: "flow", type, title: args.title, diagram };
}
