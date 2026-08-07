import { deletePack, getPackBySlug, updatePack } from "@/lib/db/queries";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { slug } = await params;
  const pack = await getPackBySlug(slug);
  // A private pack is visible only to its owner; anyone with the slug of a
  // public pack can read it, which is the point of the share link.
  if (!pack || (!pack.isPublic && pack.ownerId !== authed.user.id)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ pack });
}

export async function PATCH(req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { slug } = await params;
  const existing = await getPackBySlug(slug);
  if (!existing || existing.ownerId !== authed.user.id) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  let body: { name?: string; description?: string; isPublic?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const patch: { name?: string; description?: string | null; isPublic?: boolean } = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 80);
  if (typeof body.description === "string") patch.description = body.description.slice(0, 400) || null;
  if (typeof body.isPublic === "boolean") patch.isPublic = body.isPublic;

  const pack = await updatePack(existing.id, authed.user.id, patch);
  return Response.json({ pack });
}

export async function DELETE(_req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { slug } = await params;
  const existing = await getPackBySlug(slug);
  if (!existing || existing.ownerId !== authed.user.id) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  await deletePack(existing.id, authed.user.id);
  return Response.json({ ok: true });
}
