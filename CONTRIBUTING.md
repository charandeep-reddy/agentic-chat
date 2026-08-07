# Contributing

Thanks for taking a look. Issues, ideas and pull requests are all welcome.

## Setup

```bash
bun install
cp .env.example .env.local     # fill in DATABASE_URL and BETTER_AUTH_SECRET
createdb agentic_chat_dev
bun run db:migrate
bun run dev
```

You don't need an OAuth app to work on this — sign up with an email and password on `/sign-in`. For scripting, `bun run scripts/dev-session.ts` mints a signed session cookie against your local database; paste it into devtools or pass it to `curl`.

You *do* need an API key for some OpenAI-compatible provider to exercise the agent loop itself. Anything works — point `MODEL_BASE_URL` at OpenRouter, Groq, Together, or a local Ollama.

## Before you open a PR

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

CI runs all four. Keep them green.

## Working on the schema

Edit `src/lib/db/schema.ts`, then:

```bash
bun run db:generate    # writes a migration into drizzle/
bun run db:migrate     # applies it locally
```

Commit the generated SQL. Don't hand-edit a migration that has already been pushed.

The four Better Auth tables (`user`, `session`, `account`, `verification`) must keep matching what `bunx @better-auth/cli generate` produces — if you change them, diff against that output first.

## House style

A few things that are load-bearing here rather than matters of taste:

- **Tools return specs, not markup.** A tool's job is to produce a Zod-validated payload; rendering it is the UI's job. This is what keeps the tool layer unit-testable and portable.
- **Tools are pure.** Everything in `src/lib/tools/` takes its arguments and returns a result. Anything needing per-user state takes a port (see `MemoryStore`), which is injected per request. That's why there's a test for every tool and no database in any of them.
- **Comments explain why.** The code says what it does. Reserve comments for the reason a non-obvious choice was made — and skip them where the code is already plain.
- **Use the design tokens.** `text-text-muted`, `border-border-subtle`, `bg-surface` and friends are defined in `src/app/globals.css`. Don't reach for raw `zinc-*` classes.
- **Errors the model can act on.** When a tool rejects input, say what was wrong and what valid input looks like. The agent retries on tool errors, so a good message often fixes itself.

## Security

Two areas deserve extra care in review:

- **`src/lib/tools/render-html.ts`** — sanitising, plus the CSP and sandbox that contain generated artifacts.
- **`src/lib/db/queries.ts`** — every query scopes by `userId`. A new query that forgets to is an authorization bug, not a style nit.

Please report vulnerabilities privately rather than in a public issue. See [SECURITY.md](SECURITY.md).

## Commits

Conventional-ish prefixes (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`). Say what changed and why in the body if it isn't obvious from the diff.
