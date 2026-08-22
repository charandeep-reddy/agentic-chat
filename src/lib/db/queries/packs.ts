import "server-only";

import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../index";
import { memory, memoryPack, memoryPackInstall } from "../schema";
import type { MemoryPack } from "../schema";
import { newId } from "@/lib/id";
import { createMemory } from "./memories";

export interface PackEntry {
  content: string;
  category: string;
}

export async function listPublicPacks(search?: string): Promise<MemoryPack[]> {
  const matches = search?.trim()
    ? or(ilike(memoryPack.name, `%${search.trim()}%`), ilike(memoryPack.description, `%${search.trim()}%`))
    : undefined;
  return db
    .select()
    .from(memoryPack)
    .where(and(eq(memoryPack.isPublic, true), matches))
    .orderBy(desc(memoryPack.installCount), desc(memoryPack.createdAt))
    .limit(100);
}

export async function listOwnedPacks(ownerId: string): Promise<MemoryPack[]> {
  return db
    .select()
    .from(memoryPack)
    .where(eq(memoryPack.ownerId, ownerId))
    .orderBy(desc(memoryPack.createdAt));
}

export async function getPackBySlug(slug: string): Promise<MemoryPack | null> {
  const [row] = await db.select().from(memoryPack).where(eq(memoryPack.slug, slug)).limit(1);
  return row ?? null;
}

export async function createPack(
  ownerId: string,
  input: { name: string; description?: string; entries: PackEntry[]; isPublic: boolean },
): Promise<MemoryPack> {
  const base = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "pack";

  // Slugs are globally unique because they are the share URL; collide-and-retry
  // with a short suffix rather than serialising pack creation.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${crypto.randomUUID().slice(0, 5)}`;
    try {
      const [row] = await db
        .insert(memoryPack)
        .values({
          id: newId("pack"),
          ownerId,
          slug,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          entries: input.entries,
          isPublic: input.isPublic,
        })
        .returning();
      return row;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "23505") throw error;
    }
  }
  throw new Error("Could not allocate a unique pack slug.");
}

export async function updatePack(
  id: string,
  ownerId: string,
  patch: Partial<Pick<MemoryPack, "name" | "description" | "entries" | "isPublic">>,
): Promise<MemoryPack | null> {
  const [row] = await db
    .update(memoryPack)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(memoryPack.id, id), eq(memoryPack.ownerId, ownerId)))
    .returning();
  return row ?? null;
}

export async function deletePack(id: string, ownerId: string): Promise<boolean> {
  const rows = await db
    .delete(memoryPack)
    .where(and(eq(memoryPack.id, id), eq(memoryPack.ownerId, ownerId)))
    .returning({ id: memoryPack.id });
  return rows.length > 0;
}

/** Copies a pack's entries into the user's own memories. Idempotent. */
export async function installPack(
  userId: string,
  pack: MemoryPack,
): Promise<{ added: number; skipped: number }> {
  const entries = pack.entries as PackEntry[];
  const wanted = entries.map((e) => e.content.trim()).filter(Boolean);

  // One query rather than one per entry. It also has to match `createMemory`'s
  // own dedup rule exactly — account-wide rows only — or the two disagree: a
  // same-worded memory saved inside some unrelated project would be counted as
  // "already had" here while `createMemory` went on to insert it anyway, so the
  // user was told an entry was skipped that they in fact received.
  const existing =
    wanted.length === 0
      ? []
      : await db
          .select({ content: memory.content })
          .from(memory)
          .where(
            and(
              eq(memory.userId, userId),
              isNull(memory.projectId),
              inArray(memory.content, wanted),
            ),
          );
  const have = new Set(existing.map((r) => r.content));

  let added = 0;
  let skipped = 0;
  for (const entry of entries) {
    const content = entry.content.trim();
    // A blank entry is neither added nor "already had" — `createMemory` drops
    // it and returns null, so counting it as added overstated the result.
    if (!content) continue;
    if (have.has(content)) {
      skipped++;
      continue;
    }
    await createMemory(userId, {
      content,
      category: entry.category,
      source: "imported",
      importedFromPackId: pack.id,
    });
    // Two identical entries inside one pack: the second is a duplicate of the
    // row the first just created, not a second addition.
    have.add(content);
    added++;
  }

  // `installCount` counts installs, so it may only move when this insert
  // actually creates the install row. Incrementing on `added > 0` instead let
  // one user run the total up by deleting a memory and re-installing.
  const [installed] = await db
    .insert(memoryPackInstall)
    .values({ userId, packId: pack.id })
    .onConflictDoNothing()
    .returning({ packId: memoryPackInstall.packId });

  if (installed) {
    await db
      .update(memoryPack)
      .set({ installCount: sql`${memoryPack.installCount} + 1` })
      .where(eq(memoryPack.id, pack.id));
  }

  return { added, skipped };
}

export async function uninstallPack(userId: string, packId: string): Promise<number> {
  const rows = await db
    .delete(memory)
    .where(and(eq(memory.userId, userId), eq(memory.importedFromPackId, packId)))
    .returning({ id: memory.id });

  const removed = await db
    .delete(memoryPackInstall)
    .where(and(eq(memoryPackInstall.userId, userId), eq(memoryPackInstall.packId, packId)))
    .returning({ packId: memoryPackInstall.packId });

  // Paired with the increment in `installPack` so the counter tracks who
  // currently has the pack. Without this half, install → uninstall → install
  // adds one every cycle. `greatest` keeps a double-uninstall from going
  // negative rather than trusting the counter and the rows to never drift.
  if (removed.length > 0) {
    await db
      .update(memoryPack)
      .set({ installCount: sql`greatest(${memoryPack.installCount} - 1, 0)` })
      .where(eq(memoryPack.id, packId));
  }

  return rows.length;
}

export async function listInstalledPacks(userId: string): Promise<MemoryPack[]> {
  return db
    .select({
      id: memoryPack.id,
      ownerId: memoryPack.ownerId,
      slug: memoryPack.slug,
      name: memoryPack.name,
      description: memoryPack.description,
      entries: memoryPack.entries,
      isPublic: memoryPack.isPublic,
      installCount: memoryPack.installCount,
      createdAt: memoryPack.createdAt,
      updatedAt: memoryPack.updatedAt,
    })
    .from(memoryPackInstall)
    .innerJoin(memoryPack, eq(memoryPack.id, memoryPackInstall.packId))
    .where(eq(memoryPackInstall.userId, userId));
}
