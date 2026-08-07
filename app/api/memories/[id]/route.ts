import { deleteMemory, updateMemory } from "@/lib/db/queries";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { id } = await params;
  let body: { content?: string; category?: string; enabled?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const patch: { content?: string; category?: string; enabled?: boolean } = {};
  if (typeof body.content === "string") {
    const content = body.content.trim();
    if (!content || content.length > 500) {
      return Response.json({ error: "invalid_content" }, { status: 400 });
    }
    patch.content = content;
  }
  if (typeof body.category === "string") patch.category = body.category;
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

  const memory = await updateMemory(id, authed.user.id, patch);
  if (!memory) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ memory });
}

export async function DELETE(_req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { id } = await params;
  const ok = await deleteMemory(id, authed.user.id);
  if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
