import { z } from "zod";
import { ToolError } from "./errors";

/**
 * Formats the widget knows how to label and download. Not an open-ended
 * mime-type field: a small, named set keeps the extension, icon, and any
 * format-specific validation (JSON below) predictable instead of trusting
 * whatever string the model passes.
 */
export const FILE_FORMATS = ["json", "csv", "txt", "md", "xml", "yaml"] as const;
export type FileFormat = (typeof FILE_FORMATS)[number];

const EXTENSION: Record<FileFormat, string> = {
  json: "json",
  csv: "csv",
  txt: "txt",
  md: "md",
  xml: "xml",
  yaml: "yaml",
};

const MIME_TYPE: Record<FileFormat, string> = {
  json: "application/json",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
  xml: "application/xml",
  yaml: "application/yaml",
};

export const generateFileSchema = z.object({
  filename: z.string().min(1, "filename must be non-empty").max(100, "filename must be under 100 characters"),
  content: z
    .string()
    .min(1, "content must be non-empty")
    // Same ceiling as render_html's document: generous for anything a model
    // writes in one turn, small enough that a stored message row and a chat
    // export stay reasonable sizes.
    .max(200_000, "content must be under 200000 characters"),
  format: z.enum(FILE_FORMATS).default("txt"),
});

export type GenerateFileArgs = z.infer<typeof generateFileSchema>;

export interface FileSpec {
  kind: "file";
  filename: string;
  content: string;
  mimeType: string;
  format: FileFormat;
  bytes: number;
}

/**
 * Strips path separators and traversal so the download name can never escape
 * the browser's downloads folder, then forces the extension that matches
 * `format` — the model's own extension is discarded rather than trusted,
 * since the widget's icon and mime type are picked from `format`, not from
 * whatever the filename happens to end in.
 */
function sanitizeFilename(raw: string, format: FileFormat): string {
  const stripped = raw
    .replace(/[\\/]/g, "")
    .replace(/\.\./g, "")
    // Any trailing extension, not just one matching `format` — the model may
    // have guessed a different (or wrong) one, and it's always replaced.
    .replace(/\.[a-z0-9]{1,10}$/i, "")
    .trim();
  const safe = stripped.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${safe || "file"}.${EXTENSION[format]}`;
}

/**
 * Builds a downloadable-file spec. Pure and synchronous — no filesystem
 * write happens here or anywhere in this tool; the browser writes the file
 * when the user clicks download, same as render_html's own download button.
 */
export function generateFile(args: GenerateFileArgs): FileSpec {
  const { content, format } = args;

  if (format === "json") {
    try {
      JSON.parse(content);
    } catch (err) {
      throw new ToolError(
        `content must be valid JSON when format is "json": ${err instanceof Error ? err.message : "parse error"}. Fix the JSON and try again.`,
      );
    }
  }

  return {
    kind: "file",
    filename: sanitizeFilename(args.filename, format),
    content,
    mimeType: MIME_TYPE[format],
    format,
    bytes: new TextEncoder().encode(content).length,
  };
}
