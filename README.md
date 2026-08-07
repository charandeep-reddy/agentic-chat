# Agentic Chat

An open-source, bring-your-own-key AI chat app that renders what the model produces instead of describing it — interactive charts, Mermaid diagrams, parsed tables, live sandboxed HTML, and an interrupt tool that pauses the agent until you answer.

Accounts and chat history live in your own Postgres. Your model API key never does — it stays in your browser and is sent per-request.

**Stack:** Next.js 16 · Vercel AI SDK v7 · Better Auth · Drizzle + Postgres/Neon · Tailwind v4 · ECharts 6 · Mermaid 11 · Zod 4 · Vitest.

---

## Quick start

```bash
git clone https://github.com/charandeep-reddy/agentic-chat.git
cd agentic-chat
bun install
cp .env.example .env.local
```

Fill in `.env.local` (see [Configuration](#configuration)), then:

```bash
createdb agentic_chat_dev
bun run db:migrate
bun run dev
```

Open <http://localhost:3000>, sign in, click **Add API key**, and paste a key for any OpenAI-compatible provider.

### Running without an OAuth app

Setting up Google or GitHub OAuth just to poke at the code is friction. For local work you can mint a session directly:

```bash
bun run scripts/dev-session.ts
```

It prints a `better-auth.session_token=…` cookie — paste it into your browser's devtools (Application → Cookies) or pass it to `curl`. It refuses to run against anything but a local database.

---

## Configuration

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. Local or Neon — the same driver handles both. |
| `BETTER_AUTH_SECRET` | yes | Session signing key. Generate with `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | yes | Public origin, e.g. `http://localhost:3000`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Enables the Google button. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | — | Enables the GitHub button. |
| `MODEL_BASE_URL` | — | OpenAI-compatible endpoint. Defaults to OpenCode Go. |
| `DEFAULT_MODEL` | — | Defaults to `deepseek-v4-flash`. |
| `UTILITY_MODEL` | — | Cheap model used to name conversations. Defaults to `DEFAULT_MODEL`. |

Providers register only when their credentials are present, so a half-filled `.env.local` still boots and shows only the buttons that work.

**OAuth callback URLs**

- Google — `http://localhost:3000/api/auth/callback/google` ([console](https://console.cloud.google.com/apis/credentials))
- GitHub — `http://localhost:3000/api/auth/callback/github` ([settings](https://github.com/settings/developers))

### Using Neon

Copy the **pooled** connection string from the Neon console into `DATABASE_URL`, then `bun run db:migrate`. Nothing else changes: `node-postgres` speaks to Neon and a local Postgres over the same wire protocol, and the `sslmode=require` already in Neon's string is what turns TLS on.

---

## What the agent can do

| Tool | What it does |
|---|---|
| `render_html` | Live HTML/CSS/JS in a sandboxed frame — calculators, mockups, demos, SVG |
| `render_chart` | Bar / line / area / pie / scatter → interactive ECharts |
| `render_flow` | Mermaid flowchart / sequence / state / ER / gantt / … |
| `parse_data` | CSV / TSV / JSON → typed table with inferred column types |
| `fetch_url` | Server-side fetch of public URLs (CORS-free, SSRF-guarded, 2 MB cap) |
| `ask_user_question` | Pauses the loop, shows option buttons, resumes with your answer |
| `save_memory` / `search_memory` / `forget_memory` | Durable facts about you, across conversations |

Try: *"Build me an interactive compound-interest calculator"*, paste a CSV and ask for a chart, or *"draw the OAuth 2.0 authorization code flow"*.

## Features

- **Accounts** — Google and GitHub via Better Auth, sessions in your Postgres.
- **Chat history** — grouped sidebar, search across message bodies, pin, rename, archive, delete. Titles are generated in the background from your first message.
- **Memory** — the model saves durable facts about you and recalls them later. Review, edit, disable or delete any of them.
- **Memory packs** — bundle your memories into a shareable link; install someone else's with one click, and uninstall removes exactly what it added.
- **Custom instructions** — ChatGPT-style "about you" and "how to respond".
- **Editing & regenerating** — rewrite any message and re-run from there; regenerate any answer.
- **Sharing** — public read-only links for a conversation, `noindex`, revocable.
- **Export** — one chat as Markdown, or your whole account as JSON.
- **⌘K palette** — search chats by content, jump anywhere.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `⌘ K` | Search chats / jump |
| `⌘ ⇧ O` | New chat |
| `⌘ /` | Focus composer |
| `↵` / `⇧ ↵` | Send / newline |
| `esc` | Stop generating |

---

## How it works

**Rendering.** The agent emits structured specs — ECharts option data, Mermaid source, a question payload, an HTML document — never pixels. The UI renders them. Every spec is Zod-validated at the tool boundary, so a malformed tool call fails with a message the model can act on rather than producing a broken widget.

**HTML sandboxing.** `render_html` output is sanitised server-side (nested frames, forms, `<base>`, and `javascript:` URLs are stripped) and rendered in an iframe with `allow-scripts` but *without* `allow-same-origin`. The document gets a unique opaque origin: scripts run, but cannot reach the parent page, its cookies, or its storage. External network requests are blocked by the app's CSP, so an artifact cannot phone home.

**Interrupts.** `ask_user_question` returns an interrupt marker and the loop stops via `stopWhen: [isStepCount(8), hasToolCall("ask_user_question")]`. Your answer is appended as a user message and the loop resumes with full history.

**Persistence.** The user message is written before the stream starts, so a dropped connection still leaves your question in the transcript; the assistant message is written from the stream's `onEnd` with its tool parts intact, which is why widgets survive a reload. Editing or regenerating truncates everything at a higher ordinal, keeping the stored transcript identical to what the model saw.

**Memory.** Relevant memories are selected per-request by keyword overlap and inlined into the system prompt. Deliberately not embeddings: memories are short, few, and written in the user's own words, so token overlap gets the right answer without an extra model call per turn. `lib/memory-store.ts` is the single place to swap in pgvector.

**BYOK.** The key is read from `localStorage`, sent as the `x-model-key` header, and used to build a provider per request. It is never written to the server or the database.

## Project layout

```
app/api/chat/route.ts     Agent loop: auth, memory injection, streaming, persistence
app/api/…                 REST for chats, memories, packs, settings, account
app/c/[id]                A conversation
app/share/[shareId]       Public read-only transcript
app/pack/[slug]           Memory pack landing page
lib/db/                   Drizzle schema and every query
lib/tools/                Pure, unit-tested tool implementations
lib/prompts.ts            System prompt composition
components/               Chat UI, widgets, sidebar, palette, settings
tests/                    Vitest suite
```

## Scripts

```bash
bun run dev          # dev server (Turbopack)
bun run build        # production build
bun run lint         # ESLint
bun run typecheck    # tsc --noEmit
bun run test         # Vitest
bun run db:generate  # generate a migration from schema changes
bun run db:migrate   # apply migrations
bun run db:studio    # Drizzle Studio
```

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Good first issues are labelled [`good first issue`](https://github.com/charandeep-reddy/agentic-chat/labels/good%20first%20issue).

## License

[MIT](LICENSE)
