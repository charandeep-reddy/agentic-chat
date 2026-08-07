import { z } from "zod";
import { ToolError } from "./errors";

export type Cell = number | string | boolean | null;
export type ColumnType = "number" | "string" | "boolean" | "null";

export const MAX_PREVIEW_ROWS = 200;
export const MAX_INPUT_CHARS = 200_000;

export const parseDataSchema = z.object({
  data: z
    .string()
    .min(1, "data must be non-empty")
    .max(MAX_INPUT_CHARS, `data must be under ${MAX_INPUT_CHARS} characters`),
  format: z.enum(["auto", "csv", "json"]).default("auto"),
});

export type ParseDataArgs = z.infer<typeof parseDataSchema>;

export interface ParsedTable {
  kind: "table";
  columns: { name: string; type: ColumnType }[];
  rows: Cell[][];
  totalRows: number;
  truncated: boolean;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  return rows;
}

function parseTSV(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => line.split("\t"));
}

function detectDelimiter(text: string): "," | "\t" {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  return tabs > commas ? "\t" : ",";
}

function normalizeCell(value: string): Cell {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : trimmed;
  }
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === "true";
  return trimmed;
}

function inferColumnType(values: Cell[]): ColumnType {
  for (const v of values) {
    if (v === null) continue;
    if (typeof v === "number") return "number";
    if (typeof v === "boolean") return "boolean";
    return "string";
  }
  return "null";
}

function parseJSONTable(text: string): { columns: string[]; rows: Cell[][] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ToolError("Invalid JSON: could not parse the data string.");
  }

  const records = Array.isArray(parsed) ? parsed : [parsed];
  if (records.length === 0) {
    throw new ToolError("Invalid JSON: expected a non-empty array of objects.");
  }
  if (!records.every((r) => typeof r === "object" && r !== null && !Array.isArray(r))) {
    throw new ToolError("Invalid JSON: expected an array of objects (or a single object).");
  }

  const columnNames = new Set<string>();
  for (const r of records as Record<string, unknown>[]) {
    for (const key of Object.keys(r)) columnNames.add(key);
  }
  const columns = [...columnNames];
  const rows = (records as Record<string, unknown>[]).map((r) =>
    columns.map((c) => {
      const v = r[c];
      if (v === undefined || v === null) return null;
      if (typeof v === "number" || typeof v === "boolean") return v;
      if (typeof v === "string") return normalizeCell(v);
      return JSON.stringify(v);
    }),
  );

  return { columns, rows };
}

export function parseData(args: ParseDataArgs): ParsedTable {
  const format = args.format === "auto" ? (args.data.trimStart().startsWith("[") || args.data.trimStart().startsWith("{") ? "json" : "csv") : args.format;

  let columns: string[];
  let rawRows: string[][];
  if (format === "json") {
    const { columns: cols, rows } = parseJSONTable(args.data);
    columns = cols;
    rawRows = rows.map((r) => r.map((c) => String(c ?? "")));
  } else {
    const delimiter = detectDelimiter(args.data);
    const rows = delimiter === "\t" ? parseTSV(args.data) : parseCSV(args.data);
    if (rows.length === 0) {
      throw new ToolError("Could not find any data rows.");
    }
    columns = rows[0].map((c, i) => c.trim() || `column_${i + 1}`);
    rawRows = rows.slice(1);
  }

  if (rawRows.length === 0) {
    throw new ToolError("Header row found, but no data rows to parse.");
  }

  const width = columns.length;
  const cells: Cell[][] = rawRows.map((r) => {
    const normalized = r.map((c) => normalizeCell(c));
    while (normalized.length < width) normalized.push(null);
    return normalized.slice(0, width);
  });

  const columnTypes = columns.map((_, i) => inferColumnType(cells.map((r) => r[i])));

  const truncated = cells.length > MAX_PREVIEW_ROWS;
  return {
    kind: "table",
    columns: columns.map((name, i) => ({ name, type: columnTypes[i] })),
    rows: cells.slice(0, MAX_PREVIEW_ROWS),
    totalRows: cells.length,
    truncated,
  };
}
