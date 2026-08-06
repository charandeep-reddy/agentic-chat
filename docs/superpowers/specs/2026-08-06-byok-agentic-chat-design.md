# Agentic Chat (BYOK) — Design Spec

**Date:** 2026-08-06
**Status:** Approved

## 1. Goal

A standalone web app: an **agentic chatbot** where users bring their own API key
(BYOK). Phase 1 supports **OpenRouter** (one key, hundreds of models); native
OpenAI / Anthropic / Gemini adapters are drop-ins later. The agent has tools to
ask the user questions, parse pasted/uploaded data, fetch live data, and render
interactive **charts** and **flows** (graphs).

Audience: personal tool now, architected to become a hosted product later
(auth, DB storage, rate limits are swap points, not rewrites).

## 2. Stack (latest stable, verified 2026-08-06)

- **Next.js 16** (App Router, Turbopack) + **React 19**
- **Vercel AI SDK v7** (`ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible`)
- **Tailwind CSS v4**, hand-rolled components (no component lib)
- **Zod 4** — tool schemas + chart spec validation
- **ECharts 6** — charts (`echarts/core`, tree-shaken)
- **Mermaid 11** — flows/graphs (client-side render + validation)
- **Vitest 4** — unit tests

## 3. Architecture

```
Browser (Next.js client)
├─ useChat (@ai-sdk/react)  →  POST /api/chat
├─ settings: key + model in localStorage (BYOK)
└─ renders tool parts: ChartView / FlowView / QuestionCard / TableView
        │  key sent per-request as header (never persisted server-side)
        ▼
Next.js API routes (server)
├─ /api/chat     → streamText (AI SDK v7) + tool registry, OpenRouter provider
│                   built per-request from the header key
├─ /api/models   → proxies OpenRouter /v1/models (model picker data)
└─ lib/tools/*   → pure, testable tool implementations
```

**Rendering principle:** the agent never emits pixels. Tools return **structured
specs** (ECharts option + data, Mermaid source, question payload). The UI renders
them. Deterministic, validated by Zod, portable to other frontends (incl. an
opencode plugin later — same tool shape).

## 4. Tools (v1)

1. `ask_user_question` — question + options. Returns an interrupt marker; the
   agent loop stops (`stopWhen`), the UI shows a QuestionCard, the user's answer
   is appended as a user message and the loop resumes.
2. `render_chart` — args: chart type (bar/line/pie/area/scatter), title, series
   data. Validates + normalizes into an ECharts option spec.
3. `render_flow` — args: Mermaid source. Validates with mermaid parse; returns
   spec. Renders flowcharts, sequence, state, ER diagrams.
4. `fetch_url` — server-side fetch of public JSON/CSV/text URLs (no CORS pain).
   Cap: 2 MB, 15 s timeout, http(s) only.
5. `parse_data` — CSV/JSON string → normalized rows + inferred column types.
   Shared shape with render_chart (agent can chart parsed data).

Tool registry in `lib/tools/index.ts` — single source used by the route.

## 5. Agent loop

- `streamText` with `tools`, `stopWhen: isStepCount(4) || interrupted`, system
  prompt in `lib/prompts.ts` (data-assistant persona, tool-use guidance).
- Tool callbacks: `onToolExecutionStart/End` (stable in v7) → streamed to UI.
- Response via `createUIMessageStreamResponse({ stream: toUIMessageStream(...) })`
  so the client receives structured UI messages with tool parts.

## 6. BYOK flow

1. Settings panel: paste OpenRouter key → saved to `localStorage` only.
2. Model picker: fetched from `/api/models` (server proxies with the key).
3. Chat request sends `x-openrouter-key` header; the route builds the provider
   for that request. **The key is never written to disk/server state.**
4. No key → UI shows settings prompt instead of failing silently.

**Product-ready swap points:** key storage → encrypted DB (auth);
`/api/chat` can add rate limits/logging; sessions → DB.

## 7. UI (v1)

- One-page chat: header (app name + settings button), message list, composer.
- Tool parts rendered inline as cards: chart (interactive ECharts), flow
  (Mermaid SVG), question (buttons), table (parsed data preview), fetch result.
- Dark, dense, developer aesthetic.

## 8. Testing

- Vitest: each tool (schema validation, error paths, normalization), interrupt
  logic in ask_user_question, prompt correctness (tools described in prompt).
- No network in unit tests (mock fetch).
- Verify: `bun run lint`, `bun run typecheck`, `bun run build`, `bun run test`.

## 9. Out of scope (later)

Native provider keys, auth, persistence DB, file upload, opencode plugin port,
image rendering (ECharts custom series), web search tool.
