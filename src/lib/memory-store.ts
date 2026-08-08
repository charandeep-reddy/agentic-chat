import "server-only";

import { createMemory, deleteMemory, listMemories, markMemoriesUsed } from "@/lib/db/queries";
import type { MemoryStore } from "@/lib/tools/memory";
import type { Memory } from "@/lib/db/schema";
import type { ChatMemoryScope } from "@/lib/memory-scope";

/** Memories over this count get filtered by relevance instead of all injected. */
const PROMPT_BUDGET = 40;

/** Every enabled memory, before any per-chat scope is applied. */
export function listCandidateMemories(userId: string): Promise<Memory[]> {
  return listMemories(userId, { enabledOnly: true });
}

export function createDbMemoryStore(userId: string): MemoryStore {
  return {
    async save({ content, category }) {
      const before = await listMemories(userId);
      const existing = before.find((m) => m.content === content.trim());
      const row = await createMemory(userId, { content, category, source: "agent" });
      if (!row) throw new Error("Could not save the memory.");
      return {
        id: row.id,
        content: row.content,
        category: row.category,
        alreadyKnown: Boolean(existing),
      };
    },

    async search(query) {
      const all = await listMemories(userId, { enabledOnly: true });
      const ranked = rankMemories(all, query).slice(0, 10);
      await markMemoriesUsed(ranked.map((m) => m.id));
      return ranked.map((m) => ({ id: m.id, content: m.content, category: m.category }));
    },

    async forget(id) {
      return deleteMemory(id, userId);
    },
  };
}

/**
 * Keyword overlap ranking. Deliberately not embeddings: memories are short,
 * few, and written in the user's own words, so token overlap gets the right
 * answer without an extra model call on every turn. Swapping in pgvector is a
 * drop-in change here.
 */
export function rankMemories(memories: Memory[], query: string): Memory[] {
  const terms = tokenize(query);
  if (terms.length === 0) return memories;

  return memories
    .map((m) => {
      const words = new Set(tokenize(m.content));
      let score = 0;
      for (const term of terms) {
        if (words.has(term)) score += 2;
        else if (m.content.toLowerCase().includes(term)) score += 1;
      }
      return { memory: m, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.memory);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((w) => w.length > 2);
}

/**
 * Picks the memories to inline into the system prompt: everything when the
 * user has few, otherwise the most-used ones plus anything matching the
 * current message.
 *
 * The chat's own scope is applied first. It narrows what this conversation can
 * see; it cannot widen it past the account-level toggle, which the caller
 * checks separately.
 *
 * Pure, and takes the candidate list rather than fetching it. The chat row and
 * the memory list are read concurrently in the route — the scope is not known
 * until the former lands, and making this query wait for it would put another
 * round trip in front of the first token.
 */
export function selectPromptMemories(
  all: Memory[],
  latestUserText: string,
  chatScope: ChatMemoryScope = { scope: "all", ids: [] },
): Memory[] {
  if (chatScope.scope === "none") return [];

  if (chatScope.scope === "selected") {
    // An explicit selection is the user's own shortlist, so it is used whole
    // rather than run through the relevance budget below.
    const wanted = new Set(chatScope.ids);
    return all.filter((m) => wanted.has(m.id));
  }

  if (all.length <= PROMPT_BUDGET) return all;

  const relevant = rankMemories(all, latestUserText).slice(0, PROMPT_BUDGET / 2);
  const relevantIds = new Set(relevant.map((m) => m.id));
  const frequent = [...all]
    .sort((a, b) => b.useCount - a.useCount)
    .filter((m) => !relevantIds.has(m.id))
    .slice(0, PROMPT_BUDGET - relevant.length);

  return [...relevant, ...frequent];
}
