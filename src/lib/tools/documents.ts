import { z } from "zod";
import { ToolError } from "./errors";

/**
 * The generation half of RAG.
 *
 * Retrieval is a tool call rather than an automatic prefix on every request.
 * The alternative — embed the user's message, staple the top chunks onto the
 * system prompt, every turn — is simpler but pays the embedding round trip on
 * "thanks, that worked" and floods the context with passages that have nothing
 * to do with the question. Letting the model decide costs one extra step when
 * retrieval *is* needed and nothing when it is not, and it lets the model
 * rewrite a vague question into a better query before searching.
 */

export const searchDocumentsSchema = z.object({
  query: z
    .string()
    .min(2, "query must be at least 2 characters")
    .max(400, "query must be under 400 characters")
    .describe(
      "What to look for, phrased as the passage you hope to find rather than as a question.",
    ),
  /** Bounded: each result is a chunk of prose, and ten of them is a lot of context. */
  limit: z.number().int().min(1).max(10).optional(),
});

export type SearchDocumentsArgs = z.infer<typeof searchDocumentsSchema>;

export interface DocumentPassage {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  source: string;
  heading: string | null;
  content: string;
  score: number;
  matchedBy: string[];
}

export interface DocumentSearchResult {
  kind: "document_search";
  query: string;
  passages: DocumentPassage[];
}

/**
 * Per-request port, mirroring `MemoryStore`: the tool layer stays free of the
 * database so its behaviour can be unit-tested without a live Postgres.
 */
export interface DocumentStore {
  search(query: string, limit: number): Promise<DocumentPassage[]>;
}

export async function searchDocuments(
  args: SearchDocumentsArgs,
  store: DocumentStore,
): Promise<DocumentSearchResult> {
  const query = args.query.trim();
  if (!query) throw new ToolError("Search query cannot be empty.");

  const passages = await store.search(query, args.limit ?? 6);

  // An empty result is reported as a successful search that found nothing, not
  // as an error. The distinction matters: a tool error invites the model to
  // retry with different arguments, whereas "the corpus does not cover this" is
  // the answer, and the model should say so rather than fill the gap from its
  // own weights.
  return { kind: "document_search", query, passages };
}

/**
 * Renders passages for the model.
 *
 * Each passage is labelled with an explicit citation key. Asking the model to
 * cite `[1]` only works if `[1]` is visibly attached to the text it is reading;
 * without the labels it will still cite, but it will invent the numbers.
 */
export function formatPassages(result: DocumentSearchResult): string {
  if (result.passages.length === 0) {
    return `No passages in the user's documents match "${result.query}".`;
  }

  const blocks = result.passages.map((passage, i) => {
    const where = passage.heading
      ? `${passage.documentTitle} › ${passage.heading}`
      : passage.documentTitle;
    return `[${i + 1}] ${where}\n${passage.content}`;
  });

  return [
    `${result.passages.length} passage(s) for "${result.query}".`,
    "Answer from these passages. Cite the ones you use as [1], [2], and so on.",
    "If they do not contain the answer, say so — do not fill the gap from memory.",
    "",
    blocks.join("\n\n---\n\n"),
  ].join("\n");
}
