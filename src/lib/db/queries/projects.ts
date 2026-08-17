import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../index";
import { chat, project } from "../schema";
import type { Project } from "../schema";
import { newId } from "@/lib/id";

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
