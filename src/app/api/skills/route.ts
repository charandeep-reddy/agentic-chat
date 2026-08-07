import { createSkill, listSkills } from "@/lib/db/queries";
import { requireUserApi } from "@/lib/session";
import { parseSkillMarkdown, slugifySkillName, validateSkill } from "@/lib/tools/skills";

export const dynamic = "force-dynamic";

interface SkillBody {
  name?: string;
  description?: string;
  body?: string;
  resources?: Record<string, string>;
  /** A whole SKILL.md pasted in; frontmatter fills the fields it carries. */
  source?: string;
}

export async function GET() {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const skills = await listSkills(authed.user.id);
  return Response.json({ skills });
}

export async function POST(req: Request) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  let input: SkillBody;
  try {
    input = (await req.json()) as SkillBody;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // A pasted SKILL.md is the fast path; explicit fields win over its
  // frontmatter so the form can correct a document that got either wrong.
  const parsed = input.source ? parseSkillMarkdown(input.source) : null;
  const name = slugifySkillName(input.name ?? parsed?.name ?? "");
  const description = (input.description ?? parsed?.description ?? "").trim();
  const body = (input.body ?? parsed?.body ?? "").trim();

  const invalid = validateSkill({ name, description, body, resources: input.resources });
  if (invalid) return Response.json({ error: "invalid", message: invalid }, { status: 400 });

  const skill = await createSkill(authed.user.id, {
    name,
    description,
    body,
    resources: input.resources ?? {},
  });
  if (!skill) return Response.json({ error: "not_created" }, { status: 500 });

  return Response.json({ skill }, { status: 201 });
}
