import { requireUserApi } from "@/lib/session";
import { createDocument, listDocuments, markDocumentFailed } from "@/lib/rag/store";
import { ingestDocument, ingestFile, RagServiceError } from "@/lib/rag/client";

export const dynamic = "force-dynamic";

/** Roughly 250 pages of prose. Past this, ingestion belongs in a job queue. */
const MAX_CONTENT_CHARS = 600_000;
/** Binary uploads are bounded by bytes instead — a 40 MB PDF is not a document. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export async function GET() {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const documents = await listDocuments(authed.user.id);
  return Response.json({ documents });
}

/**
 * Accepts a document and indexes it through the RAG service.
 *
 * Two shapes, because the two inputs are genuinely different: JSON for pasted
 * text, multipart for a file. The file path streams bytes to Python for
 * extraction — PDF and DOCX parsing is the reason that service exists.
 *
 * The row is created here either way, so Next.js stays the only writer of
 * `document` and the service only ever fills in what it produced.
 */
export async function POST(req: Request) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  // Embedding is billed to whoever owns the key, and this app is BYOK, so the
  // upload carries the same header the chat route uses. A server-side
  // EMBEDDINGS_API_KEY on the service overrides it when one is configured.
  const apiKey = req.headers.get("x-model-key");
  const contentType = req.headers.get("content-type") ?? "";

  return contentType.includes("multipart/form-data")
    ? uploadFile(req, authed.user.id, apiKey)
    : uploadText(req, authed.user.id, apiKey);
}

async function uploadText(req: Request, userId: string, apiKey: string | null) {
  let body: { title?: string; content?: string; source?: string; mimeType?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const content = body.content?.trim();
  if (!content) return Response.json({ error: "empty_content" }, { status: 400 });
  if (content.length > MAX_CONTENT_CHARS) {
    return Response.json(
      { error: "too_long", message: `Documents are capped at ${MAX_CONTENT_CHARS} characters.` },
      { status: 400 },
    );
  }

  const document = await createDocument(userId, {
    title: (body.title ?? "").trim().slice(0, 200) || "Untitled",
    content,
    source: (body.source ?? "pasted").slice(0, 200),
    mimeType: body.mimeType ?? "text/plain",
  });

  return index(document, () => ingestDocument({ documentId: document.id, userId, apiKey }));
}

async function uploadFile(req: Request, userId: string, apiKey: string | null) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "missing_file" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json(
      {
        error: "too_large",
        message: `Files are capped at ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB.`,
      },
      { status: 400 },
    );
  }

  const title = String(form.get("title") ?? "").trim().slice(0, 200);
  const document = await createDocument(userId, {
    // The text is unknown until Python has extracted it; the service writes it
    // back onto this row, which is what makes a later re-index free.
    title: title || file.name.replace(/\.[^.]+$/, "") || "Untitled",
    content: "",
    source: file.name.slice(0, 200),
    mimeType: file.type || "application/octet-stream",
  });

  return index(document, () => ingestFile({ documentId: document.id, userId, file, apiKey }));
}

/**
 * Runs the indexing call and shapes the response.
 *
 * Always 201: the document row was stored, and it is the *indexing* that may
 * have failed. The client lists it with the error and a retry rather than
 * discarding text the user may have pasted by hand.
 */
async function index(
  document: { id: string; title: string },
  run: () => Promise<{ chunk_count: number }>,
) {
  try {
    const { chunk_count: chunkCount } = await run();
    return Response.json(
      { document: { ...document, status: "ready", chunkCount } },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof RagServiceError ? error.message : "Indexing failed.";
    // The service marks its own failures on the row; this covers the case where
    // it could not be reached at all, so nothing is left stuck at "pending".
    await markDocumentFailed(document.id, message);
    return Response.json(
      {
        document: { ...document, status: "failed", chunkCount: 0 },
        error: "indexing_failed",
        message,
      },
      { status: 201 },
    );
  }
}
