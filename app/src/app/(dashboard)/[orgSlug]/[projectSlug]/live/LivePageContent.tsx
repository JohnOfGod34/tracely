"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, ArrowDown, Check, Copy, Terminal, Code, BookOpen, RefreshCw, Clock, Search, ChevronDown, AlertTriangle, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DataEnvelope } from "@/types/api";
import type { SpanEvent, StreamFilters, TimeRangePreset } from "@/types/span";
import { useEventStream } from "@/hooks/useEventStream";
import { useSpanDetail } from "@/hooks/useSpanDetail";
import { useLiveStreamStore } from "@/stores/liveStreamStore";
import { useFilterStore } from "@/stores/filterStore";
import { matchesFilters } from "@/lib/filterUtils";
import { StreamRow } from "@/components/pulse/StreamRow";
import { ChildSpanRow } from "@/components/pulse/ChildSpanRow";
import { SpanInspector } from "@/components/pulse/SpanInspector";
import { TimelineBar } from "@/components/timeline";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { DateRangePicker } from "@/components/shared/DateRangePicker";

type DisplayItem =
  | { type: "root"; span: SpanEvent; childCount: number; hasErrorChildren: boolean; isExpanded: boolean }
  | { type: "child"; span: SpanEvent; depth: number; childCount: number; isLast: boolean };

interface ProjectInfo {
  id: string;
  name: string;
  slug: string;
  org_id: string;
  created_at: string;
}

interface ApiKeyItem {
  id: string;
  prefix: string;
  name: string | null;
  last_used_at: string | null;
  created_at: string;
}

interface ApiKeyCreatedResponse {
  id: string;
  key: string;
  prefix: string;
  name: string | null;
  created_at: string;
}

const ROW_HEIGHT = 40;

// Pre-computed widths for skeleton rows (pure — no Math.random during render)
const SKELETON_WIDTHS = [55, 42, 68, 47, 60, 50, 63, 45, 57, 52, 65, 48];

// --- Skeleton Loading (AC4, UX7) ---

function PulseSkeleton() {
  return (
    <div className="flex flex-col gap-0">
      {SKELETON_WIDTHS.map((w, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-border/50 px-4 py-2"
        >
          <div className="h-5 w-14 animate-pulse rounded bg-muted" />
          <div
            className="h-4 animate-pulse rounded bg-muted"
            style={{ width: `${w}%` }}
          />
          <div className="ml-auto h-4 w-10 animate-pulse rounded bg-muted" />
          <div className="h-4 w-14 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

// --- Helpers for Empty State ---

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  return (
    <div className="rounded-lg border bg-muted/50">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs text-muted-foreground font-mono">
          {language || "shell"}
        </span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-3">
        <code className="text-sm font-mono">{code}</code>
      </pre>
    </div>
  );
}

// --- Empty State (AC4, UX6) ---

function EmptyState({ orgSlug, projectSlug }: { orgSlug: string; projectSlug: string }) {
  const [fullKey, setFullKey] = useState<string | null>(null);
  const [keyPrefix, setKeyPrefix] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const initRef = useRef(false);

  const basePath = `/api/orgs/${orgSlug}/projects/${projectSlug}/api-keys`;

  // Generate a new key and display the full value
  const generateKey = useCallback(async () => {
    setRegenerating(true);
    try {
      const created = await apiFetch<DataEnvelope<ApiKeyCreatedResponse>>(
        basePath,
        { method: "POST", body: JSON.stringify({ name: "Default" }) }
      );
      setFullKey(created.data.key);
      setKeyPrefix(created.data.prefix);
    } catch {
      // Non-blocking
    } finally {
      setRegenerating(false);
    }
  }, [basePath]);

  // On mount: check for existing keys and show the prefix — never create one
  // without the user explicitly asking (AC4)
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    async function init() {
      try {
        const res = await apiFetch<DataEnvelope<ApiKeyItem[]>>(basePath);
        if (res.data.length > 0) {
          setKeyPrefix(res.data[0].prefix);
        }
      } catch {
        // Non-blocking
      }
    }
    init();
  }, [basePath]);

  const hasFullKey = fullKey !== null;
  const hasAnyKey = hasFullKey || keyPrefix !== null;
  const displayKey = fullKey ?? (keyPrefix ? `${keyPrefix}...` : "your_api_key_here");
  const installSnippet = `pip install tracely-sdk
export TRACELY_API_KEY="${displayKey}"`;

  const configSnippet = `import tracely

tracely.init()  # reads TRACELY_API_KEY from env`;

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-5">
        <div className="text-center">
          <h3 className="text-lg font-medium">Get started</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Install the SDK and send your first event to see it here in real time.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Terminal className="size-4 text-muted-foreground" />
              1. Install &amp; configure
            </div>
            {!hasFullKey && keyPrefix && (
              <button
                onClick={generateKey}
                disabled={regenerating}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                <RefreshCw className={`size-3 ${regenerating ? "animate-spin" : ""}`} />
                {regenerating ? "Generating..." : "Regenerate key"}
              </button>
            )}
          </div>
          {hasAnyKey ? (
            <CodeBlock code={installSnippet} language="shell" />
          ) : (
            <div className="flex justify-center rounded-lg border bg-muted/50 p-4">
              <button
                onClick={generateKey}
                disabled={regenerating}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <RefreshCw className={cn("size-3.5", regenerating && "animate-spin")} />
                {regenerating ? "Generating..." : "Generate API key"}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Code className="size-4 text-muted-foreground" />
            2. Add to your app
          </div>
          <CodeBlock code={configSnippet} language="python" />
        </div>

        <div className="text-center">
          <a
            href="https://tracely.sh/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <BookOpen className="size-4" />
            Full setup guide
          </a>
        </div>
      </div>
    </div>
  );
}

// --- Time Presets ---

const TIME_PRESETS: { key: TimeRangePreset; label: string }[] = [
  { key: "5m", label: "5 min" },
  { key: "15m", label: "15 min" },
  { key: "1h", label: "1 hour" },
  { key: "6h", label: "6 hours" },
  { key: "24h", label: "24 hours" },
  { key: "custom", label: "Custom" },
];

// --- Health Metrics Helpers ---

// Time window for real-time metrics calculation (30 seconds)
const REALTIME_WINDOW_MS = 30_000;

function formatMetricValue(value: number, decimals = 1): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (value >= 100) return Math.round(value).toString();
  return value.toFixed(decimals);
}

function errorRateColorClass(rate: number): string {
  if (rate >= 5) return "text-red-500";
  if (rate >= 1) return "text-amber-500";
  return "text-emerald-500";
}

function p95ColorClass(ms: number): string {
  if (ms >= 2000) return "text-red-500";
  if (ms >= 500) return "text-amber-500";
  return "text-emerald-500";
}

function formatP95(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

// --- Live Header (40px, AC1 UX12, Story 11.2, Story 4.1 Health) ---

function LiveHeader({
  status,
  spanCount,
  isHistorical,
  onTimePreset,
  onCustomRangeChange,
}: {
  status: "connecting" | "connected" | "disconnected";
  spanCount: number;
  isHistorical?: boolean;
  onTimePreset: (preset: TimeRangePreset) => void;
  onCustomRangeChange: (start: string, end: string) => void;
}) {
  const filters = useFilterStore((s) => s.filters);
  const setEndpointSearch = useFilterStore((s) => s.setEndpointSearch);
  const toggleStatusGroup = useFilterStore((s) => s.toggleStatusGroup);
  const [searchExpanded, setSearchExpanded] = useState(false);

  // Custom range with only one bound picked — historical mode won't activate yet (AC5)
  const isCustomRangeIncomplete =
    filters.timeRange.preset === "custom" &&
    !!filters.timeRange.start !== !!filters.timeRange.end;

  // Real-time metrics from live span stream (instant reactivity)
  const spans = useLiveStreamStore((s) => s.spans);
  const childrenMap = useLiveStreamStore((s) => s.childrenMap);

  // State-based current time for pure useMemo computation
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  // Compute real-time metrics from recent spans
  const aggregatedMetrics = useMemo(() => {
    const cutoff = currentTime - REALTIME_WINDOW_MS;

    // Collect all completed spans from the time window
    const allSpans = [
      ...spans,
      ...Object.values(childrenMap).flat(),
    ].filter((s) => {
      if (s.span_type === "pending_span") return false;
      const spanTime = new Date(s.start_time).getTime();
      return spanTime >= cutoff;
    });

    // Need at least a few spans to show metrics
    if (allSpans.length < 1) return null;

    // Calculate request rate (spans per minute based on window)
    const windowMinutes = REALTIME_WINDOW_MS / 60_000;
    const totalRequestRate = allSpans.length / windowMinutes;

    // Calculate error rate
    const errorCount = allSpans.filter((s) => s.http_status_code >= 400).length;
    const avgErrorRate = (errorCount / allSpans.length) * 100;

    // Calculate p95 latency
    const durations = allSpans
      .map((s) => s.duration_ms)
      .filter((d) => d > 0)
      .sort((a, b) => a - b);

    let maxP95 = 0;
    if (durations.length > 0) {
      const p95Index = Math.floor(durations.length * 0.95);
      maxP95 = durations[Math.min(p95Index, durations.length - 1)];
    }

    return { totalRequestRate, avgErrorRate, maxP95 };
  }, [spans, childrenMap, currentTime]);

  // Metrics are always ready when we have spans (no loading state needed)
  const healthLoading = false;

  return (
    <div className="sticky top-0 z-10 flex h-10 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur-sm">
      {/* Search input (AC1) */}
      <div className="hidden md:block">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search endpoint path..."
            value={filters.endpointSearch}
            onChange={(e) => setEndpointSearch(e.target.value)}
            className="h-7 min-w-[250px] max-w-[400px] rounded-md border bg-background pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            data-testid="header-search"
          />
          {filters.endpointSearch !== "" && (
            <button
              onClick={() => setEndpointSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      {/* Mobile: search icon button */}
      <button
        className="flex md:hidden shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent"
        onClick={() => setSearchExpanded(!searchExpanded)}
        data-testid="header-search-mobile"
      >
        <Search className="size-3.5" />
      </button>

      {/* Mobile expanded search overlay */}
      {searchExpanded && (
        <div className="absolute left-0 top-10 z-20 flex w-full items-center gap-2 border-b bg-background px-4 py-2 md:hidden">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search endpoint path..."
              value={filters.endpointSearch}
              onChange={(e) => setEndpointSearch(e.target.value)}
              autoFocus
              className="h-7 w-full rounded-md border bg-background px-3 pr-7 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />
            {filters.endpointSearch !== "" && (
              <button
                onClick={() => setEndpointSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => setSearchExpanded(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Time preset select (moved to left side) */}
      <div className="relative" data-testid="header-time-range">
        <select
          value={filters.timeRange.preset}
          onChange={(e) => onTimePreset(e.target.value as TimeRangePreset)}
          className="h-7 appearance-none rounded-md border bg-background pl-2 pr-6 text-xs transition-colors hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {TIME_PRESETS.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
      </div>

      {/* Custom time range picker */}
      {filters.timeRange.preset === "custom" && (
        <div data-testid="header-custom-range">
          <DateRangePicker
            start={filters.timeRange.start}
            end={filters.timeRange.end}
            onApply={onCustomRangeChange}
          />
          {isCustomRangeIncomplete && (
            <div
              className="absolute left-0 top-10 z-20 w-full border-b bg-amber-500/10 px-4 py-1 text-xs text-amber-700"
              data-testid="header-custom-range-hint"
            >
              Pick a start and end date to view historical data.
            </div>
          )}
        </div>
      )}

      {/* Status code filters — 4xx and 5xx toggle independently (AC1) */}
      <div className="flex items-center gap-1">
        <AlertTriangle className="size-3.5 text-muted-foreground" />
        <button
          type="button"
          onClick={() => toggleStatusGroup("4xx")}
          className={cn(
            "inline-flex h-7 items-center rounded-md border px-2 text-xs transition-colors",
            filters.statusGroups.includes("4xx")
              ? "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/15"
              : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
          data-testid="header-4xx-only"
          title="Show only 4xx client errors"
        >
          4xx
        </button>
        <button
          type="button"
          onClick={() => toggleStatusGroup("5xx")}
          className={cn(
            "inline-flex h-7 items-center rounded-md border px-2 text-xs transition-colors",
            filters.statusGroups.includes("5xx")
              ? "border-red-500/40 bg-red-500/10 text-red-500 hover:bg-red-500/15"
              : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
          data-testid="header-5xx-only"
          title="Show only 5xx server errors"
        >
          5xx
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Metrics row (Story 4.1) — full row on wide screens */}
      {aggregatedMetrics && !healthLoading && (
        <div className="hidden lg:flex items-center gap-3 text-xs" data-testid="header-metrics">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">req/min</span>
            <span className="font-medium tabular-nums">{formatMetricValue(aggregatedMetrics.totalRequestRate)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">error</span>
            <span className={cn("font-medium tabular-nums", errorRateColorClass(aggregatedMetrics.avgErrorRate))}>
              {aggregatedMetrics.avgErrorRate.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">p95</span>
            <span className={cn("font-medium tabular-nums", p95ColorClass(aggregatedMetrics.maxP95))}>
              {formatP95(aggregatedMetrics.maxP95)}
            </span>
          </div>
        </div>
      )}

      {/* Compact metrics fallback — error rate + p95 only, below lg (UX10) */}
      {aggregatedMetrics && !healthLoading && (
        <div className="flex lg:hidden items-center gap-1 text-xs" data-testid="header-metrics-compact">
          <span className={cn("font-medium tabular-nums", errorRateColorClass(aggregatedMetrics.avgErrorRate))}>
            {aggregatedMetrics.avgErrorRate.toFixed(1)}%
          </span>
          <span className="text-muted-foreground">·</span>
          <span className={cn("font-medium tabular-nums", p95ColorClass(aggregatedMetrics.maxP95))}>
            {formatP95(aggregatedMetrics.maxP95)}
          </span>
        </div>
      )}

      <div className="mx-1 h-4 w-px bg-border" />

      {/* Connection status */}
      <div className="flex items-center gap-1.5">
        {isHistorical ? (
          <>
            <Clock className="size-3.5 text-violet-500" />
            <span className="text-xs text-violet-600">Historical</span>
          </>
        ) : status === "connected" ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <Wifi className="size-3.5 text-emerald-500" />
            <span className="text-xs text-emerald-600">Live</span>
          </>
        ) : status === "connecting" ? (
          <>
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            <Wifi className="size-3.5 text-amber-500" />
            <span className="text-xs text-amber-600">Connecting...</span>
          </>
        ) : (
          <>
            <span className="h-2 w-2 rounded-full bg-red-400" />
            <WifiOff className="size-3.5 text-red-500" />
            <span className="text-xs text-red-600">Disconnected</span>
          </>
        )}
      </div>

      {/* Request count */}
      <span className="text-xs text-muted-foreground tabular-nums" data-testid="header-span-count">
        {spanCount > 0 && `${spanCount.toLocaleString()} requests`}
      </span>
    </div>
  );
}

// --- Main Pulse View Page ---

export default function LivePageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col" style={{ height: "calc(100vh - 48px)" }}>
          <div className="sticky top-0 z-10 flex h-10 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur-sm">
            <div className="flex-1" />
            <span className="text-xs text-muted-foreground">Loading...</span>
          </div>
          <PulseSkeleton />
        </div>
      }
    >
      <LivePageInner />
    </Suspense>
  );
}

function LivePageInner() {
  const params = useParams<{ orgSlug: string; projectSlug: string }>();
  const { orgSlug, projectSlug } = params;

  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const spans = useLiveStreamStore((s) => s.spans);
  const childrenMap = useLiveStreamStore((s) => s.childrenMap);
  const expandedSpanIds = useLiveStreamStore((s) => s.expandedSpanIds);
  const isAtBottom = useLiveStreamStore((s) => s.isAtBottom);
  const isLoadingHistory = useLiveStreamStore((s) => s.isLoadingHistory);
  const hasMoreHistory = useLiveStreamStore((s) => s.hasMoreHistory);
  const addSpan = useLiveStreamStore((s) => s.addSpan);
  const prependSpans = useLiveStreamStore((s) => s.prependSpans);
  const toggleExpanded = useLiveStreamStore((s) => s.toggleExpanded);
  const setIsAtBottom = useLiveStreamStore((s) => s.setIsAtBottom);
  const setLoadingHistory = useLiveStreamStore((s) => s.setLoadingHistory);
  const setHasMoreHistory = useLiveStreamStore((s) => s.setHasMoreHistory);
  const reset = useLiveStreamStore((s) => s.reset);

  // --- Filter state (Story 3.5, 11.2) ---
  const filters = useFilterStore((s) => s.filters);
  const setTimeRange = useFilterStore((s) => s.setTimeRange);

  // Extract unique environments from span buffer (Task 5) and sync to store
  const setAvailableEnvironments = useFilterStore((s) => s.setAvailableEnvironments);
  const environments = useMemo(() => {
    const envs = [...new Set(spans.map((s) => s.environment).filter(Boolean))].sort();
    return envs.length > 0 ? envs : ["unknown"];
  }, [spans]);

  useEffect(() => {
    setAvailableEnvironments(environments);
  }, [environments, setAvailableEnvironments]);

  // Timeframe handling (migrated from FilterBar)
  const handleTimePreset = useCallback(
    (preset: TimeRangePreset) => {
      if (preset === "custom") {
        setTimeRange({ preset: "custom" });
      } else {
        setTimeRange({ preset });
      }
    },
    [setTimeRange]
  );

  const handleCustomRangeChange = useCallback(
    (start: string, end: string) => {
      setTimeRange({ preset: "custom", start, end });
    },
    [setTimeRange]
  );

  // Filter root spans only (children inherit parent visibility)
  const filteredRootSpans = useMemo(
    () => spans.filter((s) => matchesFilters(s, filters)),
    [spans, filters]
  );

  // Build flat display list: root spans + expanded children
  const expandedSet = useMemo(() => new Set(expandedSpanIds), [expandedSpanIds]);

  const displayList: DisplayItem[] = useMemo(() => {
    const items: DisplayItem[] = [];
    for (const root of filteredRootSpans) {
      const children = childrenMap[root.span_id] ?? [];
      // Total count = the request itself + its children
      const totalCount = 1 + children.length;
      const hasErrorChildren = children.some((c) => c.http_status_code >= 400);
      const isExpanded = expandedSet.has(root.span_id);

      items.push({ type: "root", span: root, childCount: totalCount, hasErrorChildren, isExpanded });

      if (isExpanded) {
        // First child row = the parent request itself
        const allRows = [root, ...children];
        for (let i = 0; i < allRows.length; i++) {
          const span = allRows[i];
          const subChildren = childrenMap[span.span_id] ?? [];
          items.push({ type: "child", span, depth: 1, childCount: subChildren.length, isLast: i === allRows.length - 1 });
        }
      }
    }
    return items;
  }, [filteredRootSpans, childrenMap, expandedSet]);

  // Backward-compatible alias used by existing code (auto-scroll, counts, empty state)
  const filteredSpans = filteredRootSpans;

  // Historical mode: custom time range with both start and end set (AC5)
  const isHistoricalMode =
    filters.timeRange.preset === "custom" &&
    !!filters.timeRange.start &&
    !!filters.timeRange.end;

  // --- Filter URL sync (UX16) ---
  const searchParams = useSearchParams();
  const filterReset = useFilterStore((s) => s.reset);

  // Hydrate filter store from URL params on mount
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const time = searchParams.get("time");
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const env = searchParams.get("env");
    const status = searchParams.get("status");
    const errors = searchParams.get("errors"); // legacy param, kept for old shared links

    const store = useFilterStore.getState();
    if (time) {
      const validPresets = new Set(["5m", "15m", "1h", "6h", "24h", "custom"]);
      if (validPresets.has(time)) {
        store.setTimeRange({
          preset: time as TimeRangePreset,
          start: start ?? undefined,
          end: end ?? undefined,
        });
      }
    }
    if (env) store.setEnvironment(env);
    if (status) {
      const validGroups = new Set(["2xx", "3xx", "4xx", "5xx"]);
      const groups = status.split(",").filter((g) => validGroups.has(g));
      if (groups.length > 0) {
        useFilterStore.setState((state) => ({
          filters: { ...state.filters, statusGroups: groups as StreamFilters["statusGroups"] },
        }));
      }
    } else if (errors === "1") {
      useFilterStore.setState((state) => ({
        filters: { ...state.filters, statusGroups: ["4xx", "5xx"] },
      }));
    }
  }, [searchParams]);

  // Sync filters to URL search params
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.timeRange.preset !== "5m") params.set("time", filters.timeRange.preset);
    if (filters.timeRange.start) params.set("start", filters.timeRange.start);
    if (filters.timeRange.end) params.set("end", filters.timeRange.end);
    if (filters.environment) params.set("env", filters.environment);
    if (filters.statusGroups.length > 0) params.set("status", filters.statusGroups.join(","));

    const search = params.toString();
    const newUrl = `${window.location.pathname}${search ? `?${search}` : ""}`;
    window.history.replaceState(null, "", newUrl);
  }, [filters]);

  // Reset filters on org/project switch (UX16, AC4)
  const contextKeyRef = useRef(`${orgSlug}/${projectSlug}`);
  useEffect(() => {
    const key = `${orgSlug}/${projectSlug}`;
    if (contextKeyRef.current !== key) {
      contextKeyRef.current = key;
      filterReset();
    }
  }, [orgSlug, projectSlug, filterReset]);

  // --- Selection & Inspector state (Story 3.3 + 3.6) ---
  // highlightedKey: keyboard/click highlight (J/K navigation, AC2), keyed by `${type}-${span_id}`
  // because an expanded root's span_id is duplicated as its own first "child" row —
  // a plain span_id key can't tell those two rows apart and navigation would stall on them.
  // inspectorSpanId: which span has its inspector open (Enter to open, Escape to close)
  const itemKey = useCallback((item: DisplayItem) => `${item.type}-${item.span.span_id}`, []);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const [inspectorSpanId, setInspectorSpanId] = useState<string | null>(null);
  const inspectorOpen = inspectorSpanId !== null;
  const { detail: spanDetail, loading: detailLoading, error: detailError } =
    useSpanDetail(orgSlug, projectSlug, inspectorSpanId);

  // The "active" row for highlighting is either the keyboard/click highlight or,
  // if none is set yet, whichever row matches the open inspector's span.
  const activeKey = useMemo(() => {
    if (highlightedKey) return highlightedKey;
    if (!inspectorSpanId) return null;
    const match = displayList.find((item) => item.span.span_id === inspectorSpanId);
    return match ? itemKey(match) : null;
  }, [highlightedKey, inspectorSpanId, displayList, itemKey]);

  // --- Resizable inspector panel ---
  const [inspectorWidth, setInspectorWidth] = useState(40); // default 40%
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDraggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = ((rect.width - x) / rect.width) * 100;
      setInspectorWidth(Math.min(Math.max(pct, 20), 80));
    }
    function onMouseUp() {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  function startResize() {
    isDraggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  // Ref for returning focus to the stream list (AC4, UX3)
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Click handler: highlight + open inspector (preserves existing behavior)
  const handleRowClick = useCallback((item: DisplayItem) => {
    setHighlightedKey(itemKey(item));
    setInspectorSpanId(item.span.span_id);
  }, [itemKey]);

  // --- Keyboard Navigation (Story 3.6, AC2/AC3/AC4, UX3) ---
  // Walks the full displayList (root rows + expanded children) so j/k can
  // reach child spans once a trace is expanded, not just root rows.

  // Compute selected index from the highlighted row for keyboard navigation
  const selectedDisplayIndex = useMemo(() => {
    if (!highlightedKey) return -1;
    return displayList.findIndex((item) => itemKey(item) === highlightedKey);
  }, [highlightedKey, displayList, itemKey]);

  // J / ArrowDown — move selection down (AC2)
  const moveDown = useCallback(() => {
    if (displayList.length === 0) return;
    const nextIndex = selectedDisplayIndex === -1 ? 0 : Math.min(selectedDisplayIndex + 1, displayList.length - 1);
    setHighlightedKey(itemKey(displayList[nextIndex]));
  }, [displayList, selectedDisplayIndex, itemKey]);

  // K / ArrowUp — move selection up (AC2)
  const moveUp = useCallback(() => {
    if (displayList.length === 0) return;
    const nextIndex = selectedDisplayIndex === -1 ? displayList.length - 1 : Math.max(selectedDisplayIndex - 1, 0);
    setHighlightedKey(itemKey(displayList[nextIndex]));
  }, [displayList, selectedDisplayIndex, itemKey]);

  useKeyboardShortcut("j", moveDown);
  useKeyboardShortcut("ArrowDown", moveDown);
  useKeyboardShortcut("k", moveUp);
  useKeyboardShortcut("ArrowUp", moveUp);

  // Enter — open inspector for highlighted span (AC3)
  useKeyboardShortcut("Enter", useCallback(() => {
    if (selectedDisplayIndex >= 0) {
      setInspectorSpanId(displayList[selectedDisplayIndex].span.span_id);
    }
  }, [selectedDisplayIndex, displayList]));

  // Escape — close inspector and return focus to list (AC4, UX3)
  useKeyboardShortcut("Escape", useCallback(() => {
    if (inspectorOpen) {
      setInspectorSpanId(null);
      listContainerRef.current?.focus();
    }
  }, [inspectorOpen]), { allowInInputs: true });

  // Fetch project UUID for SSE endpoint
  useEffect(() => {
    let cancelled = false;
    async function loadProject() {
      try {
        const res = await apiFetch<DataEnvelope<ProjectInfo>>(
          `/api/orgs/${orgSlug}/projects/${projectSlug}`
        );
        if (!cancelled) setProjectId(res.data.id);
      } catch {
        // Non-blocking — SSE won't connect without project ID
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProject();
    return () => {
      cancelled = true;
    };
  }, [orgSlug, projectSlug]);

  // Reset store on unmount
  useEffect(() => {
    return () => reset();
  }, [reset]);

  // Load recent spans on initial page load so the list isn't empty
  useEffect(() => {
    if (!projectId || initialLoadDone || isHistoricalMode) return;

    let cancelled = false;
    async function loadInitial() {
      try {
        const url = `/api/orgs/${orgSlug}/projects/${projectSlug}/spans?limit=50`;
        const res = await apiFetch<DataEnvelope<SpanEvent[]>>(url);
        if (cancelled) return;
        const fetched = res.data;

        if (fetched.length > 0) {
          const chronological = [...fetched].reverse();
          prependSpans(chronological);

          const meta = res.meta as { has_more?: boolean };
          if (!meta.has_more) {
            setHasMoreHistory(false);
          }
        } else {
          setHasMoreHistory(false);
        }
      } catch {
        // Non-blocking
      } finally {
        if (!cancelled) setInitialLoadDone(true);
      }
    }

    loadInitial();
    return () => { cancelled = true; };
  }, [projectId, initialLoadDone, isHistoricalMode, orgSlug, projectSlug, prependSpans, setHasMoreHistory]);

  // Live stream announcement for screen readers (AC6, UX11)
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  // SSE: push spans into Zustand store
  const handleSpan = useCallback(
    (data: Record<string, unknown>) => {
      const span = data as unknown as SpanEvent;
      addSpan(span);
      // Announce new span for screen readers
      if (span.span_type !== "pending_span") {
        setLiveAnnouncement(
          `New request: ${span.http_method} ${span.http_route || span.span_name}, status ${span.http_status_code}`
        );
      }
    },
    [addSpan]
  );

  const { status } = useEventStream({
    projectId: projectId ?? "",
    enabled: projectId !== null && !isHistoricalMode,
    onSpan: handleSpan,
  });

  // --- History loading (AC1) ---
  const fetchingRef = useRef(false);
  const scrollAdjustRef = useRef(0);
  // Set right before a history prepend, cleared after the next auto-scroll
  // check — prevents a history load (triggered by scrolling up) from ever
  // being mistaken for new live data and snapping the view back to the bottom.
  const isHistoryPrependRef = useRef(false);

  /** Build filter query params for server-side filtering in historical mode. */
  const buildFilterParams = useCallback(() => {
    const params: string[] = [];
    if (filters.environment) params.push(`environment=${encodeURIComponent(filters.environment)}`);
    if (filters.statusGroups.length > 0) {
      params.push(`status_groups=${encodeURIComponent(filters.statusGroups.join(","))}`);
    }
    return params.length > 0 ? `&${params.join("&")}` : "";
  }, [filters.environment, filters.statusGroups]);

  const loadHistory = useCallback(async () => {
    if (fetchingRef.current || !projectId || !hasMoreHistory) return;
    fetchingRef.current = true;
    setLoadingHistory(true);

    const currentSpans = useLiveStreamStore.getState().spans;
    const oldest = currentSpans.length > 0 ? currentSpans[0].start_time : undefined;

    try {
      let url =
        `/api/orgs/${orgSlug}/projects/${projectSlug}/spans?limit=50` +
        (oldest ? `&before=${encodeURIComponent(oldest)}` : "");

      // In historical mode, bound the query to the custom range and apply server-side filters
      if (isHistoricalMode) {
        if (filters.timeRange.start) url += `&after=${encodeURIComponent(filters.timeRange.start)}`;
        url += buildFilterParams();
      }

      const res = await apiFetch<DataEnvelope<SpanEvent[]>>(url);
      const fetched = res.data;

      if (fetched.length === 0) {
        setHasMoreHistory(false);
      } else {
        // API returns newest-first; reverse for chronological prepend
        const chronological = [...fetched].reverse();
        // Only root spans affect scroll position (children are collapsed by default)
        const rootCount = chronological.filter((s) => !s.parent_span_id || s.parent_span_id === "").length;
        scrollAdjustRef.current = rootCount * ROW_HEIGHT;
        isHistoryPrependRef.current = true;
        prependSpans(chronological);

        const meta = res.meta as { has_more?: boolean };
        if (!meta.has_more) {
          setHasMoreHistory(false);
        }
      }
    } catch {
      // Non-blocking — user can retry by scrolling up again
    } finally {
      setLoadingHistory(false);
      fetchingRef.current = false;
    }
  }, [projectId, hasMoreHistory, orgSlug, projectSlug, prependSpans, setLoadingHistory, setHasMoreHistory, isHistoricalMode, filters.timeRange.start, buildFilterParams]);

  // --- Historical mode: initial fetch on entry (AC5) ---
  const prevHistoricalRef = useRef(false);
  const prevRangeRef = useRef<string | null>(null);
  useEffect(() => {
    const rangeKey = isHistoricalMode
      ? `${filters.timeRange.start ?? ""}|${filters.timeRange.end ?? ""}`
      : null;
    const enteringHistorical = isHistoricalMode && !prevHistoricalRef.current;
    const rangeChanged =
      isHistoricalMode && prevHistoricalRef.current && rangeKey !== prevRangeRef.current;

    if (isHistoricalMode && (enteringHistorical || rangeChanged) && projectId) {
      // Entering historical mode, or the custom range changed — reset store and fetch first page
      reset();
      setHasMoreHistory(true);

      async function fetchInitialPage() {
        fetchingRef.current = true;
        setLoadingHistory(true);

        try {
          const url =
            `/api/orgs/${orgSlug}/projects/${projectSlug}/spans?limit=50` +
            `&after=${encodeURIComponent(filters.timeRange.start!)}` +
            `&before=${encodeURIComponent(filters.timeRange.end!)}` +
            buildFilterParams();

          const res = await apiFetch<DataEnvelope<SpanEvent[]>>(url);
          const fetched = res.data;

          if (fetched.length > 0) {
            // API returns newest-first; reverse for chronological display
            const chronological = [...fetched].reverse();
            prependSpans(chronological);

            const meta = res.meta as { has_more?: boolean };
            if (!meta.has_more) {
              setHasMoreHistory(false);
            }
          } else {
            setHasMoreHistory(false);
          }
        } catch {
          // Non-blocking
        } finally {
          setLoadingHistory(false);
          fetchingRef.current = false;
        }
      }

      fetchInitialPage();
    } else if (!isHistoricalMode && prevHistoricalRef.current) {
      // Leaving historical mode — reset store and re-run the recent-spans
      // load (SSE reconnects on its own, but that only delivers *new* events;
      // without re-fetching, the buffer stays empty until traffic happens to
      // arrive, which looks identical to "no data ever sent" and wrongly
      // shows the SDK onboarding screen).
      reset();
      setHasMoreHistory(true);
      setInitialLoadDone(false);
    }
    prevHistoricalRef.current = isHistoricalMode;
    prevRangeRef.current = rangeKey;
  }, [isHistoricalMode, projectId, orgSlug, projectSlug, filters.timeRange.start, filters.timeRange.end, reset, prependSpans, setLoadingHistory, setHasMoreHistory, buildFilterParams]);

  // --- TanStack Virtual ---
  const parentRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const virtualizer = useVirtualizer({
    count: displayList.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  // Adjust scroll position after history prepend to prevent jumping (AC1)
  useLayoutEffect(() => {
    if (scrollAdjustRef.current > 0 && parentRef.current) {
      parentRef.current.scrollTop += scrollAdjustRef.current;
      scrollAdjustRef.current = 0;
    }
  });

  // Track scroll position to detect "at bottom" and "near top" for history loading
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    function handleScroll() {
      if (!el) return;
      const threshold = 50;
      // When everything already fits in the viewport there's nothing to
      // scroll into, so "near top" and "near bottom" would otherwise both
      // read true for the same scroll position — treat it as bottom (nothing
      // more to tail into) and skip the history fetch entirely.
      const hasScrollableContent = el.scrollHeight > el.clientHeight;
      const atBottom =
        !hasScrollableContent ||
        el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      setIsAtBottom(atBottom);

      // Trigger history loading when scrolled near top (AC1)
      if (hasScrollableContent && el.scrollTop < 100) {
        loadHistory();
      }
    }

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [setIsAtBottom, loadHistory]);

  // Auto-scroll when at bottom and new spans arrive (AC2) — but never because
  // of a history load (older spans prepended at the top from scrolling up).
  useEffect(() => {
    const grew = displayList.length > 0 && displayList.length > prevCountRef.current;
    if (isAtBottom && grew && !isHistoryPrependRef.current) {
      virtualizer.scrollToIndex(displayList.length - 1, { align: "end" });
    }
    isHistoryPrependRef.current = false;
    prevCountRef.current = displayList.length;
  }, [displayList.length, isAtBottom, virtualizer]);

  // Auto-scroll selected row into view when keyboard-navigating (AC2, Story 3.6)
  // selectedDisplayIndex (computed above, in the keyboard nav section) already
  // covers both root and child rows.
  useEffect(() => {
    if (selectedDisplayIndex >= 0) {
      virtualizer.scrollToIndex(selectedDisplayIndex, { align: "auto" });
    }
  }, [selectedDisplayIndex, virtualizer]);

  // Back to Live handler (AC3)
  function handleBackToLive() {
    virtualizer.scrollToIndex(displayList.length - 1, { align: "end" });
    setIsAtBottom(true);
  }

  // Determine what to show
  // In historical mode, a zero-span result means "nothing in this range" —
  // never the SDK onboarding flow, which only applies when no data has ever
  // been sent at all.
  const showSkeleton =
    loading || !initialLoadDone || (isHistoricalMode && isLoadingHistory && spans.length === 0);
  const showEmpty = !loading && initialLoadDone && spans.length === 0 && !isHistoricalMode;
  const showHistoricalEmpty =
    !loading && initialLoadDone && spans.length === 0 && isHistoricalMode && !isLoadingHistory;
  const showList = !loading && initialLoadDone && spans.length > 0;
  const showNoResults = showList && filteredSpans.length === 0;

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 48px)" }}>
      {/* Screen reader live region for new span announcements (AC6, UX11) */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>
      <LiveHeader
        status={status}
        spanCount={filteredSpans.length}
        isHistorical={isHistoricalMode}
        onTimePreset={handleTimePreset}
        onCustomRangeChange={handleCustomRangeChange}
      />
      <TimelineBar />
      <div ref={containerRef} className="relative flex flex-1 overflow-hidden">
        {/* Stream list — compresses when inspector is open */}
        <div
          className={cn(
            inspectorOpen ? "hidden md:block" : "w-full"
          )}
          style={{
            width: inspectorOpen ? `${100 - inspectorWidth}%` : "100%",
            transition: "width 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)"
          }}
        >
          <div className="relative h-full">
            <div
              ref={(el) => {
                (parentRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
                (listContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              }}
              tabIndex={-1}
              role="list"
              aria-label="Request stream"
              className="h-full overflow-auto outline-none"
            >
              {showSkeleton && <PulseSkeleton />}
              {showEmpty && <EmptyState orgSlug={orgSlug} projectSlug={projectSlug} />}
              {showHistoricalEmpty && (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <p className="text-sm font-medium text-muted-foreground">No requests in this time range</p>
                    <p className="mt-1 text-xs text-muted-foreground/70">Try a different date range or check your filters</p>
                  </div>
                </div>
              )}
              {showNoResults && (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <p className="text-sm font-medium text-muted-foreground">No matching requests</p>
                    <p className="mt-1 text-xs text-muted-foreground/70">Try adjusting your filters</p>
                  </div>
                </div>
              )}
              {showList && !showNoResults && (
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                  }}
                >
                  {/* History loading skeleton at top (AC1, UX7) */}
                  {isLoadingHistory && (
                    <div className="absolute left-0 top-0 z-10 w-full">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 border-b border-border/50 bg-background px-4 py-2"
                        >
                          <div className="h-5 w-14 animate-pulse rounded bg-muted" />
                          <div
                            className="h-4 animate-pulse rounded bg-muted"
                            style={{ width: `${SKELETON_WIDTHS[i]}%` }}
                          />
                          <div className="ml-auto h-4 w-10 animate-pulse rounded bg-muted" />
                          <div className="h-4 w-14 animate-pulse rounded bg-muted" />
                        </div>
                      ))}
                    </div>
                  )}

                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const item = displayList[virtualRow.index];
                    const isNew =
                      virtualRow.index >= prevCountRef.current - 1 &&
                      virtualRow.index === displayList.length - 1;

                    const rowContent =
                      item.type === "root" ? (
                        <StreamRow
                          span={item.span}
                          isSelected={itemKey(item) === activeKey}
                          childCount={item.childCount}
                          hasErrorChildren={item.hasErrorChildren}
                          isExpanded={item.isExpanded}
                          onToggleExpand={() => toggleExpanded(item.span.span_id)}
                          onClick={() => handleRowClick(item)}
                        />
                      ) : (
                        <ChildSpanRow
                          span={item.span}
                          depth={item.depth}
                          childCount={item.childCount}
                          isLast={item.isLast}
                          isSelected={itemKey(item) === activeKey}
                          onClick={() => handleRowClick(item)}
                        />
                      );

                    return (
                      <div
                        key={itemKey(item)}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        {isNew ? (
                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                          >
                            {rowContent}
                          </motion.div>
                        ) : (
                          rowContent
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Back to Live floating button (AC2, AC3, UX17) */}
            <AnimatePresence>
              {!isAtBottom && filteredSpans.length > 0 && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.15 }}
                  onClick={handleBackToLive}
                  className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
                >
                  <ArrowDown className="size-4" />
                  Back to Live
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Resize handle + Span Inspector panel */}
        <AnimatePresence>
          {inspectorOpen && (
            <>
              {/* Drag handle */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                onMouseDown={startResize}
                className="hidden md:flex w-1.5 shrink-0 cursor-col-resize items-center justify-center hover:bg-primary/10 active:bg-primary/20 transition-colors"
              >
                <div className="h-8 w-0.5 rounded-full bg-border" />
              </motion.div>
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                className="absolute inset-0 z-30 md:relative md:z-auto"
                style={{ width: `${inspectorWidth}%` }}
              >
                <SpanInspector
                  detail={spanDetail}
                  loading={detailLoading}
                  error={detailError}
                  onClose={() => setInspectorSpanId(null)}
                  orgSlug={orgSlug}
                  projectSlug={projectSlug}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
