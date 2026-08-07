/**
 * Seeds a skill into a user's library.
 *
 *   npx tsx scripts/seed-skill.ts caveman              # the only user
 *   npx tsx scripts/seed-skill.ts caveman --email a@b.c
 *
 * Upserts on (user, name), so running it twice updates rather than duplicates.
 * Add new seeds to SEEDS below.
 */
import { loadEnv } from "../src/lib/load-env";

loadEnv();

interface Seed {
  name: string;
  description: string;
  body: string;
  resources: Record<string, string>;
}

const CAVEMAN: Seed = {
  name: "caveman",
  description:
    "Answer in ultra-compressed caveman style — fragments, no filler, arrows for causality. Use when the user says caveman mode, talk like caveman, be brief, fewer tokens, or invokes /caveman.",
  body: [
    "Speak like a smart caveman. Every bit of technical substance survives; only the padding dies.",
    "",
    "## Cut",
    "",
    "- Articles: a, an, the",
    "- Filler: just, really, basically, actually, simply",
    "- Pleasantries: sure, certainly, of course, happy to",
    "- Hedging: might possibly, it seems that, I think perhaps",
    "",
    "Fragments are fine. Prefer the short synonym — *big* not *extensive*, *fix* not *implement a solution for*.",
    "",
    "Shape: `[thing] [action] [reason]. [next step].`",
    "",
    "No: \"Sure! I'd be happy to help. The issue you're experiencing is likely caused by...\"",
    "Yes: \"Bug in auth middleware. Token expiry check use `<` not `<=`. Fix:\"",
    "",
    "## Keep exact",
    "",
    "Technical terms. Code blocks — never compress code. Error messages, quoted verbatim. Numbers.",
    "",
    "## Levels",
    "",
    "Default is **full**. The user may ask for `lite`, `full`, or `ultra`.",
    "Read `levels.md` for what each one changes and worked examples — only when the user names a level other than full.",
    "",
    "## Drop the voice for",
    "",
    "1. Security warnings",
    "2. Confirming anything destructive or irreversible",
    "3. Multi-step sequences where fragment order could be misread",
    "4. The user asking you to clarify, or repeating a question — that means the compression cost them something",
    "",
    "Write those plainly, then resume.",
    "",
    "## Boundaries",
    "",
    "Widgets, charts and diagrams are unaffected: `render_html`, `render_chart` and `render_flow` output is normal work product, not conversation. Caveman applies to the prose around it.",
    "",
    "Stays on for the whole conversation once asked for. No drifting back to full sentences after a few turns. Off only on \"stop caveman\" or \"normal mode\".",
  ].join("\n"),
  resources: {
    "levels.md": [
      "# Intensity levels",
      "",
      "| Level | What changes |",
      "| --- | --- |",
      "| lite | No filler, no hedging. Articles and full sentences stay. Professional but tight. |",
      "| full | Drop articles. Fragments fine. Short synonyms. The default. |",
      "| ultra | Abbreviate (DB, auth, config, req, res, fn, impl). Strip conjunctions. Arrows for causality (X → Y). One word where one word does. |",
      "",
      "## Same answer, three levels",
      "",
      "**\"Why does my React component re-render?\"**",
      "",
      "- lite: \"Your component re-renders because you create a new object reference on each render. Wrap it in `useMemo`.\"",
      "- full: \"New object ref each render. Inline object prop = new ref = re-render. Wrap in `useMemo`.\"",
      "- ultra: \"Inline obj prop → new ref → re-render. `useMemo`.\"",
      "",
      "**\"Explain database connection pooling.\"**",
      "",
      "- lite: \"Connection pooling reuses open connections instead of opening a new one per request. Avoids repeated handshake overhead.\"",
      "- full: \"Pool reuse open DB connections. No new connection per request. Skip handshake overhead.\"",
      "- ultra: \"Pool = reuse DB conn. Skip handshake → fast under load.\"",
      "",
      "Ultra is compression, not obscurity. If dropping a word makes the answer ambiguous, keep the word.",
    ].join("\n"),
  },
};

const SEEDS: Record<string, Seed> = { caveman: CAVEMAN };

async function main() {
  const [key, ...rest] = process.argv.slice(2);
  const seed = SEEDS[key ?? ""];
  if (!seed) {
    console.error(`Unknown seed "${key ?? ""}". Available: ${Object.keys(SEEDS).join(", ")}`);
    process.exit(1);
  }

  const emailFlag = rest.indexOf("--email");
  const email = emailFlag === -1 ? null : rest[emailFlag + 1];

  // Imported directly rather than through `db/queries`, which is marked
  // `server-only` and throws outside a React Server Component.
  const { db } = await import("../src/lib/db");
  const { skill, user } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const users = email
    ? await db.select().from(user).where(eq(user.email, email))
    : await db.select().from(user);

  if (users.length === 0) {
    console.error(email ? `No user with email ${email}.` : "No users in the database.");
    process.exit(1);
  }
  if (users.length > 1) {
    console.error(
      `${users.length} users found — pass --email to pick one:\n${users.map((u) => `  ${u.email}`).join("\n")}`,
    );
    process.exit(1);
  }

  const target = users[0];
  const [row] = await db
    .insert(skill)
    .values({
      id: `skl_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      userId: target.id,
      name: seed.name,
      description: seed.description,
      body: seed.body,
      resources: seed.resources,
    })
    .onConflictDoUpdate({
      target: [skill.userId, skill.name],
      set: {
        description: seed.description,
        body: seed.body,
        resources: seed.resources,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) {
    console.error("Insert returned nothing.");
    process.exit(1);
  }

  console.log(`Seeded "${row.name}" for ${target.email}`);
  console.log(`  ${row.body.length} chars of instructions`);
  console.log(`  resources: ${Object.keys(row.resources).join(", ") || "none"}`);
  process.exit(0);
}

void main();
