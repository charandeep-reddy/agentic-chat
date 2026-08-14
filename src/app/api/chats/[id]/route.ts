import { deleteChat, getChat, getMessages, updateChat } from "@/lib/db/queries";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { id } = await params;
  const chat = await getChat(id, authed.user.id);
  if (!chat) return Response.json({ error: "not_found" }, { status: 404 });

  const messages = await getMessages(id);
  return Response.json({ chat, messages });
}

export async function PATCH(req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { id } = await params;
  interface Body {
    title?: string;
    pinned?: boolean;
    model?: string;
    /** A project id to file this chat under, or null to unfile it. */
    projectId?: string | null;
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const patch: Partial<Body> = {};
  if (typeof body.title === "string") {
    const title = body.title.trim().slice(0, 200);
    if (!title) return Response.json({ error: "empty_title" }, { status: 400 });
    patch.title = title;
  }
  if (typeof body.pinned === "boolean") patch.pinned = body.pinned;
  if (typeof body.model === "string") patch.model = body.model;
  // Only when the key is present: `updateChat` treats its absence as "leave the
  // project alone", and sending null unconditionally would unfile every chat
  // whose title was edited. Ownership of the id is checked there.
  if ("projectId" in body) {
    patch.projectId = typeof body.projectId === "string" && body.projectId ? body.projectId : null;
  }

  const chat = await updateChat(id, authed.user.id, patch);
  if (!chat) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ chat });
}

export async function DELETE(_req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { id } = await params;
  const ok = await deleteChat(id, authed.user.id);
  if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
