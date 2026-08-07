import { createChat, listChats } from "@/lib/db/queries";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const url = new URL(req.url);
  const chats = await listChats(authed.user.id, {
    search: url.searchParams.get("q") ?? undefined,
    archived: url.searchParams.get("archived") === "1",
  });
  return Response.json({ chats });
}

export async function POST(req: Request) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  let body: { id?: string; title?: string; model?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // An empty body is fine — it means "make me a blank chat".
  }

  const chat = await createChat(authed.user.id, body);
  return Response.json({ chat }, { status: 201 });
}
