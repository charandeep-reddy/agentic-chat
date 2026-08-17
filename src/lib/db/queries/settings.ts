import "server-only";

import { eq } from "drizzle-orm";
import { db } from "../index";
import { userSettings } from "../schema";
import type { UserSettings } from "../schema";

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
