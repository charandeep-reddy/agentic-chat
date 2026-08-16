/**
 * Which tools a user can turn off for one chat, and the shape that
 * preference travels in.
 *
 * Deliberately scoped to the render/utility tools, not memory or skill
 * tools — those already have their own dedicated management surfaces
 * (Memory, Skills), and are conditionally in the registry at all depending
 * on account-wide state the client does not fully see. Mixing "per-chat
 * opt-out" with "per-account subsystem" would make both harder to reason
 * about for one another's sake.
 *
 * No import chain to `server-only` code here on purpose: this same list and
 * `sanitizeDisabledTools` are used both by the client (to render the
 * checklist and write localStorage) and by the chat route (to filter the
 * tool registry), so there is exactly one definition of "a valid tool name
 * to disable" rather than two that can drift.
 */
export const TOGGLEABLE_TOOLS = [
  { name: "render_chart", label: "Charts" },
  { name: "render_flow", label: "Diagrams" },
  { name: "render_html", label: "Live HTML" },
  { name: "fetch_url", label: "Fetch URL" },
  { name: "parse_data", label: "Parse data" },
  { name: "generate_file", label: "Generate file" },
  { name: "ask_user_question", label: "Ask a question" },
] as const;

export type ToggleableTool = (typeof TOGGLEABLE_TOOLS)[number]["name"];

const TOGGLEABLE_NAMES = new Set<string>(TOGGLEABLE_TOOLS.map((t) => t.name));

export function disabledToolsKey(chatId: string): string {
  return `agentic-chat.chat.${chatId}.disabled-tools`;
}

/** Drops anything that isn't a recognised, toggleable tool name. */
export function sanitizeDisabledTools(raw: unknown): ToggleableTool[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is ToggleableTool => typeof v === "string" && TOGGLEABLE_NAMES.has(v));
}

/** Parses the stored JSON, tolerating anything malformed (hand-edited storage, an old shape). */
export function parseDisabledTools(raw: string): ToggleableTool[] {
  if (!raw) return [];
  try {
    return sanitizeDisabledTools(JSON.parse(raw));
  } catch {
    return [];
  }
}
