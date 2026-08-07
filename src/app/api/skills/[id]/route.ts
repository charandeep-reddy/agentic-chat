import { deleteSkill, updateSkill } from "@/lib/db/queries";
import { requireUserApi } from "@/lib/session";
import { slugifySkillName, validateSkill } from "@/lib/tools/skills";
import type { Skill } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { id } = await params;
  let body: {
    name?: string;
    description?: string;
    body?: string;
    resources?: Record<string, string>;
    enabled?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const patch: Partial<Pick<Skill, "name" | "description" | "body" | "resources" | "enabled">> = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

  // The content fields are validated as a set, since a name is only legal
  // alongside a description the model can actually trigger on.
  const touchesContent =
    typeof body.name === "string" ||
    typeof body.description === "string" ||
    typeof body.body === "string" ||
    body.resources !== undefined;

  if (touchesContent) {
    if (typeof body.name !== "string" || typeof body.description !== "string" || typeof body.body !== "string") {
      return Response.json({ error: "incomplete" }, { status: 400 });
    }
    const name = slugifySkillName(body.name);
    const invalid = validateSkill({
      name,
      description: body.description.trim(),
      body: body.body.trim(),
      resources: body.resources,
    });
    if (invalid) return Response.json({ error: "invalid", message: invalid }, { status: 400 });

    patch.name = name;
    patch.description = body.description.trim();
    patch.body = body.body.trim();
    patch.resources = body.resources ?? {};
  }

  const skill = await updateSkill(id, authed.user.id, patch);
  if (!skill) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ skill });
}

export async function DELETE(_req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { id } = await params;
  const ok = await deleteSkill(id, authed.user.id);
  if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
