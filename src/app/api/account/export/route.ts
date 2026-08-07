import { db } from "@/lib/db";
import { chat, memory, memoryPack, userSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getMessages } from "@/lib/db/queries";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Full account export as one JSON download. */
export async function GET() {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;
  const { user } = authed;

  const chats = await db.select().from(chat).where(eq(chat.userId, user.id));
  const withMessages = await Promise.all(
    chats.map(async (c) => ({ ...c, messages: await getMessages(c.id) })),
  );

  const payload = {
    exportedAt: new Date().toISOString(),
    user: { id: user.id, name: user.name, email: user.email },
    settings: await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, user.id))
      .then((rows) => rows[0] ?? null),
    memories: await db.select().from(memory).where(eq(memory.userId, user.id)),
    memoryPacks: await db.select().from(memoryPack).where(eq(memoryPack.ownerId, user.id)),
    chats: withMessages,
  };

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="agentic-chat-export-${date}.json"`,
    },
  });
}
