import type { StoredMessage } from "@/lib/db/queries/messages";
import type { Chat, Memory, MemoryPack, Project, Skill, UserSettings } from "@/lib/db/schema";

/** Everything the export route reads out of the database, already user-scoped. */
export interface AccountExportParts {
  user: { id: string; name: string; email: string };
  settings: UserSettings | null;
  memories: Memory[];
  memoryPacks: MemoryPack[];
  projects: Project[];
  skills: Skill[];
  chats: (Chat & { messages: StoredMessage[] })[];
}

export interface AccountExport extends AccountExportParts {
  exportedAt: string;
}

/**
 * Every user-owned collection the export has to carry.
 *
 * Listed once, so the test can assert the payload covers all of them rather
 * than re-listing the same names and drifting apart from the real thing.
 */
export const ACCOUNT_EXPORT_COLLECTIONS = [
  "memories",
  "memoryPacks",
  "projects",
  "skills",
  "chats",
] as const satisfies readonly (keyof AccountExportParts)[];

/**
 * Assembles the account export payload.
 *
 * Kept out of the route so the payload *shape* is testable without a database.
 * The way an export breaks is silent omission — a table is added and nobody
 * remembers to export it — and that is a property of this object rather than
 * of the queries that fill it. `projects` and `skills` were missing here until
 * #30.
 *
 * The model API key is deliberately absent: it lives in `localStorage` and
 * never reaches the server, so there is nothing server-side to leave out.
 */
export function buildAccountExport(parts: AccountExportParts, now = new Date()): AccountExport {
  return { exportedAt: now.toISOString(), ...parts };
}

export function accountExportFilename(now = new Date()): string {
  return `agentic-chat-export-${now.toISOString().slice(0, 10)}.json`;
}
