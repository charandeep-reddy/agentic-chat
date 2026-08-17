import "server-only";

import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "../index";
import { chat, memory, message, user } from "../schema";
import type { Chat } from "../schema";
import { newId } from "@/lib/id";
import type { ChatCursor } from "@/lib/chat-cursor";
import { ownedProjectId } from "./shared";

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

export async function touchChat(chatId: string, userId: string): Promise<void> {
  await db
    .update(chat)
    .set({ updatedAt: new Date() })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
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
