import { describe, expect, it } from "vitest";
import { cleanTitle, titleFromText } from "@/lib/title";

describe("cleanTitle", () => {
  it("strips surrounding quotes and trailing punctuation", () => {
    expect(cleanTitle('"Quarterly revenue trends."')).toBe("Quarterly revenue trends");
    expect(cleanTitle("`Backtick wrapped`")).toBe("Backtick wrapped");
  });

  it("keeps only the first line when the model rambles", () => {
    expect(cleanTitle("OAuth Flow Diagram\n\nHere is why I chose that.")).toBe(
      "OAuth Flow Diagram",
    );
  });

  it("caps the length", () => {
    expect(cleanTitle("x".repeat(200))).toHaveLength(60);
  });

  it("returns empty for whitespace, so the caller falls back", () => {
    expect(cleanTitle("   \n  ")).toBe("");
  });
});

describe("titleFromText", () => {
  it("collapses whitespace", () => {
    expect(titleFromText("  Parse   this\n\nCSV  ")).toBe("Parse this CSV");
  });

  it("truncates long messages with an ellipsis", () => {
    const title = titleFromText("word ".repeat(50));

    expect(title).toHaveLength(60);
    expect(title.endsWith("…")).toBe(true);
  });

  it("falls back to a placeholder for empty input", () => {
    expect(titleFromText("   ")).toBe("New chat");
  });
});
