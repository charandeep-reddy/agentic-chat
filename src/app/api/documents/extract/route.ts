import { requireUserApi } from "@/lib/session";
import { DocumentExtractionError, extractPdfText } from "@/lib/document";

export const dynamic = "force-dynamic";

/** Above this, a PDF is rejected before it's even parsed. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Extracts plain text from an uploaded PDF, server-side, so the composer can
 * attach it as ordinary text on the message — the one path that works
 * whether or not the selected model has native document or vision support.
 * Nothing here touches the database; a private chat's attachment is exactly
 * as ephemeral as the rest of that conversation.
 */
export async function POST(req: Request) {
  const authed = await requireUserApi();
  if ("error" in authed) return authed.error;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "Only PDF files are supported right now." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "That PDF is over the 20 MB limit." }, { status: 400 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await extractPdfText(bytes);
    return Response.json({ name: file.name, ...doc });
  } catch (err) {
    if (err instanceof DocumentExtractionError) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    return Response.json({ error: "Could not read this PDF." }, { status: 422 });
  }
}
