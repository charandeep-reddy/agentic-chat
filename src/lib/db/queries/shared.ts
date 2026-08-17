import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "../index";
import { project } from "../schema";

/**
 * Narrows a project id to one this user actually owns.
 *
 * The foreign key only proves the project exists — it says nothing about whose
 * it is. Without this, a client could file its own chat under a stranger's
 * project id and pull that project's instructions and memories into its prompt.
 * Returns null for an id that does not resolve, which files the chat as
 * ungrouped rather than failing the whole request.
 *
 * Shared by `chats.ts` and `memories.ts` — both file rows under a project and
 * both need the same check.
 */
export async function ownedProjectId(projectId: string | null, userId: string): Promise<string | null> {
  if (!projectId) return null;
  const [row] = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .limit(1);
  return row?.id ?? null;
}
