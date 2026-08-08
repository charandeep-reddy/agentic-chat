import { getPackBySlug, installPack, uninstallPack } from "@/lib/db/queries";
import { requireUserApi } from "@/lib/session";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

/** Copies a pack's entries into the caller's own memories. */
export async function POST(_req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  // An install copies every entry into the caller's memories, so a loop here
  // writes unbounded rows on their behalf.
  const limit = rateLimit("packInstall", authed.user.id);
  if (!limit.ok) return rateLimitResponse(limit);

  const { slug } = await params;
  const pack = await getPackBySlug(slug);
  if (!pack || (!pack.isPublic && pack.ownerId !== authed.user.id)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const result = await installPack(authed.user.id, pack);
  return Response.json({ pack: { slug: pack.slug, name: pack.name }, ...result });
}

/** Removes every memory that came from this pack. */
export async function DELETE(_req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { slug } = await params;
  const pack = await getPackBySlug(slug);
  if (!pack) return Response.json({ error: "not_found" }, { status: 404 });

  const removed = await uninstallPack(authed.user.id, pack.id);
  return Response.json({ removed });
}
