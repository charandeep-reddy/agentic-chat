import { describe, expect, it } from "vitest";
import { formatPassages, searchDocuments } from "@/lib/tools/documents";
import type { DocumentPassage, DocumentStore } from "@/lib/tools/documents";

/**
 * Ranking itself — chunking, cosine similarity, RRF fusion, reranking — moved
 * to `services/rag` and is tested there (`services/rag/tests/`). What is still
 * TypeScript is the tool boundary: how the model is asked to search, and how
 * passages are presented back to it. That is what these cover.
 */

function stubStore(passages: DocumentPassage[]): DocumentStore {
  return { search: async () => passages };
}

const PASSAGE: DocumentPassage = {
  chunkId: "c1",
  documentId: "d1",
  documentTitle: "Handbook",
  source: "handbook.md",
  heading: "Billing > Refunds",
  content: "Annual plans can be refunded within 30 days.",
  score: 0.9,
  matchedBy: ["vector"],
};

describe("search_documents", () => {
  it("returns the passages the store found", async () => {
    const result = await searchDocuments({ query: "refund window" }, stubStore([PASSAGE]));
    expect(result.kind).toBe("document_search");
    expect(result.passages).toHaveLength(1);
  });

  it("reports an empty corpus as a successful search, not an error", async () => {
    const result = await searchDocuments({ query: "refund window" }, stubStore([]));
    expect(result.passages).toEqual([]);
    expect(formatPassages(result)).toMatch(/No passages/);
  });

  it("rejects a blank query", async () => {
    await expect(searchDocuments({ query: "   " }, stubStore([]))).rejects.toThrow(/empty/);
  });

  it("passes the requested limit through to the store", async () => {
    let seen = 0;
    await searchDocuments(
      { query: "refunds", limit: 3 },
      { search: async (_q, limit) => ((seen = limit), []) },
    );
    expect(seen).toBe(3);
  });
});

describe("formatPassages", () => {
  it("labels passages so the model can cite real numbers", () => {
    const text = formatPassages({
      kind: "document_search",
      query: "refunds",
      passages: [PASSAGE, { ...PASSAGE, chunkId: "c2", heading: null }],
    });
    expect(text).toContain("[1] Handbook › Billing > Refunds");
    expect(text).toContain("[2] Handbook");
    expect(text).toContain("do not contain the answer");
  });
});
