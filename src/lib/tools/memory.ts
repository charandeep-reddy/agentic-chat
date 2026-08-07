import { z } from "zod";
import { ToolError } from "./errors";

export const MEMORY_CATEGORIES = ["preference", "fact", "project", "instruction"] as const;

export const saveMemorySchema = z.object({
  content: z
    .string()
    .min(4, "content must be at least 4 characters")
    .max(500, "content must be under 500 characters"),
  category: z.enum(MEMORY_CATEGORIES).optional(),
});

export type SaveMemoryArgs = z.infer<typeof saveMemorySchema>;

export const searchMemorySchema = z.object({
  query: z.string().min(2).max(200),
});

export type SearchMemoryArgs = z.infer<typeof searchMemorySchema>;

export const forgetMemorySchema = z.object({
  id: z.string().min(1),
});

export interface MemorySaved {
  kind: "memory_saved";
  id: string;
  content: string;
  category: string;
  alreadyKnown: boolean;
}

export interface MemorySearchResult {
  kind: "memory_search";
  query: string;
  matches: Array<{ id: string; content: string; category: string }>;
}

export interface MemoryForgotten {
  kind: "memory_forgotten";
  id: string;
}

/**
 * The tools need per-request identity, so the registry is built per request
 * from a small port rather than importing the database directly. That also
 * keeps the tool layer unit-testable without a live Postgres.
 */
export interface MemoryStore {
  save(input: {
    content: string;
    category: string;
  }): Promise<{ id: string; content: string; category: string; alreadyKnown: boolean }>;
  search(query: string): Promise<Array<{ id: string; content: string; category: string }>>;
  forget(id: string): Promise<boolean>;
}

export async function saveMemory(
  args: SaveMemoryArgs,
  store: MemoryStore,
): Promise<MemorySaved> {
  const content = args.content.trim();
  if (!content) throw new ToolError("Memory content cannot be empty.");
  const saved = await store.save({ content, category: args.category ?? "fact" });
  return { kind: "memory_saved", ...saved };
}

export async function searchMemory(
  args: SearchMemoryArgs,
  store: MemoryStore,
): Promise<MemorySearchResult> {
  const matches = await store.search(args.query.trim());
  return { kind: "memory_search", query: args.query.trim(), matches };
}

export async function forgetMemory(
  args: z.infer<typeof forgetMemorySchema>,
  store: MemoryStore,
): Promise<MemoryForgotten> {
  const ok = await store.forget(args.id);
  if (!ok) throw new ToolError(`No memory with id ${args.id} — call search_memory first to get valid ids.`);
  return { kind: "memory_forgotten", id: args.id };
}
