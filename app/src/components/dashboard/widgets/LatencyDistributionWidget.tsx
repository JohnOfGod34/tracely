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
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { DASHBOARD_CHART } from "@/lib/dashboardChartTheme";
import type { LatencyBucket } from "@/types/dashboard";

interface LatencyDistributionWidgetProps {
  data: LatencyBucket[];
  p50?: number;
  p95?: number;
  p99?: number;
  className?: string;
}

export function LatencyDistributionWidget({
  data,
  p50,
  p95,
  className,
}: LatencyDistributionWidgetProps) {
  const formatLatency = (ms: number) => {
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.round(ms)}ms`;
  };

  const summary =
    p50 !== undefined && p95 !== undefined
      ? `p50 ${formatLatency(p50)} · p95 ${formatLatency(p95)}`
      : undefined;

  return (
    <DashboardPanel
      title="Latency"
      testId="latency-distribution-widget"
      className={className}
      action={
        summary ? (
          <span className="text-xs tabular-nums text-muted-foreground">{summary}</span>
        ) : undefined
      }
    >
      <div className="h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={DASHBOARD_CHART.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: DASHBOARD_CHART.axis }}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-40}
              textAnchor="end"
              height={48}
            />
            <YAxis
              tick={{ fontSize: 10, fill: DASHBOARD_CHART.axis }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "12px",
              }}
              formatter={(value) => [`${Number(value).toLocaleString()}`, "Requests"]}
            />
            <Bar
              dataKey="count"
              fill={DASHBOARD_CHART.bar}
              radius={[2, 2, 0, 0]}
              maxBarSize={32}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DashboardPanel>
  );
}

export default LatencyDistributionWidget;
