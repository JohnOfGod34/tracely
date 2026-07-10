"use client";

import { memo, useId, useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

export type SparklineVariant = "neutral" | "positive" | "negative";

interface SparklineProps {
  data: number[];
  variant?: SparklineVariant;
  className?: string;
  height?: number;
}

const STROKE: Record<SparklineVariant, string> = {
  neutral: "var(--dash-sparkline-neutral)",
  positive: "var(--dash-sparkline-positive)",
  negative: "var(--dash-sparkline-negative)",
};

export const Sparkline = memo(function Sparkline({
  data,
  variant = "neutral",
  className,
  height = 40,
}: SparklineProps) {
  const gradientId = useId().replace(/:/g, "");

  const chartData = useMemo(
    () => data.map((value, index) => ({ index, value: Number.isFinite(value) ? value : 0 })),
    [data]
  );

  if (chartData.length === 0) {
    return (
      <div
        className={cn("rounded-sm bg-muted/30", className)}
        style={{ height }}
        aria-hidden
      />
    );
  }

  const stroke = STROKE[variant];

  return (
    <div className={cn("min-w-[72px]", className)} style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});
