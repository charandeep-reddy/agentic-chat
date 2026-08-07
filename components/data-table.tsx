"use client";

import type { ParsedTable } from "@/lib/tools/parse-data";

export function DataTable({ table }: { table: ParsedTable }) {
  const preview = table.rows.slice(0, 8);

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <span className="text-xs font-medium text-zinc-300">Parsed table</span>
        <span className="text-xs text-zinc-500">
          {table.columns.length} cols · {table.totalRows} rows
          {table.truncated ? " (preview)" : ""}
        </span>
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-zinc-900">
            <tr>
              {table.columns.map((col, i) => (
                <th key={i} className="border-b border-zinc-800 px-3 py-1.5 font-medium text-zinc-300">
                  {col.name}
                  <span className="ml-1 font-mono text-[10px] text-zinc-600">{col.type}</span>
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
