import { z } from "zod";
import { ToolError } from "./errors";

/**
 * Skills are progressive disclosure for instructions.
 *
 * Level 1 — every enabled skill's name and description sit in the system
 * prompt. That is two lines each, so a large library stays affordable.
 * Level 2 — `load_skill` returns the body, once, when the model decides the
 * skill applies.
 * Level 3 — the body names its resources; `read_skill_resource` fetches one at
 * a time, so a long reference table is only paid for by the turn that needs it.
 *
 * Nothing here executes: a skill is instructions, templates and reference text.
 * The model reads it and acts through the tools it already has.
 */

/** Lowercase kebab, like a directory name. Doubles as the model-facing handle. */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const SKILL_LIMITS = {
  name: 64,
  description: 400,
  body: 20_000,
  resourcePath: 120,
  resource: 40_000,
  resourceCount: 20,
} as const;

export const loadSkillSchema = z.object({
  name: z.string().min(1).max(SKILL_LIMITS.name).describe("The skill's name, exactly as listed."),
});

export const readSkillResourceSchema = z.object({
  name: z.string().min(1).max(SKILL_LIMITS.name),
  path: z.string().min(1).max(SKILL_LIMITS.resourcePath),
});

export type LoadSkillArgs = z.infer<typeof loadSkillSchema>;
export type ReadSkillResourceArgs = z.infer<typeof readSkillResourceSchema>;

export interface SkillSummary {
  name: string;
  description: string;
}

export interface SkillDetail extends SkillSummary {
  body: string;
  /** Resource paths only — contents are a separate, opt-in fetch. */
  resources: string[];
}

export interface SkillLoaded extends SkillDetail {
  kind: "skill_loaded";
}

export interface SkillResourceRead {
  kind: "skill_resource";
  name: string;
  path: string;
  content: string;
}

/**
 * Per-request port, mirroring `MemoryStore`: the tools need one user's library
 * without importing the database, which also keeps them testable with a plain
 * object.
 */
export interface SkillStore {
  list(): Promise<SkillSummary[]>;
  load(name: string): Promise<SkillDetail | null>;
  readResource(name: string, path: string): Promise<string | null>;
}

/** Trims a payload the model is about to read, and says so in-band. */
function cap(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n[truncated at ${limit} characters]`;
}

export async function loadSkill(args: LoadSkillArgs, store: SkillStore): Promise<SkillLoaded> {
  const name = args.name.trim();
  const skill = await store.load(name);

  if (!skill) {
    // Name the alternatives rather than just failing: the model picked this
    // handle out of the system prompt, so a near miss is recoverable in one
    // retry if it can see the real spelling.
    const available = (await store.list()).map((s) => s.name);
    throw new ToolError(
      available.length > 0
        ? `No skill named "${name}". Available: ${available.join(", ")}.`
        : `No skill named "${name}". This user has no skills installed.`,
    );
  }

  return {
    kind: "skill_loaded",
    name: skill.name,
    description: skill.description,
    body: cap(skill.body, SKILL_LIMITS.body),
    resources: skill.resources,
  };
}

export async function readSkillResource(
  args: ReadSkillResourceArgs,
  store: SkillStore,
): Promise<SkillResourceRead> {
  const name = args.name.trim();
  const path = args.path.trim();
  const content = await store.readResource(name, path);

  if (content === null) {
    const skill = await store.load(name);
    if (!skill) throw new ToolError(`No skill named "${name}". Call load_skill first.`);
    throw new ToolError(
      skill.resources.length > 0
        ? `"${name}" has no resource at "${path}". It has: ${skill.resources.join(", ")}.`
        : `"${name}" has no resources.`,
    );
  }

  return { kind: "skill_resource", name, path, content: cap(content, SKILL_LIMITS.resource) };
}

/**
 * The level-1 view: what goes in the system prompt. Descriptions are the whole
 * trigger, so they are passed through verbatim — the model has nothing else to
 * go on when deciding whether to load.
 */
export function formatSkillIndex(skills: SkillSummary[]): string {
  return skills.map((s) => `- **${s.name}** — ${s.description}`).join("\n");
}

/** Turns a display name into a legal handle: "Weekly Report!" → "weekly-report". */
export function slugifySkillName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SKILL_LIMITS.name);
}

export interface ParsedSkillMarkdown {
  name: string | null;
  description: string | null;
  body: string;
}

/**
 * Reads Claude's SKILL.md shape — a `---` frontmatter block carrying `name` and
 * `description`, then the instructions — so an existing skill can be pasted in
 * whole. Deliberately not a YAML parser: those two scalar keys are the entire
 * contract, and a document with no frontmatter is a valid body on its own.
 */
export function parseSkillMarkdown(source: string): ParsedSkillMarkdown {
  const text = source.replace(/^﻿/, "").trimStart();
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { name: null, description: null, body: source.trim() };

  const fields = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    fields.set(kv[1].toLowerCase(), kv[2].trim().replace(/^["']|["']$/g, ""));
  }

  return {
    name: fields.get("name") || null,
    description: fields.get("description") || null,
    body: text.slice(match[0].length).trim(),
  };
}

/** Validation shared by the API route and the tests. Returns an error message. */
export function validateSkill(input: {
  name: string;
  description: string;
  body: string;
  resources?: Record<string, string>;
}): string | null {
  if (!SKILL_NAME_PATTERN.test(input.name)) {
    return "Name must be lowercase letters, digits and single hyphens, e.g. weekly-report.";
  }
  if (input.name.length > SKILL_LIMITS.name) return `Name must be under ${SKILL_LIMITS.name} characters.`;
  if (input.description.trim().length < 10) {
    return "Description must be at least 10 characters — it is the only thing the model sees when deciding to use the skill.";
  }
  if (input.description.length > SKILL_LIMITS.description) {
    return `Description must be under ${SKILL_LIMITS.description} characters.`;
  }
  if (input.body.trim().length === 0) return "Instructions cannot be empty.";
  if (input.body.length > SKILL_LIMITS.body) {
    return `Instructions must be under ${SKILL_LIMITS.body} characters.`;
  }

  const resources = Object.entries(input.resources ?? {});
  if (resources.length > SKILL_LIMITS.resourceCount) {
    return `A skill can have at most ${SKILL_LIMITS.resourceCount} resources.`;
  }
  for (const [path, content] of resources) {
    if (!path.trim()) return "Resource paths cannot be empty.";
    if (path.length > SKILL_LIMITS.resourcePath) {
      return `Resource path "${path}" is too long.`;
    }
    if (content.length > SKILL_LIMITS.resource) {
      return `Resource "${path}" must be under ${SKILL_LIMITS.resource} characters.`;
    }
  }
  return null;
}
