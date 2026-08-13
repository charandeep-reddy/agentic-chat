import { tool } from "ai";
import { askQuestionSchema, askQuestion } from "./ask-question";
import { renderChartSchema, renderChart, type ChartSpec } from "./render-chart";
import { renderFlowSchema, renderFlow, type FlowSpec } from "./render-flow";
import { renderHtmlSchema, renderHtml, type HtmlSpec } from "./render-html";
import { fetchUrlSchema, fetchUrl } from "./fetch-url";
import { parseDataSchema, parseData, describeTable, type ParsedTable } from "./parse-data";
import {
  forgetMemory,
  forgetMemorySchema,
  saveMemory,
  saveMemorySchema,
  searchMemory,
  searchMemorySchema,
} from "./memory";
import type { MemoryStore } from "./memory";
import {
  loadSkill,
  loadSkillSchema,
  readSkillResource,
  readSkillResourceSchema,
} from "./skills";
import type { SkillStore } from "./skills";

export interface ToolMeta {
  durationMs: number;
}

function withTiming<A, T extends object>(fn: (args: A) => T | Promise<T>) {
  return async (args: A): Promise<T & { _meta: ToolMeta }> => {
    const start = performance.now();
    const result = await fn(args);
    return { ...result, _meta: { durationMs: Math.max(1, Math.round(performance.now() - start)) } };
  };
}

/**
 * A short acknowledgement to send back to the model in place of a render tool's
 * full payload.
 *
 * The render tools echo their own input: the model writes a document, the tool
 * validates it, and without this the whole thing is replayed into the prompt as
 * a tool result — then again on every later turn of the conversation. For an
 * HTML artifact that is tens of thousands of tokens of text the model just
 * wrote, paid for twice, slowing the closing paragraph and every reply after
 * it. The widget itself is unaffected: the UI still receives the full spec.
 */
function ack(text: string) {
  return { type: "text" as const, value: text };
}

/** Tools that need nothing but their arguments. Safe to share across requests. */
export const baseTools = {
  ask_user_question: tool({
    description: [
      "Ask the user to choose between options to clarify an ambiguous request or let them make a decision.",
      "Calling this tool pauses the conversation: after calling it, stop working and wait.",
      "The user's answers arrive as a new user message, then you continue.",
      "Use 2-4 options per question; only use it when a real choice or clarification is needed.",
      "Each option is { label, description? }. The label is the answer and must be short enough to read at a glance - a few words, no trailing parenthetical.",
      "Put the detail in `description` instead: on a phone a long label is clipped, which quietly removes the most specific option from the choice.",
      "Pass up to 4 questions in one call when you need several decisions at once - one call the user answers together beats four rounds of waiting.",
      "Set multiSelect on a question whose options are not mutually exclusive, so the user can pick several.",
    ].join(" "),
    inputSchema: askQuestionSchema,
    execute: withTiming((args) => askQuestion(args)),
  }),
  render_chart: tool({
    description: [
      "Render an interactive chart from data you already have.",
      "For bar/line/area/scatter: pass `series` ({ name, data: number[] }) and optional `xLabels` (one label per value).",
      "For pie: pass `data` as { name, value } objects.",
      "Do NOT render charts for data you invented - only chart values from user data or fetched data.",
      "Prefer a chart whenever a visual comparison, trend, or distribution helps the user understand the answer.",
    ].join(" "),
    inputSchema: renderChartSchema,
    execute: withTiming(renderChart),
    // `output` is untyped here: the SDK only infers it from an explicit
    // outputSchema, which these tools do not need. The cast is to the type
    // `execute` actually returns.
    toModelOutput: ({ output }) => {
      const spec = output as ChartSpec;
      return ack(`Rendered a ${spec.type} chart${spec.title ? ` titled "${spec.title}"` : ""}.`);
    },
  }),
  render_flow: tool({
    description: [
      "Render a Mermaid diagram (flowchart, sequence, state, class, ER, gantt, timeline, etc.) to visualize processes, architecture, steps, or relationships.",
      "The `diagram` argument is raw Mermaid source starting with the diagram type keyword, e.g. `flowchart TD\\nA[Start] --> B{Decision}`.",
      "Do not wrap the diagram in code fences.",
    ].join(" "),
    inputSchema: renderFlowSchema,
    execute: withTiming(renderFlow),
    toModelOutput: ({ output }) => ack(`Rendered a ${(output as FlowSpec).type ?? "Mermaid"} diagram.`),
  }),
  render_html: tool({
    description: [
      "Render live HTML/CSS/JS inline in the chat, inside a sandboxed frame.",
      "Use it for interactive things a static answer cannot express: calculators, mockups, small games, styled layouts, SVG illustrations, interactive tables, simulations.",
      "Write a self-contained fragment: inline any JS in a <script> tag. External network requests are blocked, so no CDNs, remote fonts, or remote images — inline SVG or data: URIs instead.",
      "The frame already provides the chat's font, colours and styling for headings, labels, inputs, sliders, selects, buttons and tables. Do not set a background or pick colours — the widget renders transparently inside the conversation. Add CSS only for layout and for what is specific to this widget.",
      "Keep it tight: the markup is generated a token at a time, so a compact widget appears far sooner than a long one.",
      "The frame measures itself and grows to fit, so never size the widget against the viewport: no `100vh`, no `height: 100%` on a wrapper, and no `overflow: hidden` on anything that holds the main content - each of those clips the widget at whatever height it happened to start with. Let the content determine the height.",
      "`height` is only the placeholder shown for the first paint; set it to roughly what you expect. Prefer this tool over describing a UI in prose when the user asks to 'build', 'show', 'design' or 'make' something visual.",
    ].join(" "),
    inputSchema: renderHtmlSchema,
    execute: withTiming(renderHtml),
    toModelOutput: ({ output }) => {
      const spec = output as HtmlSpec;
      const notes =
        spec.warnings.length > 0
          ? `Sanitiser notes: ${spec.warnings.join(" ")}`
          : "Nothing was stripped.";
      return ack(`Rendered the widget${spec.title ? ` "${spec.title}"` : ""}. ${notes}`);
    },
  }),
  fetch_url: tool({
    description: [
      "Fetch the contents of a public http(s) URL (JSON, CSV, HTML, or plain text) to get live data.",
      "Use when the user asks about current/real data or names a website or API endpoint.",
      "Returns the raw body text; parse it afterwards with parse_data when it is tabular.",
      "Cannot access local/private addresses. Responses are capped at 2 MB.",
    ].join(" "),
    inputSchema: fetchUrlSchema,
    execute: withTiming((args) => fetchUrl(args)),
  }),
  parse_data: tool({
    description: [
      "Parse a CSV or JSON string into a structured table with detected column types.",
      "Use after the user pastes data or after fetch_url returns tabular text.",
      "This displays the table to the user. The result tells you its shape, not its rows - read values from the data you passed in, and do not restate the table in your reply.",
    ].join(" "),
    inputSchema: parseDataSchema,
    execute: withTiming((args) => parseData(args)),
    toModelOutput: ({ output }) => ack(describeTable(output as ParsedTable)),
  }),
};

/** Memory tools, bound to one user's store. */
export function memoryTools(store: MemoryStore) {
  return {
    save_memory: tool({
      description: [
        "Remember a durable fact about the user so future conversations start informed.",
        "Save only things that stay true beyond this chat: their name, role, stack, tools, recurring projects, standing preferences about how you should answer.",
        "Do NOT save one-off task details, transient context, or anything the user shares in confidence without asking.",
        "Keep each memory one short self-contained sentence written in the third person, e.g. 'Prefers TypeScript over JavaScript.'",
      ].join(" "),
      inputSchema: saveMemorySchema,
      execute: withTiming((args) => saveMemory(args, store)),
    }),
    search_memory: tool({
      description: [
        "Search the user's saved memories for anything relevant to the current request.",
        "Their most-used memories are already in your system prompt; use this to look deeper when the user references something you do not see there.",
      ].join(" "),
      inputSchema: searchMemorySchema,
      execute: withTiming((args) => searchMemory(args, store)),
    }),
    forget_memory: tool({
      description: [
        "Delete a saved memory by id. Use when the user says something is wrong or asks you to forget it.",
        "Call search_memory first to find the id.",
      ].join(" "),
      inputSchema: forgetMemorySchema,
      execute: withTiming((args) => forgetMemory(args, store)),
    }),
  };
}

/** Skill tools, bound to one user's library. */
export function skillTools(store: SkillStore) {
  return {
    load_skill: tool({
      description: [
        "Load the full instructions for one of the skills listed in your system prompt.",
        "Call it as soon as a skill's description matches what the user is asking for, before doing the work — the skill tells you how this user wants that task done.",
        "The result may name resource files; fetch those with read_skill_resource only if you need them.",
        "Do not guess at a skill's contents, and do not call this for a skill that is not listed.",
      ].join(" "),
      inputSchema: loadSkillSchema,
      execute: withTiming((args) => loadSkill(args, store)),
    }),
    read_skill_resource: tool({
      description: [
        "Read one resource file belonging to a skill you have already loaded.",
        "Use the exact path listed in the skill's `resources`. Fetch only what the current task needs.",
      ].join(" "),
      inputSchema: readSkillResourceSchema,
      execute: withTiming((args) => readSkillResource(args, store)),
    }),
  };
}

/**
 * Full registry for a request. Memory tools are omitted when memory is off,
 * and skill tools when the user has no skills — an unusable tool in the
 * registry is a standing invitation for the model to call it.
 */
export function buildTools({
  memory,
  skills,
}: {
  memory: MemoryStore | null;
  skills: SkillStore | null;
}) {
  return {
    ...baseTools,
    ...(memory ? memoryTools(memory) : {}),
    ...(skills ? skillTools(skills) : {}),
  };
}

/** Static view of the registry, used for typing the UI. */
export const tools = {
  ...baseTools,
  ...memoryTools({} as MemoryStore),
  ...skillTools({} as SkillStore),
};

export type AgentTools = typeof tools;
