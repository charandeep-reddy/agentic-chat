import { z } from "zod";
import { ToolError } from "./errors";

export const CHART_TYPES = ["bar", "line", "area", "pie", "scatter"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

const seriesSchema = z.object({
  name: z.string().min(1).max(80),
  data: z.array(z.number().finite()).min(1).max(5000),
});

const pieDatumSchema = z.object({
  name: z.string().min(1).max(80),
  value: z.number().finite(),
});

export const renderChartSchema = z
  .object({
    type: z.enum(CHART_TYPES),
    title: z.string().max(120).optional(),
    xLabels: z.array(z.string()).min(1).max(500).optional(),
    series: z.array(seriesSchema).min(1).max(10).optional(),
    data: z.array(pieDatumSchema).min(1).max(1000).optional(),
  })
  .superRefine((spec, ctx) => {
    if (spec.type === "pie") {
      if (!spec.data) {
        ctx.addIssue({
          code: "custom",
          message: "pie charts require a `data` array of { name, value } objects (e.g. data: [{ name: 'X', value: 10 }]).",
        });
      }
      return;
    }
    if (!spec.series) {
      ctx.addIssue({
        code: "custom",
        message: "chart type '" + spec.type + "' requires a `series` array of { name, data } objects.",
      });
      return;
    }
    if (spec.xLabels) {
      const labels = spec.xLabels.length;
      for (const s of spec.series) {
        if (s.data.length !== labels) {
          ctx.addIssue({
            code: "custom",
            message: `series "${s.name}" has ${s.data.length} values but xLabels has ${labels}. Every series must have exactly one value per label.`,
          });
        }
      }
    }
  });

export type RenderChartArgs = z.infer<typeof renderChartSchema>;

export interface ChartSpec {
  kind: "chart";
  type: ChartType;
  title?: string;
  xLabels?: string[];
  series?: { name: string; data: number[] }[];
  data?: { name: string; value: number }[];
}

export function renderChart(args: RenderChartArgs): ChartSpec {
  const { type, title, xLabels, series, data } = args;
  if (type === "pie") {
    if (!data) throw new ToolError("pie charts require a `data` array of { name, value } objects.");
    const total = data.reduce((sum, d) => sum + Math.abs(d.value), 0);
    if (total === 0) throw new ToolError("pie chart data must have at least one non-zero value.");
    return { kind: "chart", type, title, data };
  }
  if (!series) throw new ToolError(`chart type '${type}' requires a 'series' array.`);
  return { kind: "chart", type, title, xLabels, series };
}
