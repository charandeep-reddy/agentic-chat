"use client";

import { useMemo, useState } from "react";
import type { Cell, ParsedTable } from "@/lib/tools/parse-data";
import { WidgetShell, StatusChip, WidgetAction } from "./widget-shell";
import { IconTable, IconDownload } from "./icons";

const TYPE_LABELS = { number: "num", string: "str", boolean: "bool", null: "null" } as const;

function compareCells(a: Cell, b: Cell): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function exportCsv(table: ParsedTable) {
  const header = table.columns.map((c) => `"${c.name.replace(/"/g, '""')}"`).join(",");
  const lines = table.rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","));
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "data.csv";
  a.click();
  URL.revokeObjectURL(url);
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
        <WidgetAction onClick={() => exportCsv(table)} label="Export CSV">
          <IconDownload size={14} />
        </WidgetAction>
      }
      footer={
        table.totalRows > preview.length ? (
          <span className="text-[11px] text-zinc-500">
            Showing {preview.length} of {table.totalRows} rows · click a column header to sort
          </span>
        ) : (
          <span className="text-[11px] text-zinc-500">Click a column header to sort</span>
        )
      }
    >
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-zinc-900">
            <tr>
              {table.columns.map((col, i) => (
                <th key={i}>
                  <button
                    type="button"
                    onClick={() => toggleSort(i)}
                    className={`flex w-full items-center gap-1 border-b border-zinc-800 px-3 py-1.5 text-left font-medium transition-colors hover:bg-zinc-800/50 ${
                      sortCol === i ? "text-emerald-400" : "text-zinc-300"
                    }`}
                  >
                    <span className="truncate">{col.name}</span>
                    <span className="font-mono text-[10px] text-zinc-600">{TYPE_LABELS[col.type]}</span>
                    {sortCol === i && <span className="font-mono text-[10px] text-emerald-400">{sortDir === 1 ? "↑" : "↓"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, r) => (
              <tr key={r} className="odd:bg-zinc-950/40">
                {row.map((cell, c) => (
                  <td key={c} className="max-w-[220px] truncate px-3 py-1 text-zinc-400">
                    {String(cell ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
            {preview.length === 0 && (
              <tr>
                <td colSpan={table.columns.length} className="px-3 py-6 text-center text-zinc-600">
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
