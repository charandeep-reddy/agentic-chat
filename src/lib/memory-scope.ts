/**
 * Which of the user's memories one conversation is allowed to see.
 *
 * Kept apart from `memory-store.ts`, which is `server-only`: the picker in the
 * chat header needs these values, and importing them from there would drag the
 * database into the client bundle.
 */
export const MEMORY_SCOPES = ["all", "none", "selected"] as const;

export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export function isMemoryScope(value: unknown): value is MemoryScope {
  return typeof value === "string" && (MEMORY_SCOPES as readonly string[]).includes(value);
}

export interface ChatMemoryScope {
  scope: MemoryScope;
  /** Only meaningful when `scope` is "selected". */
  ids: string[];
}
