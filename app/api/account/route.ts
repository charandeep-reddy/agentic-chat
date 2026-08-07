import { deleteAllChats, deleteUser } from "@/lib/db/queries";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Destructive account operations. `scope` decides how far it goes:
 * "chats" clears the history, "account" deletes everything and the login.
 */
export async function DELETE(req: Request) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const scope = new URL(req.url).searchParams.get("scope");

  if (scope === "chats") {
    const deleted = await deleteAllChats(authed.user.id);
    return Response.json({ deletedChats: deleted });
  }

  if (scope === "account") {
    // Every app table cascades from `user`, including sessions, so this also
    // signs the browser out on its next request.
    await deleteUser(authed.user.id);
    return Response.json({ ok: true });
  }

  return Response.json({ error: "unknown_scope" }, { status: 400 });
}
