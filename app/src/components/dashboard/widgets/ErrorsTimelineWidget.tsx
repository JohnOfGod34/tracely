"use client";

import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { DataPoint } from "@/types/dashboard";
import type { TimeRange } from "@/types/span";
import { buildLiveUrl } from "@/lib/liveLinks";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { DASHBOARD_CHART } from "@/lib/dashboardChartTheme";

interface ErrorsTimelineWidgetProps {
  data: DataPoint[];
  orgSlug?: string;
  projectSlug?: string;
  timeRange?: TimeRange;
  environment?: string | null;
  className?: string;
}

interface ChartPoint {
  time: string;
  errors: number;
  timestamp: string;
}

export function ErrorsTimelineWidget({
  data,
  orgSlug,
  projectSlug,
  timeRange,
  environment,
  className,
}: ErrorsTimelineWidgetProps) {
  const router = useRouter();
  const drillDown = !!(orgSlug && projectSlug && timeRange);

  const chartData: ChartPoint[] = data.map((point) => ({
    time: new Date(point.timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    errors: point.value,
    timestamp: point.timestamp,
  }));

  const totalErrors = data.reduce((sum, d) => sum + d.value, 0);

  const handleChartClick = (state: { activePayload?: Array<{ payload: ChartPoint }> }) => {
    if (!drillDown || !state?.activePayload?.[0]?.payload) return;
    const { timestamp, errors } = state.activePayload[0].payload;
    if (errors <= 0) return;

    const start = timestamp;
    const end = new Date(new Date(timestamp).getTime() + 60_000).toISOString();
    router.push(
      buildLiveUrl(orgSlug!, projectSlug!, {
        timeRange: { preset: "custom", start, end },
        environment,
        statusGroups: ["4xx", "5xx"],
      })
    );
  };

  return (
    <DashboardPanel
      title="Errors"
      testId="errors-timeline-widget"
      className={className}
      action={
        <span className="text-xs tabular-nums text-muted-foreground">
          {totalErrors} total
        </span>
      }
    >
      <div
        className={drillDown ? "h-[140px] cursor-pointer" : "h-[140px]"}
        aria-label={`Errors over time, ${totalErrors} total`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
            onClick={drillDown ? handleChartClick : undefined}
          >
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
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "12px",
              }}
              formatter={(value) => [`${value} errors`, "Errors"]}
            />
            <Area
              type="monotone"
              dataKey="errors"
              stroke="var(--dash-status-5xx)"
              strokeWidth={1.5}
              fill="var(--dash-status-5xx)"
              fillOpacity={0.15}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </DashboardPanel>
  );
}

export default ErrorsTimelineWidget;
