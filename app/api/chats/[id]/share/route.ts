import { getChat, setChatShared } from "@/lib/db/queries";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Turns on sharing and returns the public link. */
export async function POST(_req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { id } = await params;
  const chat = await getChat(id, authed.user.id);
  if (!chat) return Response.json({ error: "not_found" }, { status: 404 });

  // Re-sharing an already-shared chat keeps the existing link, so a URL the
  // user has already sent to someone does not silently rotate.
  const shareId = chat.shareId ?? (await setChatShared(id, authed.user.id, true));
  return Response.json({ shareId });
}

/** Revokes the public link. */
export async function DELETE(_req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { id } = await params;
  await setChatShared(id, authed.user.id, false);
  return Response.json({ shareId: null });
}
