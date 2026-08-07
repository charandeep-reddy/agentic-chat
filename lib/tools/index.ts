import { tool } from "ai";
import { askQuestionSchema, askQuestion } from "./ask-question";
import { renderChartSchema, renderChart } from "./render-chart";
import { renderFlowSchema, renderFlow } from "./render-flow";
import { fetchUrlSchema, fetchUrl } from "./fetch-url";
import { parseDataSchema, parseData } from "./parse-data";

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

export const tools = {
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

export type AgentTools = typeof tools;
