import { deleteProject, getProject, updateProject } from "@/lib/db/queries";
import {
  MAX_PROJECT_DESCRIPTION,
  MAX_PROJECT_INSTRUCTIONS,
  MAX_PROJECT_NAME,
  normalizeField,
} from "@/lib/projects";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { id } = await params;
  const project = await getProject(id, authed.user.id);
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ project });
}

export async function PATCH(req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { id } = await params;
  let body: { name?: unknown; description?: unknown; instructions?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const patch: { name?: string; description?: string | null; instructions?: string | null } = {};

  if ("name" in body) {
    const name = normalizeField(body.name, MAX_PROJECT_NAME);
    // A rename to nothing is rejected rather than ignored: silently keeping the
    // old name looks to the user like the save failed for no reason.
    if (!name) return Response.json({ error: "empty_name" }, { status: 400 });
    patch.name = name;
  }
  // Cleared by sending an empty string — `normalizeField` returns null for one,
  // which is what unsets the column.
  if ("description" in body) {
    patch.description = normalizeField(body.description, MAX_PROJECT_DESCRIPTION);
  }
  if ("instructions" in body) {
    patch.instructions = normalizeField(body.instructions, MAX_PROJECT_INSTRUCTIONS);
  }
  const project = await updateProject(id, authed.user.id, patch);
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ project });
}

/**
 * Deletes the project. Its chats survive, unfiled; its memories go with it.
 * The two directions are enforced by the foreign keys — see the column comments
 * in `db/schema` for why they differ.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { id } = await params;
  const ok = await deleteProject(id, authed.user.id);
  if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
