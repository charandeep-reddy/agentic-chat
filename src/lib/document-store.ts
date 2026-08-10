import "server-only";

import { listDocuments } from "@/lib/rag/store";
import { searchPassages } from "@/lib/rag/client";
import type { DocumentPassage, DocumentStore } from "@/lib/tools/documents";

/**
 * Binds the retrieval tool to one user's corpus, mirroring
 * `createDbMemoryStore` and `createDbSkillStore`.
 *
 * This is the seam the split was designed around: the `DocumentStore` port
 * already existed, so moving retrieval out of process changed only this
 * adapter. The tool, the prompt, and the UI never learned that search now
 * happens in Python.
 *
 * The API key is captured here because search embeds the query, and embedding
 * is billed: the tool signature stays about *what* to search while the request
 * that owns the credentials decides whose budget pays for it.
 */
export function createDbDocumentStore(userId: string, apiKey: string): DocumentStore {
  return {
    async search(query, limit): Promise<DocumentPassage[]> {
      const { passages } = await searchPassages({ userId, query, limit, apiKey });
      // snake_case to camelCase at the boundary, so Python's naming does not
      // leak into the tool payload the UI renders.
      return passages.map((p) => ({
        chunkId: p.chunk_id,
        documentId: p.document_id,
        documentTitle: p.document_title,
        source: p.source,
        heading: p.heading,
        content: p.content,
        score: p.rerank_score ?? p.score,
        matchedBy: p.matched_by,
      }));
    },
  };
}

/**
 * The titles that go in the system prompt.
 *
 * Read straight from Postgres rather than through the service: it is a plain
 * table query on the request's critical path, and it runs on every chat turn.
 *
 * Only documents that finished indexing are listed. A pending or failed one is
 * not searchable, and naming it would have the model promise an answer the
 * retrieval tool cannot deliver.
 */
export async function selectPromptDocuments(
  userId: string,
): Promise<Array<{ title: string; source: string }>> {
  const rows = await listDocuments(userId);
  return rows
    .filter((d) => d.enabled && d.status === "ready" && d.chunkCount > 0)
    .map((d) => ({ title: d.title, source: d.source }));
}
