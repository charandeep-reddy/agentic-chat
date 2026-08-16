"use client";

import { useMemo, useState } from "react";
import type { Cell, ParsedTable } from "@/lib/tools/parse-data";
import { WidgetShell, StatusChip, WidgetAction } from "./widget-shell";
import { IconTable, IconDownload, IconFile } from "./icons";

const TYPE_LABELS = { number: "num", string: "str", boolean: "bool", null: "null" } as const;

function compareCells(a: Cell, b: Cell): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function downloadBlob(content: string, mimeType: string, filename: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCsv(table: ParsedTable) {
  const header = table.columns.map((c) => `"${c.name.replace(/"/g, '""')}"`).join(",");
  const lines = table.rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","));
  downloadBlob([header, ...lines].join("\n"), "text/csv", "data.csv");
}

function exportJson(table: ParsedTable) {
  const rows = table.rows.map((row) =>
    Object.fromEntries(table.columns.map((c, i) => [c.name, row[i] ?? null])),
  );
  downloadBlob(JSON.stringify(rows, null, 2), "application/json", "data.json");
}

export function DataTable({ table }: { table: ParsedTable }) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const sortedRows = useMemo(() => {
    if (sortCol === null) return table.rows;
    return [...table.rows].sort((a, b) => compareCells(a[sortCol] ?? null, b[sortCol] ?? null) * sortDir);
  }, [table.rows, sortCol, sortDir]);

  const preview = sortedRows.slice(0, 8);

  const toggleSort = (i: number) => {
    if (sortCol === i) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortCol(i);
      setSortDir(1);
    }
  };

  return (
    <WidgetShell
      icon={<IconTable size={15} />}
      title="Table"
      status={
        <StatusChip tone="info">
          {table.columns.length} cols · {table.totalRows} rows
        </StatusChip>
      }
      actions={
        <>
          <WidgetAction onClick={() => exportCsv(table)} label="Export CSV">
            <IconDownload size={14} />
          </WidgetAction>
          <WidgetAction onClick={() => exportJson(table)} label="Export JSON">
            <IconFile size={14} />
          </WidgetAction>
        </>
      }
      footer={
        table.totalRows > preview.length ? (
          <span className="text-micro text-text-faint">
            Showing {preview.length} of {table.totalRows} rows · click a column header to sort
          </span>
        ) : (
          <span className="text-micro text-text-faint">Click a column header to sort</span>
        )
      }
    >
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-left text-dense">
          <thead className="sticky top-0 bg-bg-elevated">
            <tr>
              {table.columns.map((col, i) => (
                <th key={i}>
                  <button
                    type="button"
                    onClick={() => toggleSort(i)}
                    className={`flex w-full items-center gap-1 border-b border-border px-3 py-1.5 text-left font-medium transition-colors hover:bg-surface-raised ${
                      sortCol === i ? "text-accent" : "text-text-secondary"
                    }`}
                  >
                    <span className="truncate">{col.name}</span>
                    <span className="font-mono text-micro text-text-faint">{TYPE_LABELS[col.type]}</span>
                    {sortCol === i && <span className="font-mono text-micro text-accent">{sortDir === 1 ? "↑" : "↓"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, r) => (
              <tr key={r} className="odd:bg-surface/50">
                {row.map((cell, c) => (
                  <td key={c} className="max-w-[220px] truncate px-3 py-1 text-text-muted">
                    {String(cell ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
            {preview.length === 0 && (
              <tr>
                <td colSpan={table.columns.length} className="px-3 py-6 text-center text-text-faint">
                  No rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </WidgetShell>
  );
}
