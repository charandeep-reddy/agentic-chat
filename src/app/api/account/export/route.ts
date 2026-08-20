import { db } from "@/lib/db";
import { chat, memory, memoryPack, project, userSettings } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { getMessages, listSkills } from "@/lib/db/queries";
import { accountExportFilename, buildAccountExport } from "@/lib/account-export";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Full account export as one JSON download. */
export async function GET() {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;
  const { user } = authed;

  const chats = await db.select().from(chat).where(eq(chat.userId, user.id));

  const [withMessages, settingsRows, memories, memoryPacks, projects, skills] = await Promise.all([
    Promise.all(chats.map(async (c) => ({ ...c, messages: await getMessages(c.id, user.id) }))),
    db.select().from(userSettings).where(eq(userSettings.userId, user.id)),
    db.select().from(memory).where(eq(memory.userId, user.id)),
    db.select().from(memoryPack).where(eq(memoryPack.ownerId, user.id)),
    // Whole rows rather than `listProjects`: it shapes results for the
    // sidebar and drops `instructions` — an export without it would not be a
    // backup of anything.
    db.select().from(project).where(eq(project.userId, user.id)).orderBy(asc(project.createdAt)),
    // `listSkills(userId)` with no options already returns every column,
    // `body` included — same query the hand-rolled version above duplicated.
    listSkills(user.id),
  ]);

  const payload = buildAccountExport({
    user: { id: user.id, name: user.name, email: user.email },
    settings: settingsRows[0] ?? null,
    memories,
    memoryPacks,
    projects,
    skills,
    chats: withMessages,
  });

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${accountExportFilename()}"`,
    },
  });
}
