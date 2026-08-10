import "server-only";

/**
 * Client for the RAG service (`services/rag`).
 *
 * Chunking, embedding, extraction, hybrid search and reranking all live in
 * Python now. What stayed here is everything that would have cost more to move
 * than it was worth: better-auth sessions, the chat stream protocol, and the
 * Drizzle schema — which remains the single owner of migrations.
 *
 * The boundary is deliberately narrow. Next.js authenticates the person and
 * then vouches for them by passing a `userId` it has already verified; no
 * cookies cross it, and the service filters every query by that id rather than
 * trusting the token to imply one.
 */

export class RagServiceError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "RagServiceError";
    this.status = status;
  }
}

function baseUrl(): string {
  const url = process.env.RAG_SERVICE_URL;
  if (!url) {
    throw new RagServiceError(
      "RAG_SERVICE_URL is not set — start services/rag and point this at it.",
      503,
    );
  }
  return url.replace(/\/+$/, "");
}

function serviceToken(): string {
  const token = process.env.RAG_SERVICE_TOKEN;
  if (!token) {
    throw new RagServiceError("RAG_SERVICE_TOKEN is not set.", 503);
  }
  return token;
}

/**
 * Ingestion embeds every chunk of a document, which for a long PDF is minutes
 * of provider round trips. Search is one embedding call plus two indexed
 * queries — if it has not answered in 30s something is wrong upstream and
 * waiting longer only holds the model's turn open.
 */
const INGEST_TIMEOUT_MS = 300_000;
const SEARCH_TIMEOUT_MS = 30_000;

async function call<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: { ...init.headers, "x-service-token": serviceToken() },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof RagServiceError) throw error;
    throw new RagServiceError(
      `Could not reach the RAG service: ${error instanceof Error ? error.message : String(error)}`,
      503,
    );
  }

  const body = (await response.json().catch(() => ({}))) as {
    detail?: string;
  } & Record<string, unknown>;

  if (!response.ok) {
    // FastAPI puts the message in `detail`, and those messages are written for
    // the end user ("your embeddings key is wrong"), so they are passed through
    // rather than flattened into a generic failure.
    throw new RagServiceError(
      typeof body.detail === "string" ? body.detail : `RAG service returned ${response.status}.`,
      response.status,
    );
  }

  return body as T;
}

export interface ServicePassage {
  chunk_id: string;
  document_id: string;
  document_title: string;
  source: string;
  heading: string | null;
  content: string;
  ordinal: number;
  score: number;
  matched_by: string[];
  /** Present only when a cross-encoder reordered the results. */
  rerank_score?: number;
}

export interface SearchResponse {
  passages: ServicePassage[];
  /** False when no reranker is configured — the results are in fusion order. */
  reranked: boolean;
}

export function searchPassages(input: {
  userId: string;
  query: string;
  limit: number;
  apiKey?: string | null;
}): Promise<SearchResponse> {
  return call<SearchResponse>(
    "/search",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: input.userId,
        query: input.query,
        limit: input.limit,
        api_key: input.apiKey ?? null,
      }),
    },
    SEARCH_TIMEOUT_MS,
  );
}

export interface IngestResponse {
  chunk_count: number;
  characters: number;
}

/** Indexes text already stored on the document row — pasted text, or a re-index. */
export function ingestDocument(input: {
  documentId: string;
  userId: string;
  apiKey?: string | null;
}): Promise<IngestResponse> {
  return call<IngestResponse>(
    "/ingest",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        document_id: input.documentId,
        user_id: input.userId,
        api_key: input.apiKey ?? null,
      }),
    },
    INGEST_TIMEOUT_MS,
  );
}

/**
 * Indexes an uploaded file — PDF, DOCX, or anything decodable as text.
 *
 * The bytes are streamed straight through as multipart rather than being
 * base64'd into JSON: encoding inflates a 20 MB PDF to ~27 MB and forces the
 * whole thing into memory on both sides before a byte of it can be parsed.
 */
export function ingestFile(input: {
  documentId: string;
  userId: string;
  file: File;
  apiKey?: string | null;
}): Promise<IngestResponse> {
  const form = new FormData();
  form.set("document_id", input.documentId);
  form.set("user_id", input.userId);
  if (input.apiKey) form.set("api_key", input.apiKey);
  form.set("file", input.file, input.file.name);

  // No content-type header: fetch sets it, with the multipart boundary.
  return call<IngestResponse>("/ingest/file", { method: "POST", body: form }, INGEST_TIMEOUT_MS);
}

export interface ServiceHealth {
  ok: boolean;
  embeddings_model: string;
  embedding_dimensions: number;
  rerank_model: string | null;
  rerank_enabled: boolean;
}

export function serviceHealth(): Promise<ServiceHealth> {
  return call<ServiceHealth>("/health", { method: "GET" }, 5_000);
}
