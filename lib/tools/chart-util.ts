import type { ChartSpec } from "./render-chart";
import type { ParsedTable } from "./parse-data";

export function chartToTable(spec: ChartSpec): ParsedTable {
  if (spec.type === "pie") {
    return {
      kind: "table",
      columns: [
        { name: "name", type: "string" },
        { name: "value", type: "number" },
      ],
      rows: (spec.data ?? []).map((d) => [d.name, d.value]),
      totalRows: spec.data?.length ?? 0,
      truncated: false,
    };
  }

  const x = spec.xLabels ?? [];
  const series = spec.series ?? [];
  return {
    kind: "table",
    columns: [{ name: "label", type: "string" }, ...series.map((s) => ({ name: s.name, type: "number" as const }))],
    rows: series[0]?.data.map((_, i) => [x[i] ?? String(i + 1), ...series.map((s) => s.data[i] ?? null)]) ?? [],
    totalRows: series[0]?.data.length ?? 0,
    truncated: false,
  };
}
