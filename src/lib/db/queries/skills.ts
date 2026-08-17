import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../index";
import { skill } from "../schema";
import type { Skill } from "../schema";
import { newId } from "@/lib/id";

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

export async function markSkillUsed(id: string, userId: string): Promise<void> {
  await db
    .update(skill)
    .set({ useCount: sql`${skill.useCount} + 1`, lastUsedAt: new Date() })
    .where(and(eq(skill.id, id), eq(skill.userId, userId)));
}
