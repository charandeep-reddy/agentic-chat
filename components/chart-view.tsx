"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent, DataZoomComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import type { ChartSpec } from "@/lib/tools/render-chart";

echarts.use([BarChart, LineChart, PieChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, DataZoomComponent, CanvasRenderer]);

const TEXT = "#d4d4d8";
const MUTED = "#71717a";
const PALETTE = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa", "#f87171", "#2dd4bf", "#fb923c"];

function buildOption(spec: ChartSpec): EChartsCoreOption {
  const base = {
    backgroundColor: "transparent",
    color: PALETTE,
    title: spec.title ? { text: spec.title, left: "center", top: 0, textStyle: { color: TEXT, fontSize: 14, fontWeight: 500 } } : undefined,
    tooltip: {
      trigger: spec.type === "pie" ? "item" : "axis",
      backgroundColor: "#18181b",
      borderColor: "#3f3f46",
      textStyle: { color: TEXT, fontSize: 12 },
    },
    legend: {
      top: spec.title ? 28 : 4,
      textStyle: { color: MUTED, fontSize: 11 },
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
          itemStyle: { borderRadius: 6, borderColor: "#09090b", borderWidth: 2 },
          label: { color: TEXT, fontSize: 11, formatter: "{b}: {c}" },
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
      axisLine: { lineStyle: { color: "#3f3f46" } },
      axisLabel: { color: MUTED, fontSize: 11 },
    },
    yAxis: {
      type: spec.type === "scatter" ? "value" : "value",
      splitLine: { lineStyle: { color: "#27272a" } },
      axisLabel: { color: MUTED, fontSize: 11 },
    },
    dataZoom: series.length > 1 && (spec.xLabels?.length ?? 0) > 20 ? [{ type: "inside" }, { type: "slider", height: 14, bottom: 8 }] : undefined,
    series,
  };
}

export function ChartView({ spec }: { spec: ChartSpec }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el);
    chart.setOption(buildOption(spec));

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [spec]);

  return <div ref={ref} className="h-[340px] w-full" />;
}
