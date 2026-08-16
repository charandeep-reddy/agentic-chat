import { describe, expect, it } from "vitest";
import { generateFile } from "@/lib/tools/generate-file";
import { ToolError } from "@/lib/tools/errors";

describe("generate_file", () => {
  it("builds a plain-text file spec with the right extension and mime type", () => {
    const spec = generateFile({ filename: "notes", content: "hello", format: "txt" });
    expect(spec).toMatchObject({
      kind: "file",
      filename: "notes.txt",
      content: "hello",
      mimeType: "text/plain",
      format: "txt",
      bytes: 5,
    });
  });

  it("accepts and re-checks valid JSON", () => {
    const spec = generateFile({ filename: "data", content: '{"a":1}', format: "json" });
    expect(spec.filename).toBe("data.json");
    expect(spec.mimeType).toBe("application/json");
    expect(spec.content).toBe('{"a":1}');
  });

  it("rejects invalid JSON with a fixable error", () => {
    expect(() => generateFile({ filename: "data", content: "{not json", format: "json" })).toThrow(
      ToolError,
    );
  });

  it("does not require valid JSON for non-json formats", () => {
    expect(() => generateFile({ filename: "notes", content: "not json at all", format: "md" })).not.toThrow();
  });

  it("strips path separators and traversal from the filename", () => {
    const spec = generateFile({ filename: "../../etc/passwd", content: "x", format: "txt" });
    expect(spec.filename).not.toContain("/");
    expect(spec.filename).not.toContain("..");
    expect(spec.filename.endsWith(".txt")).toBe(true);
  });

  it("replaces the model's own extension with the one matching format", () => {
    const spec = generateFile({ filename: "report.pdf", content: "x", format: "csv" });
    expect(spec.filename).toBe("report.csv");
  });

  it("falls back to a generic name when sanitizing leaves nothing", () => {
    const spec = generateFile({ filename: "///", content: "x", format: "txt" });
    expect(spec.filename).toBe("file.txt");
  });

  it("computes byte length, not character length, for multi-byte content", () => {
    const spec = generateFile({ filename: "emoji", content: "🎉", format: "txt" });
    expect(spec.bytes).toBe(4);
  });
});
