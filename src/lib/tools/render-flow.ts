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

/**
 * Mermaid's parser needs a DOM for most diagram types, so on the server it
 * fails for valid input too ("DOMPurify.addHook is not a function"). Only a
 * genuine grammar error is worth rejecting — anything else is the runtime, not
 * the diagram, and must not turn a good diagram into a tool error.
 */
function syntaxError(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const message = "message" in error ? String(error.message) : "";
  const isGrammar =
    "hash" in error || /^(Parse error|Lexical error|No diagram type detected)/i.test(message);
  return isGrammar && message ? message : null;
}

async function validateWithMermaid(diagram: string): Promise<void> {
  try {
    const { default: mermaid } = await import("mermaid");
    await mermaid.parse(diagram);
  } catch (error) {
    const problem = syntaxError(error);
    if (problem) {
      throw new ToolError(
        `Mermaid could not parse the diagram:\n\n${problem}\n\nFix the syntax and call the tool again. Labels containing (), {}, [], commas or quotes must be wrapped in double quotes — for example A["Start (here)"].`,
      );
    }
    // Otherwise the parser itself is unavailable in this runtime; the diagram
    // may well be fine, so let it through and let the browser render it.
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
