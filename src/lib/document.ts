import { extractText, getDocumentProxy, getResolvedPDFJS } from "unpdf";
import type { PDFDocumentProxy } from "unpdf/pdfjs";

/**
 * Ceiling on the extracted text handed back to the client.
 *
 * Unlike a tool result, this text is typed straight into the composer's
 * message text — so once sent, it is stored as part of that user message and
 * replayed into the prompt on *every* later turn of the conversation for the
 * life of the chat, same reasoning as `MAX_TEXT_RESPONSE` in
 * `lib/tools/errors.ts`. Kept a little larger than that budget since a
 * document the user deliberately attached is more likely to matter than an
 * incidental fetch.
 */
export const MAX_DOCUMENT_CHARS = 40_000;

export class DocumentExtractionError extends Error {}

/**
 * What the transcript shows for an attachment, deliberately without the
 * extracted text itself — the full text still goes to the model (folded into
 * the message text sent over the wire), it just isn't the right thing to
 * render as if the user had typed it.
 */
export interface AttachmentSummary {
  name: string;
  pageCount: number;
  hasUncapturedImages: boolean;
}

export interface ExtractedDocument {
  pageCount: number;
  text: string;
  truncated: boolean;
  /**
   * True when some page carries an embedded image but little or no text of
   * its own — a chart, scan, or photo that didn't make it into `text`.
   * Extraction only ever reads the text layer; this is the signal that the
   * text layer alone may not be the whole document.
   */
  hasUncapturedImages: boolean;
}

/** Pure — no PDF parsing involved, so it's cheap to test on its own. */
export function truncateExtractedText(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

/**
 * A page counts as "image-dominant" once it paints an image and carries
 * under this much text of its own — enough to catch a chart or scanned page,
 * loose enough not to flag a letterhead logo next to a full page of prose.
 */
const IMAGE_DOMINANT_TEXT_THRESHOLD = 200;

const IMAGE_OPS = new Set([
  "paintImageXObject",
  "paintInlineImageXObject",
  "paintImageXObjectRepeat",
  "paintImageMaskXObject",
]);

async function pageHasUncapturedImage(
  pdf: PDFDocumentProxy,
  pageNum: number,
  pageText: string,
): Promise<boolean> {
  if (pageText.trim().length >= IMAGE_DOMINANT_TEXT_THRESHOLD) return false;
  const pdfjs = await getResolvedPDFJS();
  const page = await pdf.getPage(pageNum);
  const { fnArray } = await page.getOperatorList();
  const opNames = new Map(Object.entries(pdfjs.OPS).map(([name, code]) => [code, name]));
  return fnArray.some((fn) => IMAGE_OPS.has(opNames.get(fn) ?? ""));
}

/**
 * Extracts plain text from a PDF, page by page, so any model — including
 * text-only ones with no native document or vision support — can read it.
 * The extraction happens once, server-side, before the model ever sees the
 * file; from the model's point of view it is just text in the message.
 *
 * Images are never read — only the text layer. `hasUncapturedImages` flags
 * when that leaves something out, rather than silently handing back partial
 * content with no indication anything was skipped.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<ExtractedDocument> {
  let pdf: PDFDocumentProxy;
  try {
    pdf = await getDocumentProxy(bytes);
  } catch {
    throw new DocumentExtractionError(
      "Could not read this PDF — it may be corrupted, encrypted, or not a valid PDF file.",
    );
  }

  const { totalPages, text: perPage } = await extractText(pdf, { mergePages: false });
  const text = perPage.join("\n\n");
  const trimmed = text.trim();
  if (!trimmed) {
    throw new DocumentExtractionError(
      "No extractable text found in this PDF — it may be a scanned image with no text layer.",
    );
  }

  const flags = await Promise.all(
    perPage.map((pageText, i) => pageHasUncapturedImage(pdf, i + 1, pageText)),
  );
  const hasUncapturedImages = flags.some(Boolean);

  const { text: capped, truncated } = truncateExtractedText(trimmed, MAX_DOCUMENT_CHARS);
  return { pageCount: totalPages, text: capped, truncated, hasUncapturedImages };
}

/**
 * The plain-text block a document attachment becomes once sent — deliberately
 * not markdown or pseudo-HTML, since it is spliced straight into a user
 * message's text and must read identically to every model regardless of
 * markup support.
 */
export function formatDocumentBlock(name: string, doc: ExtractedDocument): string {
  const pages = `${doc.pageCount} page${doc.pageCount === 1 ? "" : "s"}`;
  const status = doc.truncated ? ", truncated" : "";
  const imageNote = doc.hasUncapturedImages
    ? ` — this document also contains images, charts, or scanned pages that are not included below as text`
    : "";
  return [
    `[Attached file: ${name} — ${pages}${status}${imageNote}]`,
    doc.text,
    `[End of ${name}]`,
  ].join("\n");
}
