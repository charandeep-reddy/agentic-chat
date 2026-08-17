import "server-only";

import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db } from "../index";
import { chat, message } from "../schema";
import { touchChat } from "./chats";

export interface StoredMessage {
  id: string;
  role: string;
  parts: UIMessage["parts"];
  metadata: unknown;
  createdAt: Date;
}

export async function getMessages(chatId: string, userId: string): Promise<StoredMessage[]> {
  const rows = await db
    .select({
      id: message.id,
      role: message.role,
      parts: message.parts,
      metadata: message.metadata,
      createdAt: message.createdAt,
    })
    .from(message)
    // `message` carries no `userId` of its own (see `countUserStats` in
    // `chats.ts`), so scoping this by owner means joining through `chat`
    // rather than a plain `eq`.
    .innerJoin(chat, eq(chat.id, message.chatId))
    .where(and(eq(message.chatId, chatId), eq(chat.userId, userId)))
    .orderBy(asc(message.ordinal), asc(message.createdAt));

  return rows.map((r) => ({ ...r, parts: r.parts as UIMessage["parts"] }));
}

/**
 * The public counterpart to `getMessages`, for `/share/[shareId]`: a viewer
 * there is often anonymous, so there is no `userId` to scope by. Safe only
 * because the caller has already resolved `chatId` through `getSharedChat`,
 * which is itself scoped by `shareId` — a value only the chat's owner could
 * have handed out by sharing the link.
 */
export async function getSharedMessages(chatId: string): Promise<StoredMessage[]> {
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
  userId: string,
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

  // `message` has no `userId` column for the insert below to filter by, so
  // ownership has to be checked up front — the one place this function can
  // refuse a write into someone else's chat, rather than trusting the caller
  // already checked (see `getMessages` above for the read-side equivalent).
  const [owned] = await db
    .select({ id: chat.id })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);
  if (!owned) {
    throw new Error(`Refusing to save messages to chat ${chatId}: not owned by user ${userId}.`);
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
    touchChat(chatId, userId),
  ]);
}

/**
 * Removes the given message and everything after it. Used by edit-and-resend
 * and regenerate, which both rewrite the tail of the conversation.
 */
export async function truncateFrom(chatId: string, userId: string, messageId: string): Promise<void> {
  // Joined through `chat` for the same reason as `getMessages`: no `target`
  // row also means "not this user's chat", so the delete below is skipped
  // rather than needing a separate ownership check.
  const [target] = await db
    .select({ ordinal: message.ordinal })
    .from(message)
    .innerJoin(chat, eq(chat.id, message.chatId))
    .where(and(eq(message.chatId, chatId), eq(message.id, messageId), eq(chat.userId, userId)))
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

export async function countMessages(chatId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(message)
    .innerJoin(chat, eq(chat.id, message.chatId))
    .where(and(eq(message.chatId, chatId), eq(chat.userId, userId)));
  return row?.count ?? 0;
}
