"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { statusCodeChartColor } from "@/lib/dashboardChartTheme";

export interface StatusCodeData {
  code: string;
  count: number;
  color?: string;
}

interface StatusCodeWidgetProps {
  data: StatusCodeData[];
  className?: string;
}

const EMPTY_CODES = ["2xx", "3xx", "4xx", "5xx"];

export function StatusCodeWidget({ data, className }: StatusCodeWidgetProps) {
  const chartData =
    data.length > 0
      ? data.map((d) => ({ ...d, color: d.color ?? statusCodeChartColor(d.code) }))
      : EMPTY_CODES.map((code) => ({ code, count: 0, color: statusCodeChartColor(code) }));

  const total = chartData.reduce((sum, d) => sum + d.count, 0);

  return (
    <DashboardPanel
      title="Status codes"
      testId="status-code-widget"
      className={className}
      action={
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {total.toLocaleString()}
        </span>
      }
    >
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={1}
              dataKey="count"
              nameKey="code"
              stroke="var(--background)"
              strokeWidth={2}
            >
              {chartData.map((entry) => (
                <Cell key={entry.code} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "12px",
              }}
              formatter={(value, name) => [
                `${Number(value).toLocaleString()} (${total > 0 ? ((Number(value) / total) * 100).toFixed(1) : 0}%)`,
                name,
              ]}
            />
            <Legend
              verticalAlign="bottom"
              height={32}
              formatter={(value) => (
                <span className="text-xs text-muted-foreground">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </DashboardPanel>
  );
}

export default StatusCodeWidget;
