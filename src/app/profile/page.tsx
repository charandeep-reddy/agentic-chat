import { db } from "@/lib/db";
import { account } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { countMessages, getSettings, listChats, listMemories } from "@/lib/db/queries";
import { requireUser } from "@/lib/session";
import { ProfilePage } from "@/components/profile-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile & settings · Agentic Chat" };

export default async function Profile() {
  const user = await requireUser();

  const [settings, chats, memories, providers] = await Promise.all([
    getSettings(user.id),
    listChats(user.id, { limit: 1000 }),
    listMemories(user.id),
    db
      .select({ providerId: account.providerId, createdAt: account.createdAt })
      .from(account)
      .where(eq(account.userId, user.id)),
  ]);

  const messageCounts = await Promise.all(chats.map((c) => countMessages(c.id)));

  return (
    <ProfilePage
      user={{
        name: user.name,
        email: user.email,
        image: user.image ?? null,
        createdAt: user.createdAt.toISOString(),
      }}
      providers={providers.map((p) => ({
        id: p.providerId,
        connectedAt: p.createdAt.toISOString(),
      }))}
      stats={{
        chats: chats.length,
        messages: messageCounts.reduce((sum, n) => sum + n, 0),
        memories: memories.length,
      }}
      settings={{
        aboutUser: settings?.aboutUser ?? "",
        responseStyle: settings?.responseStyle ?? "",
        memoryEnabled: settings?.memoryEnabled ?? true,
      }}
    />
  );
}
