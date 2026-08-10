/**
 * Document rows: create, list, toggle, delete.
 *
 * Everything that touches a *vector* moved to `services/rag` — chunking,
 * embedding, hybrid search, reranking. What is left here is ordinary CRUD over
 * the `document` table, because the Next.js pages read it directly in server
 * components and routing those through an HTTP hop would add latency to buy
 * nothing.
 *
 * The `document_chunk` table is written only by the Python service. Drizzle
 * still owns its schema and its migrations: one service writes structure, the
 * other writes rows, which is what keeps the two from drifting.
 */

import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { document } from "@/lib/db/schema";
import type { Document } from "@/lib/db/schema";
import { newId } from "@/lib/db/queries";

export interface DocumentSummary {
  id: string;
  title: string;
  source: string;
  status: string;
  error: string | null;
  chunkCount: number;
  enabled: boolean;
  createdAt: Date;
}

export async function listDocuments(userId: string): Promise<DocumentSummary[]> {
  return db
    .select({
      id: document.id,
      title: document.title,
      source: document.source,
      status: document.status,
      error: document.error,
      chunkCount: document.chunkCount,
      enabled: document.enabled,
      createdAt: document.createdAt,
    })
    .from(document)
    .where(eq(document.userId, userId))
    .orderBy(desc(document.createdAt))
    .limit(200);
}

export async function getDocument(id: string, userId: string): Promise<Document | null> {
  const [row] = await db
    .select()
    .from(document)
    .where(and(eq(document.id, id), eq(document.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Cascades to the chunks through the foreign key, vectors included. */
export async function deleteDocument(id: string, userId: string): Promise<boolean> {
  const rows = await db
    .delete(document)
    .where(and(eq(document.id, id), eq(document.userId, userId)))
    .returning({ id: document.id });
  return rows.length > 0;
}

export async function setDocumentEnabled(
  id: string,
  userId: string,
  enabled: boolean,
): Promise<boolean> {
  const rows = await db
    .update(document)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(document.id, id), eq(document.userId, userId)))
    .returning({ id: document.id });
  return rows.length > 0;
}

export interface CreateDocumentInput {
  title: string;
  /** Empty for a binary upload: the service extracts the text and writes it back. */
  content?: string;
  source?: string;
  mimeType?: string;
}

/**
 * Writes the row with `status: "pending"` before any indexing happens.
 *
 * The row is the handoff point between the two services: Next.js creates it,
 * the Python service fills in the chunks and flips the status. A failure after
 * this point leaves a document the user can retry, not work they have to redo.
 */
export async function createDocument(
  userId: string,
  input: CreateDocumentInput,
): Promise<Document> {
  const [row] = await db
    .insert(document)
    .values({
      id: newId("doc"),
      userId,
      title: input.title.trim() || "Untitled",
      source: input.source ?? "pasted",
      mimeType: input.mimeType ?? "text/plain",
      content: input.content ?? "",
      status: "pending",
    })
    .returning();
  return row;
}

/** Recorded when the service could not be reached at all, so the row is not left pending. */
export async function markDocumentFailed(id: string, message: string): Promise<void> {
  await db
    .update(document)
    .set({ status: "failed", error: message.slice(0, 500), updatedAt: new Date() })
    .where(eq(document.id, id));
}
