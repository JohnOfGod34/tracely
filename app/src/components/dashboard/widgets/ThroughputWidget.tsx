"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { DataPoint } from "@/types/dashboard";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { DASHBOARD_CHART } from "@/lib/dashboardChartTheme";

interface ThroughputWidgetProps {
  data: DataPoint[];
  className?: string;
}

export function ThroughputWidget({ data, className }: ThroughputWidgetProps) {
  const chartData = data.map((point) => ({
    time: new Date(point.timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    value: point.value,
  }));

  const peakRate = data.length ? Math.max(...data.map((d) => d.value)) : 0;

  return (
    <DashboardPanel
      title="Throughput"
      testId="throughput-widget"
      className={className}
      action={
        <span className="text-sm font-semibold tabular-nums">
          {peakRate.toLocaleString()}
          <span className="ml-1 text-xs font-normal text-muted-foreground">peak/min</span>
        </span>
      }
    >
      <div className="h-[140px]" aria-label={`Throughput chart, peak ${peakRate} per minute`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={DASHBOARD_CHART.grid} vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: DASHBOARD_CHART.axis }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: DASHBOARD_CHART.axis }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "12px",
              }}
              formatter={(value) => [`${Number(value).toLocaleString()} req/min`, "Throughput"]}
            />
            <Bar
              dataKey="value"
              fill={DASHBOARD_CHART.bar}
              radius={[2, 2, 0, 0]}
              maxBarSize={20}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DashboardPanel>
  );
}

export default ThroughputWidget;
