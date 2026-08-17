import { db } from "@/lib/db";
import { account } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { countUserStats, getSettings } from "@/lib/db/queries";
import { requireUser } from "@/lib/session";
import { ProfilePage } from "@/components/settings/profile-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile & settings · Agentic Chat" };

export default async function Profile() {
  const user = await requireUser();

  const [settings, stats, providers] = await Promise.all([
    getSettings(user.id),
    countUserStats(user.id),
    db
      .select({ providerId: account.providerId, createdAt: account.createdAt })
      .from(account)
      .where(eq(account.userId, user.id)),
  ]);

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
      stats={stats}
      settings={{
        aboutUser: settings?.aboutUser ?? "",
        responseStyle: settings?.responseStyle ?? "",
        memoryEnabled: settings?.memoryEnabled ?? true,
      }}
    />
  );
}
