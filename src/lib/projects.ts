/**
 * Shared project constants and shapes.
 *
 * Deliberately free of any database import so the client can use it too: the
 * picker and the project form need the same length limits the API enforces, and
 * a second copy of a number is how the two drift apart — a field that accepts
 * 200 characters and an endpoint that silently truncates at 80.
 */

/** Room for a real brief, not room for a pasted document. */
export const MAX_PROJECT_NAME = 80;
export const MAX_PROJECT_DESCRIPTION = 500;
export const MAX_PROJECT_INSTRUCTIONS = 8_000;

/** What the list endpoints return. Mirrors `ProjectSummary` in `db/queries`. */
export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  chatCount: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What deleting a project will actually do, in the words of this project.
 *
 * Written per case rather than as one sentence with numbers slotted in. The
 * generic version read "Its 0 chats will be kept and become ungrouped. Its 0
 * project memories will be permanently deleted." on an empty project — which
 * describes consequences that do not exist, and makes a harmless action sound
 * like it is about to destroy something.
 */
export function describeProjectDeletion(chatCount: number, memoryCount: number): string {
  const clauses: string[] = [];
  if (chatCount > 0) {
    clauses.push(
      `${plural(chatCount, "chat", "chats")} will be kept and ${
        chatCount === 1 ? "becomes" : "become"
      } ungrouped`,
    );
  }
  if (memoryCount > 0) {
    clauses.push(
      `${plural(memoryCount, "project memory", "project memories")} will be permanently deleted`,
    );
  }

  if (clauses.length === 0) return "This project is empty. Deleting it cannot be undone.";
  return `Its ${clauses.join(", and its ")}. This cannot be undone.`;
}

/** Trims and caps a free-text field, returning null for an empty one. */
export function normalizeField(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}
