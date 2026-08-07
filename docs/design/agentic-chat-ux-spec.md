# Agentic Chat — UX/UI Design Specification

**Product:** BYOK agentic chatbot (OpenCode Go first, OpenAI/Anthropic later)
**Author:** Senior product design spec, v1
**Status:** Ready for implementation review

Design principles that everything below serves:

1. **The agent is a coworker, not a magic box.** Every autonomous action is visible, auditable, and reversible.
2. **Calm competence.** One accent color, quiet surfaces, dense but never cramped. The UI disappears; the work shows.
3. **Nothing is ever "stuck" without saying so.** Every state says what is happening and what happens next.
4. **Widgets are conversation, not embeds.** Same visual family, same rhythm as text, no iframe feel.

---

## 1. Overall Layout

### Desktop (>= 1024px)

Three-region grid:

```
+----------------+-----------------------------+----------------+
| Sidebar 264px  |  Main thread (fluid)        |  Activity      |
| (collapsible)  |  max-w 760px, centered      |  rail 300px    |
|                |  + widget breakout 960px    |  (collapsible) |
+----------------+-----------------------------+----------------+
```

- **Sidebar (264px, collapsible):** session/thread list (recent 20, grouped by day), pinned threads, bottom cluster: model + provider switcher, API key status chip, settings. Sessions persist to `localStorage` in v1 (swap point: DB).
- **Main thread:** the conversation. Text flows at a reading-friendly 660px measure; **wide widgets (charts, tables, flows) break out to 960px** rather than being crammed into the text column. Breakout is capped and centered, never edge-to-edge — the thread always stays visually centered, widgets just get more room.
- **Activity rail (300px, collapsible):** the reasoning trail (Section 9) and session details. Collapsed by default; auto-opens on the first multi-step turn; never steals focus.

**Rationale vs. alternatives:** a single fluid column (everything at chat width) was rejected because charts are the product's core value — a 200x180 chart in a 660px column reads as an afterthought. A full canvas/notepad layout (arbitrary drag-anywhere widgets) was rejected as over-engineered for v1 and hostile to mobile reuse. The breakout pattern gets 85% of the benefit at 10% of the cost.

### Mobile (< 1024px)

Single column. Sidebar becomes a left drawer (same content, full-height); Activity rail becomes a bottom sheet (swipe-down to dismiss, or "Steps" pill button in the header). Breakout width collapses to the thread width minus padding — charts get a min-height of 260px and horizontal scroll for dense content. Composer is thumb-reachable: single-row input, send button right, and a horizontal scroll of tool-suggestion chips above it on first run.

---

## 2. Message Anatomy

### One agent turn = one visual unit

A full agent turn — including every tool call, widget, and intermediate text — renders as **one contiguous card** with a single left border accent. Blocks inside:

```
┌────────────────────────────────────────────┐
│ [reasoning chips row — collapsed]          │  ← optional, Section 9
│                                            │
│ Analysis text (streamed)                   │
│                                            │
│ ┌─ widget card: Chart ──────────────────┐  │
│ │ header · canvas (breakout to 960px)   │  │
│ └───────────────────────────────────────┘  │
│                                            │
│ "One thing to note…" (follow-up text)      │
│                                            │
│ ┌─ widget card: Question (waiting) ─────┐  │
│ └───────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

**Why one unit, not discrete stacked messages:** discrete blocks would fragment one coherent reasoning response into what reads like five different bots answering. A single turn container (a) preserves reading flow, (b) makes the whole turn collapsible ("collapse this answer"), and (c) makes the *audit* story clean — one turn, one reasoning trail. Inside the card, text and widgets alternate with a consistent 16px rhythm; text is always visually primary (widgets are "evidence").

### Visual hierarchy of the three content classes

| Class | Treatment | Why |
|---|---|---|
| User message | Right-aligned pill, solid accent fill, own text on dark | Unmistakable origin; classic chat affordance |
| Agent text | Plain, no bubble; default foreground | Agent speaks *to* you, not *at* you — no chrome |
| Widget output | Nested card: 1px border, tinted surface, icon + title header | Clearly "rendered artifact," not prose — but same family |

### Tool call traces

Tool calls themselves (args/result) are **not** part of the visible anatomy — they live in collapsed chips (Section 3) and the Activity rail. The thread shows *outcomes* (charts, tables, "fetched 3 sources"), not machinery.

---

## 3. Agent State Communication

### State vocabulary

| State | Visual | Legible because… |
|---|---|---|
| Thinking | Small spinner + **label of intent**: "Thinking about how to chart this…" | Says what the agent is working on, not just that it's busy |
| Calling tool X | Chip appears in-stream: tool icon + name + animated pulse, e.g. `fetch_url · Fetching…` then completes to `fetch_url · 3 sources · 1.2s` | The chip *becomes* the summary when done — state to artifact with no pop-in |
| Waiting for input | Question widget glows (Section 5); composer shows "Awaiting your answer — pick an option or type below" | The *whole UI* signals whose turn it is, not just the widget |
| Streaming | Text reveals with a caret cursor; widget headers pop in when their data arrives | Progressive disclosure = progress |
| Tool failed | Chip flips to red, inline, with error summary; agent continues | Failure is a *step* of the conversation, not an interruption |

**Global rule:** no bare spinner, ever. Every busy state carries a word that describes the next thing ("Fetching…", "Planning…", "Rendering chart…"). If the agent has been silent for >5s, the thinking label rotates through observed sub-steps.

### Transparency: show or hide tool calls?

**Show them — collapsed.** Default view: one chip row per turn, one chip per tool call, in order, each with icon, name, duration, and an outcome tag ("OK" / "3 rows" / "failed"). Clicking a chip expands a small panel with:

- **Expanded (default open on click):** a readable summary — URL fetched, number of rows parsed, chart dimensions, the exact question asked. Never raw JSON; never the system prompt.
- **Details (second click):** raw input/output with copy buttons.

**Rationale:** agentic products that hide tool activity (ChatGPT defaults) breed "did it make that up?" anxiety; products that show everything (early agent UIs) overwhelm. Collapsed chips give auditability at zero cognitive cost. This is a contested decision — see Section 10.2 — and the collapse default is the compromise.

---

## 4. Widget Design System

### Shared language (all widgets)

- Corner radius **12px**; 1px border `zinc-800`; surface `white/3%` overlay; no drop shadows except a whisper `0 1px 0 rgba(0,0,0,.4)` for depth.
- Header bar: **40px tall**, icon 16px + title (medium, 13px) left; status chip + actions right. Same structure for every widget → the family reads instantly.
- Inner padding 16px; content-to-header gap 12px; footer (when present) 12px, hairline top border.
- All widgets: `role="region"`, descriptive `aria-label`, keyboard-operable controls.
- **Conversation-congruence rule:** no widget gets its own app-chrome look — no big shadows, no rounded-3xl glass panels, no nested "windows." A widget is a *flattened card sitting on the turn card*, which is a *flattened card on the canvas*. Same elevation everywhere → nothing reads as a bolted-on iframe.

### Chart widget

- **Layout:** breakout to 960px when series ≥ 2 or labels ≥ 8; otherwise inline at thread width. Height 260px (inline) / 340px (breakout), min 220px.
- **Header:** icon + "Chart · Bar" + data provenance chip ("From: pasted CSV").
- **Toolbar (right):** export PNG, "View data" (opens the underlying table as a Table widget in a popover), chart-type switcher (Bar/Line/Area — *only* for compatible data, disabled otherwise).
- **Interaction:** hover tooltips (axis-crosshair), legend toggles series, `dataZoom` on >20 points. Empty/zero-value states render "No data" watermark — never an empty canvas.
- **Malformed spec fallback:** if the agent emits a spec that fails validation, show the raw data as a Table widget + a small amber chip "chart spec couldn't render — showing data instead." The agent's reasoning trail records the failure.

### Flow/process diagram widget

- **Layout:** breakout 960px; natural height up to 520px, then scrolls.
- **Header:** "Diagram · Flowchart" + title chip.
- **Interaction:** SVG from Mermaid, rendered client-side; zoom on hover (CSS transform), click-to-expand to a full-viewport overlay (no iframe — same SVG scaled) with pan + fullscreen + copy-source actions.
- **Failure:** the widget renders the raw Mermaid source in a mono block with an explicit "couldn't render" chip — same non-scary pattern as charts.

### Data table widget

- **Layout:** inline by default, breakout at >5 columns. Max height 360px, sticky header, vertical scroll.
- **Header:** "Table · 1,204 rows" + column-type legend (mono `num` / `str` / `bool` chips).
- **Toolbar:** sort (per-column, click header), filter (per-column input popover), export CSV.
- **Footer:** "Showing 8 of 1,204 rows · download full CSV" — the agent's preview vs. the full data is *always* explicit. Trust rule: never hide that data was truncated.

### Question widget (agent asks, user answers)

- **Layout:** inline, full thread width. Distinct treatment: **accent-tinted border** (emerald at 30%), 4px left accent bar — this is the one widget that breaks the neutral family because it is *a request, not an artifact*.
- **Header:** "Question" + "1 of 1" when batched.
- **Options:** full-width, left-aligned buttons (not chips — thumb-friendly, readable at 13px) with number-key hints `1` `2` `3`. Max 8 options per spec.
- **States:** pending (buttons active, gentle pulse on the card border), answered (picked option becomes solid accent; others dim; inline confirmation "You chose: Bar chart"), stale (a newer question supersedes it → dims to 40% opacity, marked "superseded").
- **Typed fallback:** small "Type your own…" input at the bottom of the card, always available (Section 5).

### Form widget (agent requests structured input)

- **Layout:** inline, thread width; fields stacked (label 12px medium, input 36px, mono for numeric/ID fields).
- **Header:** "Form · Booking details".
- **Validation:** inline per-field messages on blur; the agent's requested constraints (from its tool spec) are rendered as the field hints — *the agent's schema becomes the form's schema*.
- **Actions:** Submit (accent) + Skip ("I don't have all of this" — sends what's filled and tells the agent what's missing). Cancel collapses the form back to a question-style summary.

---

## 5. Human-in-the-Loop: the ask_user_question pattern

### The flow

1. Agent calls `ask_user_question` → the loop stops (server-side `stopWhen`), the Question widget renders, status flips to `waiting_for_input`.
2. **The composer disables while a question is pending.** Rationale: the agent is paused *on this question*; a new typed message would arrive out of context and derail the loop. The disabled composer says "Awaiting your answer…" so the state is explicit, not frustrating.
3. User clicks an option → widget flips to answered state, composer re-enables, answer resumes the loop.

### Buttons vs. typing: support both

Buttons are primary, but **"Type your own…" inside the card is always available** — the user may want to answer with something the agent didn't anticipate, or free-text a date/name. Typed answers submit on Enter and are validated for length client-side. The composer stays disabled regardless; the in-card input is the only typing surface while a question is pending. **Contested decision — see Section 10.3.**

### How the answer appears in history

**Inline confirmation, not a fabricated user bubble.** The card shows "You chose: Bar chart" and the next agent turn continues naturally. The answer *is* included in the conversation state sent to the model, but the UI does not render a fake user message ("[Answer] Bar chart") — protocol text in the thread reads as spam and teaches users the answer didn't matter.

Edge: if the user *did* type a free-form answer, it appears as their own real user bubble (it's their words, not a protocol echo).

---

## 6. BYOK / Provider Management UX

### First-run empty state (first-class, not an afterthought)

Hero layout, centered, three explicit steps with a progress affordance:

1. **Get a key** — provider cards (OpenCode Go first; OpenAI, Anthropic as "coming soon" cards): logo, one-line pitch, "How to get your key" expanding to exact steps (`~/.local/share/opencode/auth.json` for OpenCode Go).
2. **Paste it** — key input with show/hide, format validation (`sk-…`), **live validation**: on save, the app pings the provider (model list + a 1-token completion). Feedback states: validating (spinner), valid (green check + "Connected"), invalid (red, specific: "401 — key rejected" / "network error — can't reach provider").
3. **Pick a model** — grouped model picker: recommended (top 3 with context-window badges), everything else searchable. Default preselected (`deepseek-v4-flash` for OpenCode Go).

A "Skip for now" link demotes the hero to a compact dismissible banner — the chat is never hard-blocked, just politely gated.

### Settings panel

**Drawer from the left** (consistent with the sidebar — it *is* the sidebar's deep panel), not a modal: modals interrupt the conversation; settings are a side task.

- **Provider section:** active provider card (key masked `…k4x9`, "change"/"remove"), provider switcher list.
- **Key section:** input, validation status chip (revalidates on demand — "Test connection"), last-validated timestamp.
- **Model section:** picker (as above) + "what this controls" caption.
- **Privacy line:** "Your key is stored in this browser only and sent per-request. It is never written to the server." — stated once, plainly, in the panel and on first run.

### Invalid/expired key mid-conversation

1. The next request returns 401 → **inline thread banner** (not modal): red hairline card, "Your key was rejected (401). It may have expired or been revoked." + buttons: "Open settings" / "Retry" (in case it was transient).
2. The failed turn is preserved as-is, marked "interrupted — not delivered."
3. On retry with a valid key, the user can "Resume" the interrupted turn (regenerates the response).

The conversation is never destroyed, never silently dropped, never modal-blocked.

---

## 7. Error and Edge States

All errors are **inline, in-context, recoverable**. No modals that break flow. Shared anatomy: thin tinted card (12px radius, 1px border), icon + short title + one-line explanation + concrete action.

| Failure | Treatment |
|---|---|
| Tool call fails | Red chip in the reasoning trail + inline note in the turn; the agent usually self-corrects (its next text says so). If the agent gives up: amber card "I couldn't complete this step" + "Retry step" / "Ask me to try differently". |
| Malformed widget data | Widget falls back to its raw-data view (Section 4) with an amber "couldn't render" chip. Never blank, never a modal. |
| Streaming connection drops | Composer shows "Connection interrupted…" + auto-retry countdown (3s). On failure: keep partial content visible, mark it "Response incomplete", offer **Retry** / **Regenerate** / **Copy partial**. Partial work is never deleted silently. |
| Rate limit / quota | Amber inline card with wait estimate when the provider reports it, "Retry" auto-disables for the cooldown window. For BYOK: prompt to check the provider console — the app can't fix a user-side quota. |
| Provider unreachable | Neutral gray card: "Can't reach the provider — is your network up?" + Retry. Distinct from 401 (key problem) — errors name *which* thing failed. |

**Tone rule for all error copy:** state the fact, state the cause if known, state the next action. Never "Something went wrong."

---

## 8. Visual Identity

### Direction: "Instrument Panel" (chosen)

- **Color:** near-black zinc canvas (`#09090b`), surfaces at `white/2–4%` steps, one functional accent — **emerald** — reserved for *action* (send, confirm, pick). Semantic colors stay semantic: red = failure, amber = waiting/attention, blue = informational. No gradients, no purple, no glassmorphism.
- **Type:** Geist Sans (UI + prose) and Geist Mono (tool names, IDs, numbers, timestamps). The mono/sans split is deliberate: it visually encodes "machine protocol" vs. "human words," reinforcing the transparency story — numbers and tool calls *look* like machine output.
- **Spacing:** 4px base grid. Turn padding 20px, block gap 16px, widget inner 16px, header 40px. Density is high but every grouping has a defined rhythm — density comes from purpose, not cramming.
- **Motion:** 150ms ease-out for states, 250ms for surfaces; only *meaningful* motion (pulse on pending question, chip completion). No decorative animation.

**Why "capable and calm":** the product's promise is *your model, your data, transparent work*. Emerald-on-zinc reads as surgical and trustworthy; it matches the developer-native posture of the OpenCode ecosystem (the product's first distribution channel), and it lets widgets (charts, diagrams) carry color without competing with chrome.

### Alternatives considered and rejected

1. **"Neon demo"** — deep purple + cyan gradients, glassmorphism, glow. Rejected: instantly reads as a consumer AI demo; visual noise competes with charts; color is spent on decoration instead of semantics; fatigues in long sessions (this is a work tool, not a novelty).
2. **"Enterprise light"** — white canvas, blue primary, heavy chrome, tables everywhere. Rejected: contradicts the terminal-native user base; blue as *the* accent forces all status colors into a confusing family (blue buttons + blue links + blue info); light canvas makes dense data widgets feel sterile rather than focused.
3. **"Warm editorial"** — cream background, serif headlines, soft shadows, generous whitespace. Rejected: beautiful for long-form reading, wrong for a data tool — charts and tables want neutral high-contrast canvas; serif + cream reads "blog," not "instrument."

---

## 9. Information Density and Trust: the Reasoning Trail

### Inline (always visible, cheap)

The chip row per turn (Section 3) is the inline trail: `fetch_url → parse_data → render_chart → ask_user_question`, each chip with outcome + duration. Reading a turn gives you the *shape* of the agent's work in ~2 seconds.

### The Activity rail (the full audit)

Right rail with a "Steps" view, synchronized to the selected turn:

```
Steps · 4 · 3.4s
[1] fetch_url        https://api.github.com/…   200 · 812ms  ▸
[2] parse_data       24 rows · 5 cols            45ms         ▸
[3] render_chart     bar · 3 series · 12 pts     12ms         ▸
[4] ask_user_question "Which chart?"              —           ▸
```

Each row expands to: args summary, result summary, duration, token estimate, and per-step "retry" (for tools with side effects — a re-run, clearly labeled). Failed steps are marked and carry the error text.

**Rules:** the rail is *read-only-ish* (retry is opt-in per step), auto-opens on the first multi-step turn, collapses back when the user ignores it for a turn, and on mobile becomes the bottom sheet. The rail never duplicates the thread — it's the *ledger*; the thread is the *story*.

**Why this and not just inline chips:** auditability at two depths. Cost-sensitive users can read the chips; skeptical users can open the ledger. Building the trail from the already-streamed tool events (server `onToolExecutionEnd`) means zero extra model cost and no prompt bloat — it's UI, not context.

---

## 10. The Three Key Screens

### (a) Empty state / first run

Center column. Brand mark (mono "A/" glyph) at top. Headline: **"Bring your key. Ask anything."** Subline: "Your model, your data — charts, diagrams and tables rendered in the chat." Three step cards: 1 Get a key (provider cards, OpenCode Go active, OpenAI/Anthropic coming-soon) → 2 Paste & verify (input + live validation) → 3 Pick a model (recommended preselected). Below: four sample prompts as tappable suggestion cards. Sidebar shows "No sessions yet"; composer present but disabled with "Connect a key to start." Everything is one screen deep — no dead-ends, no hidden setup.

### (b) Mid-conversation: chart + question widget

User bubble: "Chart my sales and ask me which comparison matters." Agent turn card: reasoning chip row (collapsed: 3 chips) → streamed intro text → **Chart widget at breakout width** (bar chart, legend, "From: pasted CSV" chip, PNG/table actions) → one sentence linking text → **Question widget** (emerald-tinted, "Which comparison matters?" with 3 option buttons + "Type your own…") with the composer disabled reading "Awaiting your answer…". Activity rail open showing 4 steps; the `ask_user_question` row highlighted as pending. Reading the screen tells you exactly what happened, what's shown, and who's turn it is — three glances, zero ambiguity.

### (c) Settings / key management

Left drawer over the sidebar. Provider card cluster (OpenCode Go connected, key masked, "Test connection" → green check, "Remove"). Model picker grouped (Recommended / All, search box, context badges). Privacy statement at the bottom. If the key is invalid: the card shows red status + "Open key" inline retry. No nested modals anywhere.

---

## 11. Contested decisions (called out explicitly)

1. **Show tool calls or hide them?** ChatGPT-style hiding maximizes polish; full visibility maximizes auditability. **Decision: show, collapsed, with a two-level expand.** Rationale: the target user is a developer who will notice and resent hidden tool activity; collapsed-by-default keeps polish. Revisit if user testing shows chip rows read as noise.

2. **Composer disabled while a question is pending?** Disabling can feel paternalistic; allowing typing lets power users drive. **Decision: disable the composer, but keep the in-card typed fallback.** Rationale: the agent's loop is genuinely paused — out-of-band messages produce confusing multi-threaded turns. The in-card input preserves freedom without breaking the loop.

3. **Answer echo: real user bubble vs. inline confirmation.** A bubble pollutes history with protocol text and makes the UI lie ("the user said [Answer] Bar chart"). Inline confirmation is cleaner but means the answer isn't quoted in the visible thread. **Decision: inline confirmation, plus the typed-fallback answer renders as a real bubble** (it's genuine user text). Tradeoff accepted: audit purists may want every answer visible in-line; the question card itself *is* the record.

4. **Wide widgets: breakout or uniform column?** Uniformity is simpler and predictable; breakout honors the artifact. **Decision: breakout, capped and centered.** Charts are the differentiator; a 660px-cramped chart devalues the product. The cap keeps the thread feel.

5. **Reasoning trail: rail or inline-only?** Inline-only (like Claude's "Thought for 3s") is cheaper to build; the rail enables real auditing. **Decision: both, rail collapsed by default.** The chips cost nothing; the rail is the trust investment that differentiates an agent product from a chatbot.
