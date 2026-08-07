import { listInstalledPacks, listMemories, listOwnedPacks, listPublicPacks } from "@/lib/db/queries";
import { requireUser } from "@/lib/session";
import { MemoryPage } from "@/components/memory-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Memory · Agentic Chat" };

export default async function Memory() {
  const user = await requireUser();

  const [memories, ownedPacks, installedPacks, publicPacks] = await Promise.all([
    listMemories(user.id),
    listOwnedPacks(user.id),
    listInstalledPacks(user.id),
    listPublicPacks(),
  ]);

  const installedIds = new Set(installedPacks.map((p) => p.id));

  return (
    <MemoryPage
      user={{ name: user.name, email: user.email, image: user.image ?? null }}
      memories={memories.map((m) => ({
        id: m.id,
        content: m.content,
        category: m.category,
        source: m.source,
        enabled: m.enabled,
        createdAt: m.createdAt.toISOString(),
      }))}
      ownedPacks={ownedPacks.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        description: p.description,
        entryCount: (p.entries as unknown[]).length,
        isPublic: p.isPublic,
        installCount: p.installCount,
        installed: installedIds.has(p.id),
        mine: true,
      }))}
      discoverPacks={publicPacks
        .filter((p) => p.ownerId !== user.id)
        .map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          description: p.description,
          entryCount: (p.entries as unknown[]).length,
          isPublic: p.isPublic,
          installCount: p.installCount,
          installed: installedIds.has(p.id),
          mine: false,
        }))}
    />
  );
}
