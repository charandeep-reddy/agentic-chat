import "server-only";

import { and, asc, desc, eq, gt, ilike, or, sql } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db } from "./index";
import {
  chat,
  memory,
  memoryPack,
  memoryPackInstall,
  message,
  skill,
  user,
  userSettings,
} from "./schema";
import type { Chat, Memory, MemoryPack, Skill, UserSettings } from "./schema";
import { newId } from "@/lib/id";

// Re-exported so the call sites that already import it from here keep working,
// while the implementation stays free of this module's database imports — the
// browser mints a new chat's id and must not pull `node-postgres` in with it.
export { newId };

/* ------------------------------------------------------------------ *
 * Chats
 * ------------------------------------------------------------------ */

export interface ChatSummary {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  shareId: string | null;
  updatedAt: Date;
}

export async function listChats(
  userId: string,
  opts: { search?: string; archived?: boolean; limit?: number } = {},
): Promise<ChatSummary[]> {
  const { search, archived = false, limit = 200 } = opts;

  // A search matches the title or any message body, so "that CSV thing" finds
  // the chat even when the title says something else.
  const matchesSearch = search?.trim()
    ? or(
        ilike(chat.title, `%${search.trim()}%`),
        sql`exists (
          select 1 from ${message}
          where ${message.chatId} = ${chat.id}
            and ${message.parts}::text ilike ${`%${search.trim()}%`}
        )`,
      )
    : undefined;

  return db
    .select({
      id: chat.id,
      title: chat.title,
      pinned: chat.pinned,
      archived: chat.archived,
      shareId: chat.shareId,
      updatedAt: chat.updatedAt,
    })
    .from(chat)
    .where(and(eq(chat.userId, userId), eq(chat.archived, archived), matchesSearch))
    .orderBy(desc(chat.pinned), desc(chat.updatedAt))
    .limit(limit);
}

export async function getChat(chatId: string, userId: string): Promise<Chat | null> {
  const [row] = await db
    .select()
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getSharedChat(shareId: string) {
  const [row] = await db
    .select({
      id: chat.id,
      title: chat.title,
      sharedAt: chat.sharedAt,
      ownerName: user.name,
      ownerImage: user.image,
    })
    .from(chat)
    .innerJoin(user, eq(user.id, chat.userId))
    .where(eq(chat.shareId, shareId))
    .limit(1);
  return row ?? null;
}

export async function createChat(
  userId: string,
  opts: { id?: string; title?: string; model?: string } = {},
): Promise<Chat> {
  const [row] = await db
    .insert(chat)
    .values({
      id: opts.id ?? newId("chat"),
      userId,
      title: opts.title ?? "New chat",
      model: opts.model ?? null,
    })
    .returning();
  return row;
}

export async function updateChat(
  chatId: string,
  userId: string,
  patch: Partial<Pick<Chat, "title" | "pinned" | "archived" | "model">>,
): Promise<Chat | null> {
  const [row] = await db
    .update(chat)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .returning();
  return row ?? null;
}

export async function touchChat(chatId: string): Promise<void> {
  await db.update(chat).set({ updatedAt: new Date() }).where(eq(chat.id, chatId));
}

export async function deleteChat(chatId: string, userId: string): Promise<boolean> {
  const rows = await db
    .delete(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .returning({ id: chat.id });
  return rows.length > 0;
}

export async function deleteAllChats(userId: string): Promise<number> {
  const rows = await db.delete(chat).where(eq(chat.userId, userId)).returning({ id: chat.id });
  return rows.length;
}

/** Toggles sharing. Returns the share id, or null once sharing is revoked. */
export async function setChatShared(
  chatId: string,
  userId: string,
  shared: boolean,
): Promise<string | null> {
  const shareId = shared ? newId("share") : null;
  const [row] = await db
    .update(chat)
    .set({ shareId, sharedAt: shared ? new Date() : null })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .returning({ shareId: chat.shareId });
  return row?.shareId ?? null;
}

/* ------------------------------------------------------------------ *
 * Messages
 * ------------------------------------------------------------------ */

export interface StoredMessage {
  id: string;
  role: string;
  parts: UIMessage["parts"];
  metadata: unknown;
  createdAt: Date;
}

export async function getMessages(chatId: string): Promise<StoredMessage[]> {
  const rows = await db
    .select({
      id: message.id,
      role: message.role,
      parts: message.parts,
      metadata: message.metadata,
      createdAt: message.createdAt,
    })
    .from(message)
    .where(eq(message.chatId, chatId))
    .orderBy(asc(message.ordinal), asc(message.createdAt));

  return rows.map((r) => ({ ...r, parts: r.parts as UIMessage["parts"] }));
}

/**
 * The next free ordinal, as a subquery rather than a value, so the insert
 * doesn't need a round trip to find out where it lands. Postgres evaluates it
 * against the snapshot taken when the statement starts, so every row in one
 * insert sees the same maximum — hence the caller's `+ offset`.
 */
function nextOrdinal(chatId: string) {
  return sql<number>`(select coalesce(max(${message.ordinal}), -1) from ${message} where ${message.chatId} = ${chatId})`;
}

/**
 * Upserts messages in order. Re-running with the same ids (which happens when
 * a stream is resumed) overwrites rather than duplicating.
 */
export async function saveMessages(
  chatId: string,
  messages: Array<{
    id: string;
    role: string;
    parts: unknown;
    metadata?: unknown;
    model?: string;
  }>,
): Promise<void> {
  if (messages.length === 0) return;

  // An empty id silently upserts every message onto one row, because the
  // conflict target is the primary key. Losing the transcript is far worse
  // than failing the write, so refuse it loudly.
  const blank = messages.find((m) => !m.id);
  if (blank) {
    throw new Error(`Refusing to save a ${blank.role} message with an empty id to chat ${chatId}.`);
  }

  const base = nextOrdinal(chatId);

  // The insert and the touch are independent, so they go out together rather
  // than one after the other — over a remote database that halves the wait.
  await Promise.all([
    db
      .insert(message)
      .values(
        messages.map((m, i) => ({
          id: m.id,
          chatId,
          role: m.role,
          parts: m.parts,
          metadata: m.metadata ?? null,
          model: m.model ?? null,
          // Re-saving an existing id keeps its original ordinal, because
          // `ordinal` is deliberately absent from the conflict update below.
          ordinal: sql<number>`${base} + ${i + 1}`,
        })),
      )
      .onConflictDoUpdate({
        target: message.id,
        set: {
          parts: sql`excluded.parts`,
          metadata: sql`excluded.metadata`,
        },
      }),
    touchChat(chatId),
  ]);
}

/**
 * Removes the given message and everything after it. Used by edit-and-resend
 * and regenerate, which both rewrite the tail of the conversation.
 */
export async function truncateFrom(chatId: string, messageId: string): Promise<void> {
  const [target] = await db
    .select({ ordinal: message.ordinal })
    .from(message)
    .where(and(eq(message.chatId, chatId), eq(message.id, messageId)))
    .limit(1);
  if (!target) return;

  await db
    .delete(message)
    .where(
      and(
        eq(message.chatId, chatId),
        or(eq(message.id, messageId), gt(message.ordinal, target.ordinal)),
      ),
    );
}

export async function countMessages(chatId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(message)
    .where(eq(message.chatId, chatId));
  return row?.count ?? 0;
}

export interface UserStats {
  chats: number;
  messages: number;
  memories: number;
}

/**
 * Totals for the profile page. Counting in the database rather than fetching
 * every row keeps this to one round trip: the previous version pulled a
 * thousand chats back and then issued a `count(*)` per chat.
 *
 * The message count joins through `chat` so it stays scoped to this user —
 * `message` has no `userId` of its own. A left join keeps chats with no
 * messages in the chat count.
 */
export async function countUserStats(userId: string): Promise<UserStats> {
  const [conversations, memories] = await Promise.all([
    db
      .select({
        chats: sql<number>`count(distinct ${chat.id})::int`,
        messages: sql<number>`count(${message.id})::int`,
      })
      .from(chat)
      .leftJoin(message, eq(message.chatId, chat.id))
      .where(eq(chat.userId, userId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(memory)
      .where(eq(memory.userId, userId)),
  ]);

  return {
    chats: conversations[0]?.chats ?? 0,
    messages: conversations[0]?.messages ?? 0,
    memories: memories[0]?.count ?? 0,
  };
}

/* ------------------------------------------------------------------ *
 * Memories
 * ------------------------------------------------------------------ */

export async function listMemories(
  userId: string,
  opts: { enabledOnly?: boolean } = {},
): Promise<Memory[]> {
  return db
    .select()
    .from(memory)
    .where(
      opts.enabledOnly
        ? and(eq(memory.userId, userId), eq(memory.enabled, true))
        : eq(memory.userId, userId),
    )
    .orderBy(desc(memory.createdAt));
}

export async function createMemory(
  userId: string,
  input: {
    content: string;
    category?: string;
    source?: string;
    importedFromPackId?: string;
  },
): Promise<Memory | null> {
  const content = input.content.trim();
  if (!content) return null;

  // Exact-duplicate guard: the agent tends to re-save the same fact whenever
  // the user restates it, which would otherwise bloat every prompt.
  const [existing] = await db
    .select()
    .from(memory)
    .where(and(eq(memory.userId, userId), eq(memory.content, content)))
    .limit(1);
  if (existing) return existing;

  const [row] = await db
    .insert(memory)
    .values({
      id: newId("mem"),
      userId,
      content,
      category: input.category ?? "fact",
      source: input.source ?? "agent",
      importedFromPackId: input.importedFromPackId ?? null,
    })
    .returning();
  return row;
}

export async function updateMemory(
  id: string,
  userId: string,
  patch: Partial<Pick<Memory, "content" | "category" | "enabled">>,
): Promise<Memory | null> {
  const [row] = await db
    .update(memory)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(memory.id, id), eq(memory.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteMemory(id: string, userId: string): Promise<boolean> {
  const rows = await db
    .delete(memory)
    .where(and(eq(memory.id, id), eq(memory.userId, userId)))
    .returning({ id: memory.id });
  return rows.length > 0;
}

export async function deleteAllMemories(userId: string): Promise<number> {
  const rows = await db.delete(memory).where(eq(memory.userId, userId)).returning({
    id: memory.id,
  });
  return rows.length;
}

export async function markMemoriesUsed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(memory)
    .set({ useCount: sql`${memory.useCount} + 1`, lastUsedAt: new Date() })
    .where(sql`${memory.id} = any(${ids})`);
}

/* ------------------------------------------------------------------ *
 * Skills
 * ------------------------------------------------------------------ */

export async function listSkills(
  userId: string,
  opts: { enabledOnly?: boolean } = {},
): Promise<Skill[]> {
  return db
    .select()
    .from(skill)
    .where(
      opts.enabledOnly
        ? and(eq(skill.userId, userId), eq(skill.enabled, true))
        : eq(skill.userId, userId),
    )
    .orderBy(asc(skill.name));
}

export async function getSkillByName(userId: string, name: string): Promise<Skill | null> {
  const [row] = await db
    .select()
    .from(skill)
    .where(and(eq(skill.userId, userId), eq(skill.name, name)))
    .limit(1);
  return row ?? null;
}

export async function createSkill(
  userId: string,
  input: {
    name: string;
    description: string;
    body: string;
    resources?: Record<string, string>;
  },
): Promise<Skill | null> {
  const [row] = await db
    .insert(skill)
    .values({
      id: newId("skl"),
      userId,
      name: input.name,
      description: input.description,
      body: input.body,
      resources: input.resources ?? {},
    })
    // The (user, name) unique index is the real guard against duplicates; a
    // second save of the same skill updates it rather than erroring, which is
    // what "paste the SKILL.md again" should do.
    .onConflictDoUpdate({
      target: [skill.userId, skill.name],
      set: {
        description: input.description,
        body: input.body,
        resources: input.resources ?? {},
        updatedAt: new Date(),
      },
    })
    .returning();
  return row ?? null;
}

export async function updateSkill(
  id: string,
  userId: string,
  patch: Partial<Pick<Skill, "name" | "description" | "body" | "resources" | "enabled">>,
): Promise<Skill | null> {
  const [row] = await db
    .update(skill)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(skill.id, id), eq(skill.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteSkill(id: string, userId: string): Promise<boolean> {
  const rows = await db
    .delete(skill)
    .where(and(eq(skill.id, id), eq(skill.userId, userId)))
    .returning({ id: skill.id });
  return rows.length > 0;
}

export async function markSkillUsed(id: string): Promise<void> {
  await db
    .update(skill)
    .set({ useCount: sql`${skill.useCount} + 1`, lastUsedAt: new Date() })
    .where(eq(skill.id, id));
}

/* ------------------------------------------------------------------ *
 * Memory packs — "add memory from others"
 * ------------------------------------------------------------------ */

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
  let added = 0;
  let skipped = 0;

  for (const entry of entries) {
    const before = await db
      .select({ id: memory.id })
      .from(memory)
      .where(and(eq(memory.userId, userId), eq(memory.content, entry.content.trim())))
      .limit(1);
    if (before.length > 0) {
      skipped++;
      continue;
    }
    await createMemory(userId, {
      content: entry.content,
      category: entry.category,
      source: "imported",
      importedFromPackId: pack.id,
    });
    added++;
  }

  await db
    .insert(memoryPackInstall)
    .values({ userId, packId: pack.id })
    .onConflictDoNothing();

  if (added > 0) {
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
  await db
    .delete(memoryPackInstall)
    .where(and(eq(memoryPackInstall.userId, userId), eq(memoryPackInstall.packId, packId)));
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

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

export async function getSettings(userId: string): Promise<UserSettings | null> {
  const [row] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function saveSettings(
  userId: string,
  patch: Partial<Omit<UserSettings, "userId" | "updatedAt">>,
): Promise<UserSettings> {
  const [row] = await db
    .insert(userSettings)
    .values({ userId, ...patch })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { ...patch, updatedAt: new Date() },
    })
    .returning();
  return row;
}

/* ------------------------------------------------------------------ *
 * Account
 * ------------------------------------------------------------------ */

export async function deleteUser(userId: string): Promise<void> {
  // Every app table cascades from `user`, so one delete clears the account.
  await db.delete(user).where(eq(user.id, userId));
}
