import { describe, expect, it } from "vitest";
import { chartToTable } from "@/lib/tools/chart-util";
import type { ChartSpec } from "@/lib/tools/render-chart";

describe("chartToTable", () => {
  describe("pie charts", () => {
    it("converts a standard pie chart spec into a table", () => {
      const spec: ChartSpec = {
        kind: "chart",
        type: "pie",
        title: "Market Share",
        data: [
          { name: "Product A", value: 40 },
          { name: "Product B", value: 60 },
        ],
      };

      const table = chartToTable(spec);

      expect(table.kind).toBe("table");
      expect(table.truncated).toBe(false);
      expect(table.totalRows).toBe(2);
      expect(table.columns).toEqual([
        { name: "name", type: "string" },
        { name: "value", type: "number" },
      ]);
      expect(table.rows).toEqual([
        ["Product A", 40],
        ["Product B", 60],
      ]);
    });

    it("handles pie chart specs with missing or empty data array", () => {
      const spec: ChartSpec = {
        kind: "chart",
        type: "pie",
      };

      const table = chartToTable(spec);

      expect(table.kind).toBe("table");
      expect(table.totalRows).toBe(0);
      expect(table.columns).toEqual([
        { name: "name", type: "string" },
        { name: "value", type: "number" },
      ]);
      expect(table.rows).toEqual([]);
    });
  });

  describe("cartesian charts (bar / line)", () => {
    it("converts a bar chart with xLabels and multiple series", () => {
      const spec: ChartSpec = {
        kind: "chart",
        type: "bar",
        title: "Quarterly Performance",
        xLabels: ["Q1", "Q2"],
        series: [
          { name: "Revenue", data: [100, 150] },
          { name: "Profit", data: [20, 35] },
        ],
      };

      const table = chartToTable(spec);

      expect(table.kind).toBe("table");
      expect(table.truncated).toBe(false);
      expect(table.totalRows).toBe(2);
      expect(table.columns).toEqual([
        { name: "label", type: "string" },
        { name: "Revenue", type: "number" },
        { name: "Profit", type: "number" },
      ]);
      expect(table.rows).toEqual([
        ["Q1", 100, 20],
        ["Q2", 150, 35],
      ]);
    });

    it("converts a line chart spec", () => {
      const spec: ChartSpec = {
        kind: "chart",
        type: "line",
        xLabels: ["Jan", "Feb", "Mar"],
        series: [{ name: "Users", data: [10, 25, 50] }],
      };

      const table = chartToTable(spec);

      expect(table.kind).toBe("table");
      expect(table.totalRows).toBe(3);
      expect(table.columns).toEqual([
        { name: "label", type: "string" },
        { name: "Users", type: "number" },
      ]);
      expect(table.rows).toEqual([
        ["Jan", 10],
        ["Feb", 25],
        ["Mar", 50],
      ]);
    });

    it("falls back to 1-indexed string row numbers when xLabels is missing", () => {
      const spec: ChartSpec = {
        kind: "chart",
        type: "bar",
        series: [{ name: "Score", data: [95, 88, 72] }],
      };

      const table = chartToTable(spec);

      expect(table.columns[0]).toEqual({ name: "label", type: "string" });
      expect(table.rows).toEqual([
        ["1", 95],
        ["2", 88],
        ["3", 72],
      ]);
    });

    it("handles empty series array", () => {
      const spec: ChartSpec = {
        kind: "chart",
        type: "line",
        series: [],
      };

      const table = chartToTable(spec);

      expect(table.kind).toBe("table");
      expect(table.totalRows).toBe(0);
      expect(table.columns).toEqual([{ name: "label", type: "string" }]);
      expect(table.rows).toEqual([]);
    });

    it("fills null for a series whose data is shorter than the first series", () => {
      const spec: ChartSpec = {
        kind: "chart",
        type: "bar",
        xLabels: ["Day 1", "Day 2", "Day 3"],
        series: [
          { name: "Series A", data: [10, 20, 30] },
          { name: "Series B", data: [5] },
        ],
      };

      const table = chartToTable(spec);

      expect(table.totalRows).toBe(3);
      expect(table.rows).toEqual([
        ["Day 1", 10, 5],
        ["Day 2", 20, null],
        ["Day 3", 30, null],
      ]);
    });

    it("caps rows at first series length when a later series is longer", () => {
      const spec: ChartSpec = {
        kind: "chart",
        type: "bar",
        xLabels: ["Pt 1"],
        series: [
          { name: "Short First Series", data: [1] },
          { name: "Long Second Series", data: [10, 20, 30] },
        ],
      };

      const table = chartToTable(spec);

      expect(table.totalRows).toBe(1);
      expect(table.rows).toEqual([["Pt 1", 1, 10]]);
    });
  });
});
