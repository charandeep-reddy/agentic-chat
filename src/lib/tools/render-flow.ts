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
 * Node shapes, longest opener first so `[[` is never mistaken for `[`.
 */
const SHAPES: Array<[open: string, close: string]> = [
  ["[[", "]]"],
  ["[(", ")]"],
  ["([", "])"],
  ["((", "))"],
  ["{{", "}}"],
  ["[", "]"],
  ["(", ")"],
  ["{", "}"],
];

/** Characters that end a node and let the next token start. */
const CONTINUATION = /^(\s|$|&|-|=|~|:|;|\||\.)/;

/** Lines that are directives rather than nodes — their parens are meaningful. */
const DIRECTIVE = /^\s*(%%|subgraph|end\b|direction|click|class\b|classDef|style|linkStyle|accTitle|accDescr)/;

/**
 * Everything the flowchart grammar refuses to see inside a bare label. `(` is
 * the one that bites in practice — the model writes `execute()` and the lexer
 * reads it as the start of a round-node shape.
 */
const NEEDS_QUOTING = /[()[\]{}"]/;

function balanced(text: string, open: string, close: string): boolean {
  const o = open[0];
  const c = close[0];
  let depth = 0;
  for (const ch of text) {
    if (ch === o) depth += 1;
    else if (ch === c) depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/**
 * Wraps node labels in quotes when their contents would otherwise break the
 * flowchart lexer.
 *
 * The alternative is to reject the diagram and let the model retry, which is
 * what the tool used to do — except it never actually could: `mermaid.parse`
 * dies on `DOMPurify.addHook` in Node long before the grammar runs, so every
 * flowchart sailed through validation and failed in the browser instead. This
 * fixes the diagram rather than the error message, which is also the better
 * outcome: the user sees a diagram instead of a retry.
 *
 * Deliberately conservative. A label whose own brackets don't balance is left
 * exactly as it was — guessing where it ends would turn a visible parse error
 * into a silently wrong diagram, which is a worse failure.
 */
export function quoteFlowLabels(diagram: string): string {
  return diagram
    .split("\n")
    .map((line) => {
      if (DIRECTIVE.test(line)) return line;

      let out = "";
      let i = 0;
      while (i < line.length) {
        // A node is an identifier immediately followed by a shape opener.
        const id = /^[A-Za-z0-9_-]+/.exec(line.slice(i));
        const startsNode = id && (i === 0 || /[\s&|>)\]}]/.test(line[i - 1]));
        if (!startsNode) {
          out += line[i];
          i += 1;
          continue;
        }

        const afterId = i + id[0].length;
        const shape = SHAPES.find(([open]) => line.startsWith(open, afterId));
        if (!shape) {
          out += line.slice(i, afterId);
          i = afterId;
          continue;
        }

        const [open, close] = shape;
        const bodyStart = afterId + open.length;
        // The first closer that leaves a legal continuation behind it. Scanning
        // from the left keeps `A[x] --> B[y]` from swallowing the whole line.
        let end = -1;
        for (let j = bodyStart; j <= line.length - close.length; j += 1) {
          if (!line.startsWith(close, j)) continue;
          if (CONTINUATION.test(line.slice(j + close.length))) {
            end = j;
            break;
          }
        }

        const body = end === -1 ? null : line.slice(bodyStart, end);
        const rewritable =
          body !== null &&
          body.trim() !== "" &&
          !body.trimStart().startsWith('"') &&
          NEEDS_QUOTING.test(body) &&
          balanced(body, open, close);

        if (!rewritable) {
          out += line.slice(i, bodyStart);
          i = bodyStart;
          continue;
        }

        // `#quot;` is Mermaid's own escape; a raw `"` would close the label.
        out += `${line.slice(i, afterId)}${open}"${body.replace(/"/g, "#quot;")}"${close}`;
        i = end + close.length;
      }
      return out;
    })
    .join("\n");
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

  // Only flowcharts: every other diagram type has its own label grammar, and
  // the shape delimiters here mean different things in each of them.
  const normalized =
    type === "flowchart" || type === "graph" ? quoteFlowLabels(diagram) : diagram;

  await validateWithMermaid(normalized);

  return { kind: "flow", type, title: args.title, diagram: normalized };
}
