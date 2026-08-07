import type { UIMessage } from "ai";

/** Reconstructs a chat as portable Markdown, widgets included as source. */
export function chatToMarkdown(title: string, messages: UIMessage[]): string {
  const lines = [`# ${title}`, ""];

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    lines.push(`## ${message.role === "user" ? "You" : "Assistant"}`, "");

    for (const part of message.parts) {
      if (part.type === "text") {
        lines.push(part.text.trim(), "");
        continue;
      }
      if (!part.type.startsWith("tool-")) continue;

      const toolPart = part as { type: string; state?: string; output?: unknown };
      if (toolPart.state !== "output-available") continue;

      const name = toolPart.type.slice("tool-".length);
      const output = toolPart.output as Record<string, unknown>;
      lines.push(...renderToolOutput(name, output));
    }
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

function renderToolOutput(name: string, output: Record<string, unknown>): string[] {
  switch (output.kind) {
    case "flow":
      return ["```mermaid", String(output.diagram), "```", ""];
    case "html":
      return [`<!-- ${name}: ${output.title ?? "HTML artifact"} -->`, "```html", String(output.html), "```", ""];
    case "table":
      return renderTable(output);
    case "chart":
      return [
        `**Chart — ${output.title ?? String(output.type)}**`,
        "",
        "```json",
        JSON.stringify(stripMeta(output), null, 2),
        "```",
        "",
      ];
    case "question":
      return [
        `> **${String(output.question)}**`,
        `> Options: ${(output.options as string[]).join(" · ")}`,
        "",
      ];
    case "memory_saved":
      return [`> 🧠 Remembered: ${String(output.content)}`, ""];
    default:
      return [];
  }
}

function renderTable(output: Record<string, unknown>): string[] {
  const columns = (output.columns as Array<{ name: string }>) ?? [];
  const rows = (output.rows as Array<Record<string, unknown>>) ?? [];
  if (columns.length === 0) return [];

  const header = `| ${columns.map((c) => c.name).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows
    .slice(0, 50)
    .map((row) => `| ${columns.map((c) => String(row[c.name] ?? "")).join(" | ")} |`);

  const truncated =
    rows.length > 50 ? ["", `_… ${rows.length - 50} more rows omitted._`] : [];

  return [header, divider, ...body, ...truncated, ""];
}

function stripMeta(output: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(output).filter(([k]) => k !== "_meta" && k !== "kind"));
}
