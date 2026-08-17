import "server-only";

import { eq } from "drizzle-orm";
import { db } from "../index";
import { user } from "../schema";

export async function deleteUser(userId: string): Promise<void> {
  // Every app table cascades from `user`, so one delete clears the account.
  await db.delete(user).where(eq(user.id, userId));
}
