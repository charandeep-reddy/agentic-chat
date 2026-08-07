# Agentic Chat (BYOK)

An agentic chatbot where you bring your own API key. Live data rendering: interactive charts (ECharts), Mermaid diagrams, parsed tables, URL fetching, and an interactive question tool that pauses the agent until you answer.

Stack: Next.js 16 · Vercel AI SDK v7 · Tailwind v4 · ECharts 6 · Mermaid 11 · Zod 4 · Vitest 4.

## Run it

```bash
bun install
bun run dev        # → http://localhost:3000
```

Open the app, click **○ Add API key**, paste your OpenCode Go key (find it at `~/.local/share/opencode/auth.json` → `opencode-go`, or via `OPENCODE_API_KEY`), pick a model — `deepseek-v4-flash` is the default. The key lives in your browser's `localStorage` and is sent per-request; it is never persisted server-side.

## What the agent can do

| Tool | What it does |
|---|---|
| `ask_user_question` | Pauses the loop, shows option buttons, resumes with your answer |
| `parse_data` | CSV / TSV / JSON → typed table (quotes, nesting, type inference) |
| `fetch_url` | Server-side fetch of public URLs (CORS-free, SSRF-guarded, 2 MB cap) |
| `render_chart` | Bar / line / area / pie / scatter → interactive ECharts |
| `render_flow` | Mermaid flowchart / sequence / state / ER / gantt / … |

Try: paste CSV and ask for a chart; ask for a flowchart of a process; ask it to fetch a public API.

## Project layout

```
app/api/chat/route.ts     Agent loop: streamText + tool registry + OpenCode Go provider
app/api/models/route.ts   Model list proxy for the settings picker
lib/tools/                Pure, unit-tested tool implementations (shared shape with
                          opencode plugin tools — portable later)
lib/prompts.ts            System prompt
components/               Chat UI, chart/flow/question/table renderers, settings
tests/                    Vitest suite (31 tests)
```

## Scripts

```bash
bun run dev         # dev server (Turbopack)
bun run build       # production build
bun run lint        # ESLint
bun run typecheck   # tsc --noEmit
bun run test        # Vitest
```

## Architecture notes

- **Rendering principle:** the agent emits structured specs (ECharts option data, Mermaid source, question payload), never pixels. The UI renders them — deterministic, Zod-validated, portable to any frontend (including an opencode plugin, which uses the same tool shape).
- **Interrupt pattern:** `ask_user_question` returns an interrupt marker; the loop stops via `stopWhen: [isStepCount(6), hasToolCall("ask_user_question")]`. The answer is appended as a user message and the loop resumes with full history.
- **BYOK:** OpenCode Go (`https://opencode.ai/zen/go/v1`, OpenAI-compatible). Key sent per-request as `x-openrouter-key` header, provider built per-request server-side, never stored.
- **Product-ready swap points:** key storage (→ encrypted DB with auth), sessions (→ DB), rate limits/logging in `/api/chat`.
