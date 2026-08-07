import { describe, expect, it } from "vitest";
import { renderChart, renderChartSchema } from "@/lib/tools/render-chart";

describe("render_chart", () => {
  it("normalizes a bar chart spec", () => {
    const spec = renderChart({
      type: "bar",
      title: "Sales",
      xLabels: ["Jan", "Feb"],
      series: [{ name: "Units", data: [10, 20] }],
    });
    expect(spec.kind).toBe("chart");
    expect(spec.type).toBe("bar");
    expect(spec.series?.[0].data).toEqual([10, 20]);
  });

  it("validates a pie chart", () => {
    const spec = renderChart({
      type: "pie",
      data: [
        { name: "A", value: 3 },
        { name: "B", value: 7 },
      ],
    });
    expect(spec.kind).toBe("chart");
    expect(spec.data).toHaveLength(2);
  });

  it("rejects a pie chart without data", () => {
    expect(() => renderChart({ type: "pie", series: [{ name: "x", data: [1] }] })).toThrow(/pie/);
  });

  it("rejects cartesian charts without series", () => {
    expect(() => renderChart({ type: "line" })).toThrow(/series/);
  });

  it("rejects mismatched xLabels and series lengths", () => {
    const result = renderChartSchema.safeParse({
      type: "line",
      xLabels: ["a", "b", "c"],
      series: [{ name: "s", data: [1, 2] }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("xLabels");
    }
  });

  it("rejects non-finite numbers", () => {
    const result = renderChartSchema.safeParse({
      type: "bar",
      series: [{ name: "s", data: [1, NaN] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects pie data with all zero values", () => {
    expect(() =>
      renderChart({
        type: "pie",
        data: [
          { name: "A", value: 0 },
          { name: "B", value: 0 },
        ],
      }),
    ).toThrow(/non-zero/);
  });
});
