import { db } from "@/lib/db";
import { chat, memory, memoryPack, project, skill, userSettings } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { getMessages } from "@/lib/db/queries";
import { accountExportFilename, buildAccountExport } from "@/lib/account-export";
import { requireUserApi } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Full account export as one JSON download. */
export async function GET() {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;
  const { user } = authed;

  const chats = await db.select().from(chat).where(eq(chat.userId, user.id));
  const withMessages = await Promise.all(
    chats.map(async (c) => ({ ...c, messages: await getMessages(c.id, user.id) })),
  );

  const payload = buildAccountExport({
    user: { id: user.id, name: user.name, email: user.email },
    settings: await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, user.id))
      .then((rows) => rows[0] ?? null),
    memories: await db.select().from(memory).where(eq(memory.userId, user.id)),
    memoryPacks: await db.select().from(memoryPack).where(eq(memoryPack.ownerId, user.id)),
    // Whole rows rather than `listProjects`/`listSkills`: those shape their
    // results for the sidebar and the picker, and an export that dropped
    // `instructions` or a skill's `body` would not be a backup of anything.
    projects: await db
      .select()
      .from(project)
      .where(eq(project.userId, user.id))
      .orderBy(asc(project.createdAt)),
    skills: await db.select().from(skill).where(eq(skill.userId, user.id)).orderBy(asc(skill.name)),
    chats: withMessages,
  });

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${accountExportFilename()}"`,
    },
  });
}
