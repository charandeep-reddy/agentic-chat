# Security policy

## Reporting a vulnerability

Please report security issues privately through [GitHub's private vulnerability reporting](https://github.com/charandeep-reddy/agentic-chat/security/advisories/new) rather than opening a public issue.

Include what you did, what happened, and what you expected. A proof of concept helps. You'll get an acknowledgement within a few days.

## Scope

This is a self-hosted application: there is no service to attack, and each deployment holds only its own operator's data. The interesting surfaces are:

**Generated HTML artifacts.** `render_html` renders model output as a live document. It is sanitised server-side (`lib/tools/render-html.ts`) and rendered in an iframe with `allow-scripts` but deliberately *without* `allow-same-origin`, giving it a unique opaque origin, plus a `default-src 'none'` CSP that blocks all network access. A way to break out of that frame, reach the parent document, or make an outbound request from inside it is a genuine vulnerability.

**Authorization.** Every query in `lib/db/queries.ts` scopes by `userId`, and every route handler goes through `requireUserApi`. A path that reads or writes another user's chats, memories, or settings is a vulnerability.

**Share links.** A shared chat is readable by anyone holding its unguessable `shareId`, by design. Enumerating share ids, or reading a chat that was never shared, is not.

**Prompt injection.** Content fetched by `fetch_url` and text pasted by the user is untrusted. Custom instructions are framed as background rather than commands in the system prompt. Reports that improve this boundary are welcome, though the model ultimately decides what to do with what it reads.

## Out of scope

- **Your model API key.** It is stored in `localStorage` and sent per-request, by design — that is what "bring your own key" means. Anyone with access to your browser profile can read it. It is never sent to or stored on the server.
- **What the model says.** Hallucinations, refusals, and bad answers are model behaviour, not application vulnerabilities.
- Missing hardening on a deployment you control (rate limits, WAF, TLS termination).
