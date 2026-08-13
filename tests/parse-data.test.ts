import { describe, expect, it } from "vitest";
import {
  MAX_PREVIEW_ROWS,
  describeTable,
  parseData,
  parseDataSchema,
} from "@/lib/tools/parse-data";

describe("parse_data", () => {
  it("parses CSV with a header row and infers types", () => {
    const table = parseData({ data: "city,sales,active\nDelhi,120,true\nMumbai,95,false", format: "auto" });
    expect(table.kind).toBe("table");
    expect(table.columns).toEqual([
      { name: "city", type: "string" },
      { name: "sales", type: "number" },
      { name: "active", type: "boolean" },
    ]);
    expect(table.totalRows).toBe(2);
    expect(table.rows[0]).toEqual(["Delhi", 120, true]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    const table = parseData({
      data: 'name,note\n"Smith, John","said ""hi"""\nDoe,"a,b"',
      format: "csv",
    });
    expect(table.rows[0]).toEqual(["Smith, John", 'said "hi"']);
    expect(table.rows[1]).toEqual(["Doe", "a,b"]);
  });

  it("parses JSON arrays of objects and flattens nested values", () => {
    const table = parseData({
      data: JSON.stringify([{ name: "a", score: 10, tags: ["x", "y"] }, { name: "b", score: 20 }]),
      format: "auto",
    });
    expect(table.columns.map((c) => c.name)).toEqual(["name", "score", "tags"]);
    expect(table.rows[0]).toEqual(["a", 10, '["x","y"]']);
    expect(table.rows[1]).toEqual(["b", 20, null]);
  });

  it("detects TSV automatically", () => {
    const table = parseData({ data: "a\tb\n1\t2\n3\t4", format: "auto" });
    expect(table.columns.map((c) => c.name)).toEqual(["a", "b"]);
    expect(table.totalRows).toBe(2);
  });

  it("normalizes empty cells to null", () => {
    const table = parseData({ data: "a,b\n1,\n,2", format: "csv" });
    expect(table.rows[0]).toEqual([1, null]);
    expect(table.rows[1]).toEqual([null, 2]);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseData({ data: "{not json", format: "json" })).toThrow(/Invalid JSON/);
  });

  it("rejects empty data", () => {
    expect(() => parseData({ data: "", format: "csv" })).toThrow();
  });

  it("rejects header-only input", () => {
    expect(() => parseData({ data: "a,b\n", format: "csv" })).toThrow(/no data rows/);
  });

  it("validates args through the zod schema", () => {
    const result = parseDataSchema.safeParse({ data: "a\n1", format: "auto" });
    expect(result.success).toBe(true);
    const bad = parseDataSchema.safeParse({ data: "" });
    expect(bad.success).toBe(false);
  });
});

/**
 * What the model is told after a parse.
 *
 * The rows are deliberately withheld. Handing the model a fully parsed table
 * and then asking it not to repeat one did not work: it rendered the widget
 * and printed a "Data table" section of the same numbers underneath.
 */
describe("describeTable", () => {
  const table = parseData({
    data: "city,sales,active\nDelhi,120,true\nMumbai,95,false",
    format: "auto",
  });

  it("reports the shape", () => {
    const summary = describeTable(table);
    expect(summary).toContain("Parsed 2 rows");
    expect(summary).toContain("city (string)");
    expect(summary).toContain("sales (number)");
    expect(summary).toContain("active (boolean)");
  });

  it("does not carry the cell values", () => {
    // The whole point: no table-shaped block in context to be echoed. The
    // values remain readable in `data`, which is this tool's own argument.
    const summary = describeTable(table);
    for (const cell of ["Delhi", "Mumbai", "120", "95"]) {
      expect(summary).not.toContain(cell);
    }
  });

  it("tells the model the user can already see it", () => {
    expect(describeTable(table)).toMatch(/already displayed/i);
  });

  it("says how many rows were kept when the preview is capped", () => {
    const rows = Array.from({ length: MAX_PREVIEW_ROWS + 10 }, (_, i) => `r${i},${i}`).join("\n");
    const big = parseData({ data: `name,value\n${rows}`, format: "auto" });
    const summary = describeTable(big);
    expect(big.truncated).toBe(true);
    expect(summary).toContain(`Parsed ${MAX_PREVIEW_ROWS + 10} rows`);
    expect(summary).toContain(`first ${MAX_PREVIEW_ROWS} shown`);
  });
});
