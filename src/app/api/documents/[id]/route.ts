import { requireUserApi } from "@/lib/session";
import {
  deleteDocument,
  getDocument,
  markDocumentFailed,
  setDocumentEnabled,
} from "@/lib/rag/store";
import { ingestDocument, RagServiceError } from "@/lib/rag/client";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { id } = await params;
  const document = await getDocument(id, authed.user.id);
  if (!document) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ document });
}

/**
 * Toggles a document, or re-indexes it.
 *
 * Re-indexing is a first-class action rather than an internal detail: a changed
 * chunk size or embedding model invalidates every stored vector, and the
 * original text was kept precisely so that rebuilding does not need the user
 * to upload anything again.
 */
export async function PATCH(req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { id } = await params;
  const apiKey = req.headers.get("x-model-key");

  let body: { enabled?: boolean; reindex?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  if (typeof body.enabled === "boolean") {
    const ok = await setDocumentEnabled(id, authed.user.id, body.enabled);
    if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
  }

  if (body.reindex) {
    try {
      const { chunk_count: chunkCount } = await ingestDocument({
        documentId: id,
        userId: authed.user.id,
        apiKey,
      });
      return Response.json({ ok: true, chunkCount });
    } catch (error) {
      const message = error instanceof RagServiceError ? error.message : "Indexing failed.";
      await markDocumentFailed(id, message);
      return Response.json({ error: "indexing_failed", message }, { status: 502 });
    }
  }

  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const { id } = await params;
  const ok = await deleteDocument(id, authed.user.id);
  if (!ok) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
