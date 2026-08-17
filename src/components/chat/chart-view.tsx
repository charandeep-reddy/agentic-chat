"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent, DataZoomComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import type { ChartSpec } from "@/lib/tools/render-chart";
import { WidgetShell, StatusChip, WidgetAction } from "../widget-shell";
import { IconChart, IconDownload, IconTable } from "../icons";
import { DataTable } from "./data-table";
import { chartToTable } from "@/lib/tools/chart-util";
import { useTheme } from "../theme-provider";
import type { ResolvedTheme } from "@/lib/theme";

echarts.use([BarChart, LineChart, PieChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, DataZoomComponent, CanvasRenderer]);

/**
 * ECharts draws to a canvas, so it cannot read the CSS custom properties the
 * rest of the app themes with — every colour has to be handed to it as a
 * literal. These mirror `globals.css`; the light series are darker rather than
 * lighter, because a hue that reads well on near-black washes out on white.
 */
interface ChartTheme {
  text: string;
  muted: string;
  axis: string;
  split: string;
  tooltipBg: string;
  tooltipBorder: string;
  /** Painted between pie slices, so it has to match the surface behind them. */
  pieGap: string;
  palette: string[];
}

const CHART_THEMES: Record<ResolvedTheme, ChartTheme> = {
  dark: {
    text: "#d4d4d8",
    muted: "#71717a",
    axis: "#3f3f46",
    split: "#27272a",
    tooltipBg: "#18181b",
    tooltipBorder: "#3f3f46",
    pieGap: "#09090b",
    palette: ["#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa", "#f87171", "#2dd4bf", "#fb923c"],
  },
  light: {
    text: "#3f3f46",
    muted: "#71717a",
    axis: "#c9c9cf",
    split: "#e4e4e7",
    tooltipBg: "#ffffff",
    tooltipBorder: "#d4d4d8",
    pieGap: "#ffffff",
    palette: ["#059669", "#2563eb", "#db2777", "#d97706", "#7c3aed", "#dc2626", "#0d9488", "#ea580c"],
  },
};

function buildOption(spec: ChartSpec, t: ChartTheme): EChartsCoreOption {
  const base = {
    backgroundColor: "transparent",
    color: t.palette,
    title: spec.title ? { text: spec.title, left: "center", top: 0, textStyle: { color: t.text, fontSize: 14, fontWeight: 500 } } : undefined,
    tooltip: {
      trigger: spec.type === "pie" ? "item" : "axis",
      backgroundColor: t.tooltipBg,
      borderColor: t.tooltipBorder,
      textStyle: { color: t.text, fontSize: 12 },
    },
    legend: {
      top: spec.title ? 28 : 4,
      textStyle: { color: t.muted, fontSize: 11 },
      type: "scroll",
    },
  };

  if (spec.type === "pie") {
    return {
      ...base,
      series: [
        {
          type: "pie",
          radius: ["42%", "68%"],
          center: ["50%", "55%"],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: t.pieGap, borderWidth: 2 },
          label: { color: t.text, fontSize: 11, formatter: "{b}: {c}" },
          data: spec.data,
        },
      ],
    };
  }

  const series = (spec.series ?? []).map((s) => ({
    name: s.name,
    type: (spec.type === "area" ? "line" : spec.type) as "bar" | "line" | "scatter",
    areaStyle: spec.type === "area" ? { opacity: 0.25 } : undefined,
    smooth: spec.type === "line" || spec.type === "area",
    symbolSize: spec.type === "scatter" ? 8 : 5,
    data: s.data,
  }));

  return {
    ...base,
    grid: { left: 48, right: 16, top: spec.title ? 56 : 32, bottom: 40, containLabel: true },
    xAxis: {
      type: spec.type === "scatter" ? "value" : "category",
      data: spec.type === "scatter" ? undefined : spec.xLabels,
      axisLine: { lineStyle: { color: t.axis } },
      axisLabel: { color: t.muted, fontSize: 11 },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: t.split } },
      axisLabel: { color: t.muted, fontSize: 11 },
    },
    dataZoom: (spec.xLabels?.length ?? 0) > 20 ? [{ type: "inside" }, { type: "slider", height: 14, bottom: 8 }] : undefined,
    series,
  };
}

function ChartCanvas({ spec, height }: { spec: ChartSpec; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el);
    chartRef.current = chart;
    chart.setOption(buildOption(spec, CHART_THEMES[theme]));

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // Re-initialising on a theme flip is cheap next to tracking which of the
    // dozen colour options changed, and it keeps the option builder pure.
  }, [spec, theme]);

  return <div ref={ref} style={{ height }} className="w-full" />;
}

const TYPE_LABELS: Record<ChartSpec["type"], string> = {
  bar: "Bar",
  line: "Line",
  area: "Area",
  pie: "Pie",
  scatter: "Scatter",
};

export function ChartWidget({ spec, source }: { spec: ChartSpec; source?: string }) {
  const [viewingData, setViewingData] = useState(false);
  const canvasKey = `${spec.type}-${spec.title ?? ""}`;

  const exportPng = () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#chart-canvas-target canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `chart-${spec.type}.png`;
    a.click();
  };

  return (
    <WidgetShell
      id="chart-canvas-target"
      icon={<IconChart size={15} />}
      title={`Chart · ${TYPE_LABELS[spec.type]}`}
      status={source ? <StatusChip tone="info">{source}</StatusChip> : undefined}
      actions={
        <>
          <WidgetAction onClick={() => setViewingData((v) => !v)} label="View data">
            <IconTable size={14} />
          </WidgetAction>
          <WidgetAction onClick={exportPng} label="Export PNG">
            <IconDownload size={14} />
          </WidgetAction>
        </>
      }
    >
      {viewingData ? <DataTable table={chartToTable(spec)} /> : <ChartCanvas key={canvasKey} spec={spec} height={spec.type === "pie" ? 280 : 320} />}
    </WidgetShell>
  );
}
