import { tool } from "ai";
import { askQuestionSchema, askQuestion } from "./ask-question";
import { renderChartSchema, renderChart } from "./render-chart";
import { renderFlowSchema, renderFlow } from "./render-flow";
import { renderHtmlSchema, renderHtml } from "./render-html";
import { fetchUrlSchema, fetchUrl } from "./fetch-url";
import { parseDataSchema, parseData } from "./parse-data";
import {
  forgetMemory,
  forgetMemorySchema,
  saveMemory,
  saveMemorySchema,
  searchMemory,
  searchMemorySchema,
} from "./memory";
import type { MemoryStore } from "./memory";

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

/** Tools that need nothing but their arguments. Safe to share across requests. */
export const baseTools = {
  ask_user_question: tool({
    description: [
      "Ask the user to choose between options to clarify an ambiguous request or let them make a decision.",
      "Calling this tool pauses the conversation: after calling it, stop working and wait.",
      "The user's answer will arrive as a new user message, then you continue.",
      "Use 2-4 concise options; only use it when a real choice or clarification is needed.",
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
    execute: withTiming((args) => renderChart(args)),
  }),
  render_flow: tool({
    description: [
      "Render a Mermaid diagram (flowchart, sequence, state, class, ER, gantt, timeline, etc.) to visualize processes, architecture, steps, or relationships.",
      "The `diagram` argument is raw Mermaid source starting with the diagram type keyword, e.g. `flowchart TD\\nA[Start] --> B{Decision}`.",
      "Do not wrap the diagram in code fences.",
    ].join(" "),
    inputSchema: renderFlowSchema,
    execute: withTiming((args) => renderFlow(args)),
  }),
  render_html: tool({
    description: [
      "Render live HTML/CSS/JS inline in the chat, inside a sandboxed frame.",
      "Use it for interactive things a static answer cannot express: calculators, mockups, small games, styled layouts, SVG illustrations, interactive tables, simulations.",
      "Write a self-contained document: inline all CSS in a <style> tag and all JS in a <script> tag. External network requests are blocked, so no CDNs, remote fonts, or remote images — inline SVG or data: URIs instead.",
      "The frame renders on a dark background by default; pass a full <html> document if you want to control that.",
      "Set `height` to roughly what the content needs. Prefer this over describing a UI in prose when the user asks to 'build', 'show', 'design' or 'make' something visual.",
    ].join(" "),
    inputSchema: renderHtmlSchema,
    execute: withTiming((args) => renderHtml(args)),
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
      "You receive the table preview in the result; use the values for calculations and charts.",
    ].join(" "),
    inputSchema: parseDataSchema,
    execute: withTiming((args) => parseData(args)),
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

/** Full registry for a request. Memory tools are omitted when memory is off. */
export function buildTools(store: MemoryStore | null) {
  return store ? { ...baseTools, ...memoryTools(store) } : baseTools;
}

/** Static view of the registry, used for typing the UI. */
export const tools = { ...baseTools, ...memoryTools({} as MemoryStore) };

export type AgentTools = typeof tools;
