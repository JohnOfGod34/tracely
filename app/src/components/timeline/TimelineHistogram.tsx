"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { formatBucketTimestamp, type TimeBucket } from "@/lib/timelineUtils";
import { cn } from "@/lib/utils";

/** Format Y-axis values: 1000 -> "1k", 2500 -> "2.5k" */
function formatYAxis(value: number): string {
  if (value >= 1000) {
    const k = value / 1000;
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return String(value);
}

interface TimelineHistogramProps {
  buckets: TimeBucket[];
  granularity: number;
  rangeStart: number;
  rangeEnd: number;
  isLive: boolean;
  /** Click-drag on the chart to set a custom range (desktop/mouse only). */
  onRangeSelect?: (start: number, end: number) => void;
}

/** Recharts passes activeLabel as the nearest data point's x value (a number here, but loosely typed). */
interface ChartMouseState {
  activeLabel?: number | string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  label?: number;
  granularity: number;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload) return null;

  const success = payload.find((p) => p.name === "successCount")?.value ?? 0;
  const errors = payload.find((p) => p.name === "errorCount")?.value ?? 0;

  return (
    <div className="rounded border border-border bg-popover px-2 py-1 text-xs shadow-md">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="text-foreground">{success}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          <span className="text-foreground">{errors}</span>
        </span>
      </div>
    </div>
  );
}

export function TimelineHistogram({
  buckets,
  granularity,
  rangeStart,
  rangeEnd,
  isLive,
  onRangeSelect,
}: TimelineHistogramProps) {
  // Click-drag range selection state (in-progress drag only; committed on mouse up)
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);

  function handleMouseDown(state: ChartMouseState) {
    if (!onRangeSelect || state.activeLabel === undefined) return;
    setDragStart(Number(state.activeLabel));
    setDragEnd(Number(state.activeLabel));
  }

  function handleMouseMove(state: ChartMouseState) {
    if (dragStart === null || state.activeLabel === undefined) return;
    setDragEnd(Number(state.activeLabel));
  }

  function commitDrag() {
    if (dragStart !== null && dragEnd !== null && onRangeSelect) {
      const start = Math.min(dragStart, dragEnd);
      const end = Math.max(dragStart, dragEnd);
      // Ignore near-zero drags (a click, not a drag) — require at least one bucket's width
      if (end - start >= granularity) {
        onRangeSelect(start, end);
      }
    }
    setDragStart(null);
    setDragEnd(null);
  }

  // Format ticks for X-axis (show ~5-7 ticks)
  const xAxisTicks = useMemo(() => {
    if (buckets.length === 0) return [];
    const step = Math.max(1, Math.floor(buckets.length / 6));
    const ticks: number[] = [];
    for (let i = 0; i < buckets.length; i += step) {
      ticks.push(buckets[i].timestamp);
    }
    // Always include last tick
    if (ticks[ticks.length - 1] !== buckets[buckets.length - 1].timestamp) {
      ticks.push(buckets[buckets.length - 1].timestamp);
    }
    return ticks;
  }, [buckets]);

  if (buckets.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No data in selected time range
      </div>
    );
  }

  return (
    <div
      className={cn(
        "h-full w-full [&_.recharts-wrapper]:!outline-none [&_.recharts-surface]:!outline-none",
        onRangeSelect && "[&_.recharts-surface]:cursor-crosshair"
      )}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
        data={buckets}
        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
        barGap={0}
        barCategoryGap={1}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={commitDrag}
        onMouseLeave={() => { setDragStart(null); setDragEnd(null); }}
      >
        <XAxis
          dataKey="timestamp"
          type="number"
          domain={[rangeStart, rangeEnd]}
          ticks={xAxisTicks}
          tickFormatter={(ts) => formatBucketTimestamp(ts, granularity)}
          tick={{ fontSize: 10, fill: "#a1a1aa" }}
          axisLine={{ stroke: "#3f3f46" }}
          tickLine={{ stroke: "#3f3f46" }}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, "auto"]}
          tickFormatter={formatYAxis}
          tick={{ fontSize: 10, fill: "#a1a1aa" }}
          axisLine={{ stroke: "#3f3f46" }}
          tickLine={{ stroke: "#3f3f46" }}
          width={30}
          allowDecimals={false}
        />
        <Tooltip
          content={<CustomTooltip granularity={granularity} />}
          cursor={false}
        />
        <Bar
          dataKey="successCount"
          stackId="requests"
          fill="#10b981"
          radius={[0, 0, 0, 0]}
          isAnimationActive={false}
        />
        <Bar
          dataKey="errorCount"
          stackId="requests"
          fill="#ef4444"
          radius={[2, 2, 0, 0]}
          isAnimationActive={false}
        />
        {isLive && (
          <ReferenceLine
            x={rangeEnd}
            stroke="#22c55e"
            strokeWidth={2}
            strokeDasharray="4 2"
          />
        )}
        {dragStart !== null && dragEnd !== null && dragStart !== dragEnd && (
          <ReferenceArea
            x1={Math.min(dragStart, dragEnd)}
            x2={Math.max(dragStart, dragEnd)}
            fill="#6366f1"
            fillOpacity={0.15}
            stroke="#6366f1"
            strokeOpacity={0.4}
          />
        )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
