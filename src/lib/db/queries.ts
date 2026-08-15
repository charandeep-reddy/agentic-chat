import "server-only";

import { and, asc, desc, eq, gt, ilike, isNull, or, sql } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db } from "./index";
import {
  chat,
  managedProviderKey,
  memory,
  memoryPack,
  memoryPackInstall,
  message,
  project,
  skill,
  spendLimit,
  user,
  userSettings,
} from "./schema";
import type { Chat, Memory, MemoryPack, Project, Skill, UserSettings } from "./schema";
import { newId } from "@/lib/id";
import type { ChatCursor } from "@/lib/chat-cursor";
import { decryptProviderKey, encryptProviderKey } from "@/lib/managed-keys";
import { periodHasElapsed, resetPeriod } from "@/lib/spend-period";

// Re-exported so the call sites that already import it from here keep working,
// while the implementation stays free of this module's database imports — the
// browser mints a new chat's id and must not pull `node-postgres` in with it.
export { newId };

/* ------------------------------------------------------------------ *
 * Projects
 * ------------------------------------------------------------------ */

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  updatedAt: Date;
  /** Chats currently in the project. */
  chatCount: number;
}

export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  return db
    .select({
      id: project.id,
      name: project.name,
      description: project.description,
      updatedAt: project.updatedAt,
      // A correlated count rather than a join with a group by: the sidebar
      // needs one number per project, and grouping would have to carry every
      // project column through the aggregate to get it back.
      chatCount: sql<number>`(
        select count(*)::int from ${chat} where ${chat.projectId} = ${project.id}
      )`,
    })
    .from(project)
    .where(eq(project.userId, userId))
    .orderBy(desc(project.updatedAt), desc(project.id));
}

export async function getProject(projectId: string, userId: string): Promise<Project | null> {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createProject(
  userId: string,
  opts: { id?: string; name: string; description?: string | null; instructions?: string | null },
): Promise<Project> {
  const [row] = await db
    .insert(project)
    .values({
      id: opts.id ?? newId("proj"),
      userId,
      name: opts.name,
      description: opts.description ?? null,
      instructions: opts.instructions ?? null,
    })
    .returning();
  return row;
}

export async function updateProject(
  projectId: string,
  userId: string,
  patch: Partial<Pick<Project, "name" | "description" | "instructions">>,
): Promise<Project | null> {
  const [row] = await db
    .update(project)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .returning();
  return row ?? null;
}

/**
 * Deletes the project. Its chats survive with `projectId` set to null; its
 * memories go with it. Both are enforced by the foreign keys — see the comments
 * on those columns for why the two directions differ.
 */
export async function deleteProject(projectId: string, userId: string): Promise<boolean> {
  const rows = await db
    .delete(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .returning({ id: project.id });
  return rows.length > 0;
}

/* ------------------------------------------------------------------ *
 * Chats
 * ------------------------------------------------------------------ */

export interface ChatSummary {
  id: string;
  title: string;
  pinned: boolean;
  shareId: string | null;
  projectId: string | null;
  updatedAt: Date;
}

/** Rows per page. The sidebar asks for the next one as you scroll. */
export const CHATS_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

export async function listChats(
  userId: string,
  opts: {
    search?: string;
    limit?: number;
    /**
     * Which project's chats to return. Three states, and the difference between
     * the last two matters:
     *
     * - omitted — every chat, whatever its project. The sidebar's default.
     * - a project id — only that project's chats.
     * - `null` — only ungrouped chats.
     */
    projectId?: string | null;
    /** Continue after this row. Omit for the first page. */
    cursor?: ChatCursor | null;
  } = {},
): Promise<ChatSummary[]> {
  const { search, cursor } = opts;
  const inProject =
    opts.projectId === undefined
      ? undefined
      : opts.projectId === null
        ? isNull(chat.projectId)
        : eq(chat.projectId, opts.projectId);
  // Clamped rather than trusted: `limit` reaches here from a query string, and
  // an unbounded one would undo the point of paging.
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, opts.limit ?? CHATS_PAGE_SIZE));

  /**
   * Everything strictly after the cursor row, in this exact ordering.
   *
   * One tuple comparison, not a chain of ORs. Postgres compares row
   * constructors lexicographically, which is precisely "later in the sort
   * order" when every key is DESC — and it is a form the planner can satisfy
   * by seeking straight into the composite index rather than filtering.
   */
  const afterCursor = cursor
    ? sql`(${chat.pinned}, ${chat.updatedAt}, ${chat.id}) < (${cursor.pinned}, ${new Date(cursor.updatedAt)}, ${cursor.id})`
    : undefined;

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
      shareId: chat.shareId,
      projectId: chat.projectId,
      updatedAt: chat.updatedAt,
    })
    .from(chat)
    .where(and(eq(chat.userId, userId), inProject, matchesSearch, afterCursor))
    // `id` last so the order is total. Two chats can share a millisecond, and
    // a non-deterministic tie is what makes a row skip a page boundary.
    .orderBy(desc(chat.pinned), desc(chat.updatedAt), desc(chat.id))
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

/**
 * Narrows a project id to one this user actually owns.
 *
 * The foreign key only proves the project exists — it says nothing about whose
 * it is. Without this, a client could file its own chat under a stranger's
 * project id and pull that project's instructions and memories into its prompt.
 * Returns null for an id that does not resolve, which files the chat as
 * ungrouped rather than failing the whole request.
 */
async function ownedProjectId(projectId: string | null, userId: string): Promise<string | null> {
  if (!projectId) return null;
  const [row] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .limit(1);
  return row?.id ?? null;
}

export async function createChat(
  userId: string,
  opts: { id?: string; title?: string; model?: string; projectId?: string | null } = {},
): Promise<Chat> {
  const [row] = await db
    .insert(chat)
    .values({
      id: opts.id ?? newId("chat"),
      userId,
      title: opts.title ?? "New chat",
      model: opts.model ?? null,
      projectId: await ownedProjectId(opts.projectId ?? null, userId),
    })
    .returning();
  return row;
}

export async function updateChat(
  chatId: string,
  userId: string,
  patch: Partial<Pick<Chat, "title" | "pinned" | "model" | "projectId">>,
): Promise<Chat | null> {
  // Same reasoning as `createChat`: a move has to be verified, not trusted.
  // Checked only when the key is present, so an unrelated patch — a rename, a
  // pin — cannot accidentally unfile the chat.
  const next =
    "projectId" in patch
      ? { ...patch, projectId: await ownedProjectId(patch.projectId ?? null, userId) }
      : patch;

  const [row] = await db
    .update(chat)
    .set({ ...next, updatedAt: new Date() })
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

/**
 * Which memories are in view.
 *
 * `visibleIn` is the prompt's question — *what may a chat in this context
 * read?* — and it is asymmetric on purpose: a chat inside a project sees that
 * project's memories and the account-wide ones, while a chat outside every
 * project sees only the account-wide ones. `belongingTo` is the management
 * question, for a screen that lists one project's memories and nothing else.
 */
export type MemoryScope = { visibleIn: string | null } | { belongingTo: string };

function memoryScopeFilter(scope: MemoryScope | undefined) {
  if (!scope) return undefined;
  if ("belongingTo" in scope) return eq(memory.projectId, scope.belongingTo);
  if (scope.visibleIn === null) return isNull(memory.projectId);
  return or(isNull(memory.projectId), eq(memory.projectId, scope.visibleIn));
}

export async function listMemories(
  userId: string,
  opts: { enabledOnly?: boolean; scope?: MemoryScope } = {},
): Promise<Memory[]> {
  return db
    .select()
    .from(memory)
    .where(
      and(
        eq(memory.userId, userId),
        opts.enabledOnly ? eq(memory.enabled, true) : undefined,
        memoryScopeFilter(opts.scope),
      ),
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
    /** Null for an account-wide memory. Set when saved inside a project chat. */
    projectId?: string | null;
  },
): Promise<Memory | null> {
  const content = input.content.trim();
  if (!content) return null;

  const projectId = await ownedProjectId(input.projectId ?? null, userId);

  // Exact-duplicate guard: the agent tends to re-save the same fact whenever
  // the user restates it, which would otherwise bloat every prompt.
  //
  // Scoped to the project, so the same sentence can mean different things in
  // two of them — and so a fact saved inside a project is not silently answered
  // with the account-wide row, which would leave it readable everywhere.
  const [existing] = await db
    .select()
    .from(memory)
    .where(
      and(
        eq(memory.userId, userId),
        eq(memory.content, content),
        projectId === null ? isNull(memory.projectId) : eq(memory.projectId, projectId),
      ),
    )
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
      projectId,
    })
    .returning();
  return row;
}

export async function updateMemory(
  id: string,
  userId: string,
  patch: Partial<Pick<Memory, "content" | "category" | "enabled" | "projectId">>,
): Promise<Memory | null> {
  // Verified, not trusted — the same reasoning as `updateChat`, and with more
  // at stake: an unchecked id here would file the memory under a project the
  // user does not own.
  const next =
    "projectId" in patch
      ? { ...patch, projectId: await ownedProjectId(patch.projectId ?? null, userId) }
      : patch;

  const [row] = await db
    .update(memory)
    .set({ ...next, updatedAt: new Date() })
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

/**
 * Written directly rather than through better-auth's `admin` plugin
 * endpoint: that endpoint requires the *caller* to already be an admin,
 * which is exactly the bootstrap problem `ensureFirstAdmin` (in
 * `session.ts`) exists to solve — there has to be a way to create the first
 * one. Every promotion after that can go through the plugin's own
 * `auth.api.setRole` if an admin UI ever calls it directly.
 */
export async function setUserRole(userId: string, role: string): Promise<void> {
  await db.update(user).set({ role }).where(eq(user.id, userId));
}

/* ------------------------------------------------------------------ *
 * Managed mode
 *
 * Unused unless `ORG_MANAGED_KEYS=true` — see `schema.ts`'s comment on
 * `managedProviderKey`/`spendLimit` for why there is no org id here.
 * ------------------------------------------------------------------ */

/** The org's key for one provider, decrypted — `null` if the admin hasn't configured it yet. */
export async function getManagedKey(provider: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(managedProviderKey)
    .where(eq(managedProviderKey.provider, provider))
    .limit(1);
  return row ? decryptProviderKey(row) : null;
}

/** Every provider the admin has configured a key for — what the employee-facing provider picker in managed mode is allowed to show. */
export async function listManagedProviders(): Promise<string[]> {
  const rows = await db.select({ provider: managedProviderKey.provider }).from(managedProviderKey);
  return rows.map((r) => r.provider);
}

/** Stores (or replaces) the org's key for one provider. Never returns the plaintext back. */
export async function setManagedKey(provider: string, plaintextKey: string): Promise<void> {
  const encrypted = encryptProviderKey(plaintextKey);
  await db
    .insert(managedProviderKey)
    .values({ provider, ...encrypted })
    .onConflictDoUpdate({
      target: managedProviderKey.provider,
      set: { ...encrypted, updatedAt: new Date() },
    });
}

export async function removeManagedKey(provider: string): Promise<void> {
  await db.delete(managedProviderKey).where(eq(managedProviderKey.provider, provider));
}

export interface SpendStatus {
  /** `null` means unlimited — set for an admin's own account by `ensureFirstAdmin`, in `session.ts`. */
  limitCents: number | null;
  spentCentsThisPeriod: number;
  periodDays: number;
  resetAt: Date;
  /**
   * False for an employee with no `spendLimit` row at all — the admin hasn't
   * set them up yet. `resetAt` on an unconfigured status is a placeholder
   * (`now`), not a real period boundary: nothing changes when it passes, only
   * when an admin actually sets a limit. A caller building a user-facing
   * message needs this to avoid promising an automatic reset that isn't
   * coming — that's exactly the message this field exists to prevent.
   */
  configured: boolean;
}

/**
 * An employee's current spend status against their cap, resetting the
 * period first if it has elapsed (see `spend-period.ts`).
 *
 * An employee with no row at all — the admin hasn't configured them yet —
 * resolves to a blocking `limitCents: 0`, not unlimited. Unconfigured must
 * never silently mean "no cap"; that is the one failure mode a spend limit
 * exists specifically to prevent.
 */
export async function getSpendStatus(userId: string, now: Date = new Date()): Promise<SpendStatus> {
  const [row] = await db.select().from(spendLimit).where(eq(spendLimit.userId, userId)).limit(1);
  if (!row) {
    return { limitCents: 0, spentCentsThisPeriod: 0, periodDays: 30, resetAt: now, configured: false };
  }

  if (periodHasElapsed({ periodStart: row.periodStart, periodDays: row.periodDays }, now)) {
    const reset = resetPeriod(now);
    await db.update(spendLimit).set(reset).where(eq(spendLimit.userId, userId));
    return {
      limitCents: row.limitCents,
      spentCentsThisPeriod: reset.spentCentsThisPeriod,
      periodDays: row.periodDays,
      resetAt: new Date(reset.periodStart.getTime() + row.periodDays * 24 * 60 * 60 * 1000),
      configured: true,
    };
  }

  return {
    configured: true,
    limitCents: row.limitCents,
    spentCentsThisPeriod: row.spentCentsThisPeriod,
    periodDays: row.periodDays,
    resetAt: new Date(row.periodStart.getTime() + row.periodDays * 24 * 60 * 60 * 1000),
  };
}

/**
 * Adds to the running total for the period just spent in. A no-op for a user
 * with no row (nothing to add to) — that user was already blocked by
 * `getSpendStatus` before a request could reach the point this is called
 * from, in `app/api/chat/route.ts`'s `onEnd`.
 */
export async function recordManagedSpend(userId: string, cents: number): Promise<void> {
  if (cents <= 0) return;
  await db
    .update(spendLimit)
    .set({ spentCentsThisPeriod: sql`${spendLimit.spentCentsThisPeriod} + ${cents}` })
    .where(eq(spendLimit.userId, userId));
}

/** Sets (or replaces) one employee's cap. Called from the admin panel only. */
export async function setSpendLimit(
  userId: string,
  input: { limitCents: number | null; periodDays: number },
): Promise<void> {
  await db
    .insert(spendLimit)
    .values({ userId, limitCents: input.limitCents, periodDays: input.periodDays })
    .onConflictDoUpdate({
      target: spendLimit.userId,
      // Explicitly not resetting `periodStart`/`spentCentsThisPeriod` here:
      // changing an employee's limit mid-period should not also hand them a
      // fresh, unspent period as a side effect.
      set: { limitCents: input.limitCents, periodDays: input.periodDays },
    });
}

export interface EmployeeSpend {
  userId: string;
  name: string;
  email: string;
  role: string;
  limitCents: number | null;
  spentCentsThisPeriod: number;
  periodDays: number;
}

/** Every account on this instance with its role and current spend, for the admin panel's employee table. */
export async function listEmployeeSpend(): Promise<EmployeeSpend[]> {
  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      // Selected separately from `limitCents` so a missing row and a row
      // whose limit is genuinely `null` (unlimited — the admin's own
      // account) can be told apart. A left join leaves every selected
      // spendLimit column null in both cases; `spendLimit.limitCents ?? 0`
      // alone would wrongly flatten "never configured" and "deliberately
      // unlimited" into the same value.
      hasSpendRow: spendLimit.userId,
      limitCents: spendLimit.limitCents,
      spentCentsThisPeriod: spendLimit.spentCentsThisPeriod,
      periodDays: spendLimit.periodDays,
    })
    .from(user)
    .leftJoin(spendLimit, eq(spendLimit.userId, user.id))
    .orderBy(asc(user.email));

  return rows.map(({ hasSpendRow, ...r }) => ({
    ...r,
    // Only defaulted to blocked when there's no row at all — the same
    // "unconfigured means blocked" rule `getSpendStatus` applies. A row that
    // exists with `limitCents: null` means unlimited, and must stay null.
    limitCents: hasSpendRow ? r.limitCents : 0,
    spentCentsThisPeriod: r.spentCentsThisPeriod ?? 0,
    periodDays: r.periodDays ?? 30,
  }));
}
