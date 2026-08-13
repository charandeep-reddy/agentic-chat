import { CHATS_PAGE_SIZE, createChat, listChats } from "@/lib/db/queries";
import { decodeChatCursor, encodeChatCursor } from "@/lib/chat-cursor";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit")) || CHATS_PAGE_SIZE;
  const chats = await listChats(authed.user.id, {
    search: url.searchParams.get("q") ?? undefined,
    archived: url.searchParams.get("archived") === "1",
    limit,
    // A malformed cursor reads as "first page" rather than an error: it is a
    // scroll position, and failing the whole request over one is a worse
    // outcome than starting again from the top.
    cursor: decodeChatCursor(url.searchParams.get("cursor")),
  });

  // A short page means the end. Handing back a cursor here anyway would cost
  // the client one more round trip to discover the same thing.
  const last = chats.length === limit ? chats[chats.length - 1] : null;
  const nextCursor = last
    ? encodeChatCursor({
        pinned: last.pinned,
        updatedAt: last.updatedAt.toISOString(),
        id: last.id,
      })
    : null;

  return Response.json({ chats, nextCursor });
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
