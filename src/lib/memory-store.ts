import "server-only";

import { createMemory, deleteMemory, listMemories, markMemoriesUsed } from "@/lib/db/queries";
import type { MemoryStore } from "@/lib/tools/memory";
import type { Memory } from "@/lib/db/schema";

/** Memories over this count get filtered by relevance instead of all injected. */
const PROMPT_BUDGET = 40;

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
 * user has few, otherwise the most-used ones plus anything matching `anchor`.
 *
 * `anchor` is the conversation's **first** user message, not its latest, and
 * that is the whole point. This result is inlined into the system prompt, which
 * sits at position 0 of every request — and prefix caching, which both DeepSeek
 * and OpenAI apply automatically, keys on the longest *unchanged* prefix. A
 * system prompt that is rebuilt for each turn therefore does not merely lose
 * its own few hundred tokens: it invalidates the entire transcript behind it,
 * on a history that is otherwise append-only and would cache perfectly.
 *
 * Anchoring to the opening message makes the selection stable for the life of
 * the conversation, so the prefix stops moving. What that gives up is
 * auto-injecting a memory that only becomes relevant later — which is what
 * `search_memory` is for, and the model can reach for it at any point.
 *
 * The returned order is stable for the same reason: `useCount` is written as
 * memories are used, so ordering by it would reshuffle the prompt mid-chat even
 * when the chosen set had not changed. It still decides *which* memories are
 * picked; it just no longer decides where they sit.
 */
export async function selectPromptMemories(userId: string, anchor: string): Promise<Memory[]> {
  return choosePromptMemories(await listMemories(userId, { enabledOnly: true }), anchor);
}

/** The selection itself, without the database, so the stability is testable. */
export function choosePromptMemories(all: Memory[], anchor: string): Memory[] {
  if (all.length <= PROMPT_BUDGET) return byStableOrder(all);

  const relevant = rankMemories(all, anchor).slice(0, PROMPT_BUDGET / 2);
  const relevantIds = new Set(relevant.map((m) => m.id));
  const frequent = [...all]
    .sort((a, b) => b.useCount - a.useCount)
    .filter((m) => !relevantIds.has(m.id))
    .slice(0, PROMPT_BUDGET - relevant.length);

  return byStableOrder([...relevant, ...frequent]);
}

/** Any total order will do, so long as it cannot change between two turns. */
function byStableOrder(memories: Memory[]): Memory[] {
  return [...memories].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
