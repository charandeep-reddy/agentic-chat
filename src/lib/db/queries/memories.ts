import "server-only";

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../index";
import { memory } from "../schema";
import type { Memory } from "../schema";
import { newId } from "@/lib/id";
import { ownedProjectId } from "./shared";

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

export async function markMemoriesUsed(ids: string[], userId: string): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(memory)
    .set({ useCount: sql`${memory.useCount} + 1`, lastUsedAt: new Date() })
    .where(and(sql`${memory.id} = any(${ids})`, eq(memory.userId, userId)));
}
