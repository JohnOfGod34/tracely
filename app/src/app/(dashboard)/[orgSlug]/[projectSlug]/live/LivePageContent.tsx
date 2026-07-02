"use client";

import dynamic from "next/dynamic";
import { Suspense, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, Check, Copy, Terminal, Code, BookOpen, RefreshCw, Clock, Search, ChevronDown, AlertTriangle, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DataEnvelope } from "@/types/api";
import type { SpanEvent, StreamFilters, TimeRangePreset } from "@/types/span";
import { useEventStream } from "@/hooks/useEventStream";
import { useSpanDetail } from "@/hooks/useSpanDetail";
import { useHealthData } from "@/hooks/useHealthData";
import { useLiveStreamStore } from "@/stores/liveStreamStore";
import { useFilterStore } from "@/stores/filterStore";
import { matchesFilters, presetToMs } from "@/lib/filterUtils";
import { aggregateProjectHealthMetrics } from "@/lib/healthMetrics";
import { StreamList } from "@/components/pulse/StreamList";
import { STREAM_ROW_HEIGHT, STREAM_SKELETON_WIDTHS } from "@/components/pulse/streamListTypes";
import { TimelineBar } from "@/components/timeline";

const DateRangePicker = dynamic(
  () =>
    import("@/components/shared/DateRangePicker").then((m) => ({
      default: m.DateRangePicker,
    })),
  {
    loading: () => <div className="h-7 w-36 animate-pulse rounded-md bg-muted" />,
  }
);

const SpanInspector = dynamic(
  () =>
    import("@/components/pulse/SpanInspector").then((m) => ({
      default: m.SpanInspector,
    })),
  { ssr: false, loading: () => <div className="h-full animate-pulse bg-muted/30" /> }
);

export interface LivePageClientProps {
  orgSlug: string;
  projectSlug: string;
  /** From server prefetch; null triggers a client-side fallback fetch. */
  projectId: string | null;
  initialSpans: SpanEvent[];
  initialHasMoreHistory: boolean;
}

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

const ROW_HEIGHT = STREAM_ROW_HEIGHT;

function PulseSkeleton() {
  return (
    <div className="flex flex-col gap-0">
      {STREAM_SKELETON_WIDTHS.map((w, i) => (
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

// --- Header metrics helpers ---

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

const LiveHeader = memo(function LiveHeader({
  orgSlug,
  projectSlug,
  status,
  isHistorical,
  onTimePreset,
  onCustomRangeChange,
}: {
  orgSlug: string;
  projectSlug: string;
  status: "connecting" | "connected" | "disconnected";
  isHistorical?: boolean;
  onTimePreset: (preset: TimeRangePreset) => void;
  onCustomRangeChange: (start: string, end: string) => void;
}) {
  const filters = useFilterStore((s) => s.filters);
  const setEndpointSearch = useFilterStore((s) => s.setEndpointSearch);
  const toggleStatusGroup = useFilterStore((s) => s.toggleStatusGroup);
  const [searchExpanded, setSearchExpanded] = useState(false);

  const spans = useLiveStreamStore((s) => s.spans);
  const spanCount = useMemo(
    () => spans.filter((s) => matchesFilters(s, filters)).length,
    [spans, filters]
  );

  const { data: healthData, isLoading: healthLoading } = useHealthData({
    orgSlug,
    projectSlug,
    enabled: !isHistorical,
  });

  const aggregatedMetrics = useMemo(
    () => aggregateProjectHealthMetrics(healthData?.services ?? []),
    [healthData]
  );

  // Custom range with only one bound picked — historical mode won't activate yet (AC5)
  const isCustomRangeIncomplete =
    filters.timeRange.preset === "custom" &&
    !!filters.timeRange.start !== !!filters.timeRange.end;

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
});

/** Syncs available environment options from the live span buffer. */
function EnvironmentSync() {
  const spans = useLiveStreamStore((s) => s.spans);
  const setAvailableEnvironments = useFilterStore((s) => s.setAvailableEnvironments);

  useEffect(() => {
    const envs = [...new Set(spans.map((s) => s.environment).filter(Boolean))].sort();
    setAvailableEnvironments(envs.length > 0 ? envs : ["unknown"]);
  }, [spans, setAvailableEnvironments]);

  return null;
}

// --- Main Pulse View Page ---

export default function LivePageClient({
  orgSlug,
  projectSlug,
  projectId,
  initialSpans,
  initialHasMoreHistory,
}: LivePageClientProps) {
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
      <LivePageInner
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        projectId={projectId}
        initialSpans={initialSpans}
        initialHasMoreHistory={initialHasMoreHistory}
      />
    </Suspense>
  );
}

function LivePageInner({
  orgSlug,
  projectSlug,
  projectId: serverProjectId,
  initialSpans,
  initialHasMoreHistory,
}: LivePageClientProps) {

  const [projectId, setProjectId] = useState<string | null>(serverProjectId);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Keep in sync when navigating between projects (new server props)
  useEffect(() => {
    setProjectId(serverProjectId);
  }, [serverProjectId]);

  // Client fallback when SSR prefetch could not resolve the project
  useEffect(() => {
    if (projectId) return;

    let cancelled = false;
    async function loadProject() {
      try {
        const res = await apiFetch<DataEnvelope<ProjectInfo>>(
          `/api/orgs/${orgSlug}/projects/${projectSlug}`
        );
        if (!cancelled) setProjectId(res.data.id);
      } catch {
        // Non-blocking — SSE won't connect without project ID
      }
    }

    loadProject();
    return () => {
      cancelled = true;
    };
  }, [projectId, orgSlug, projectSlug]);

  const addSpan = useLiveStreamStore((s) => s.addSpan);
  const prependSpans = useLiveStreamStore((s) => s.prependSpans);
  const setLoadingHistory = useLiveStreamStore((s) => s.setLoadingHistory);
  const setHasMoreHistory = useLiveStreamStore((s) => s.setHasMoreHistory);
  const hasMoreHistory = useLiveStreamStore((s) => s.hasMoreHistory);
  const reset = useLiveStreamStore((s) => s.reset);

  // --- Filter state (Story 3.5, 11.2) ---
  const filters = useFilterStore((s) => s.filters);
  const setTimeRange = useFilterStore((s) => s.setTimeRange);

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
    if (env && env !== "unknown") store.setEnvironment(env);
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
    if (filters.environment && filters.environment !== "unknown") {
      params.set("env", filters.environment);
    }
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

  // --- Inspector state (Story 3.3) ---
  const [inspectorSpanId, setInspectorSpanId] = useState<string | null>(null);
  const inspectorOpen = inspectorSpanId !== null;
  const { detail: spanDetail, loading: detailLoading, error: detailError } =
    useSpanDetail(orgSlug, projectSlug, inspectorSpanId);

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

  const listContainerRef = useRef<HTMLDivElement>(null);

  const handleOpenInspector = useCallback((spanId: string) => {
    setInspectorSpanId(spanId);
  }, []);

  const handleCloseInspector = useCallback(() => {
    setInspectorSpanId(null);
  }, []);

  // Bootstrap store from server-prefetched spans (or re-bootstrap on project change)
  const initialSpansKey = useMemo(
    () => initialSpans.map((s) => s.span_id).join("\0"),
    [initialSpans]
  );

  useLayoutEffect(() => {
    if (!serverProjectId) return;

    reset();
    if (initialSpans.length > 0) {
      prependSpans(initialSpans);
      setHasMoreHistory(initialHasMoreHistory);
      setInitialLoadDone(true);
    }
  }, [
    orgSlug,
    projectSlug,
    serverProjectId,
    initialSpansKey,
    initialHasMoreHistory,
    reset,
    prependSpans,
    setHasMoreHistory,
  ]);

  // Reset store on unmount only (not in bootstrap cleanup — breaks React Strict Mode)
  useEffect(() => {
    return () => reset();
  }, [reset]);

  // Client spans fetch when SSR had no spans or prefetch failed
  useEffect(() => {
    if (!projectId || initialLoadDone || isHistoricalMode) return;

    let cancelled = false;
    async function loadInitial() {
      try {
        const url = `/api/orgs/${orgSlug}/projects/${projectSlug}/spans?limit=50`;
        const res = await apiFetch<DataEnvelope<SpanEvent[]>>(url);
        if (cancelled) return;

        reset();
        const fetched = res.data;
        if (fetched.length > 0) {
          prependSpans([...fetched].reverse());
          const meta = res.meta as { has_more?: boolean };
          setHasMoreHistory(meta.has_more !== false);
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
    return () => {
      cancelled = true;
    };
  }, [
    projectId,
    initialLoadDone,
    isHistoricalMode,
    orgSlug,
    projectSlug,
    reset,
    prependSpans,
    setHasMoreHistory,
  ]);

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
    if (filters.endpointSearch) {
      params.push(`endpoint_search=${encodeURIComponent(filters.endpointSearch)}`);
    }
    return params.length > 0 ? `&${params.join("&")}` : "";
  }, [filters.environment, filters.statusGroups, filters.endpointSearch]);

  const loadHistory = useCallback(async () => {
    if (fetchingRef.current || !projectId || !hasMoreHistory) return;
    fetchingRef.current = true;
    setLoadingHistory(true);

    const currentSpans = useLiveStreamStore.getState().spans;
    const oldest = currentSpans.length > 0 ? currentSpans[0].start_time : undefined;

    try {
      // Larger page for "load more" than the initial view (150 vs 50) — fewer
      // round trips needed while scrolling through history, paired with the
      // predictive scroll trigger in StreamList so the fetch resolves before
      // the user visually reaches the top.
      let url =
        `/api/orgs/${orgSlug}/projects/${projectSlug}/spans?limit=150` +
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
        isHistoryPrependRef.current = true;
        // Use the count of roots actually added (post-dedup) — the raw fetch
        // count would overshoot the scroll compensation when the batch
        // overlaps spans already in the store (e.g. a fast scroll racing the
        // initial load), jumping the view forward instead of holding position.
        const addedRootCount = prependSpans(chronological);
        scrollAdjustRef.current = addedRootCount * ROW_HEIGHT;

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

  // Debounce endpointSearch before it triggers a server-side historical
  // refetch — matchesFilters still applies the raw value instantly to the
  // already-loaded buffer, so typing feels responsive; only the network
  // round trip (searching the whole selected range) waits for a pause.
  const [debouncedSearch, setDebouncedSearch] = useState(filters.endpointSearch);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.endpointSearch), 400);
    return () => clearTimeout(timer);
  }, [filters.endpointSearch]);

  // --- Historical mode: initial fetch on entry (AC5) ---
  const prevHistoricalRef = useRef(false);
  const prevRangeRef = useRef<string | null>(null);
  useEffect(() => {
    const rangeKey = isHistoricalMode
      ? `${filters.timeRange.start ?? ""}|${filters.timeRange.end ?? ""}|${debouncedSearch}`
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
            `/api/orgs/${orgSlug}/projects/${projectSlug}/spans?limit=150` +
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
      // Leaving historical mode — reset store and re-fetch recent spans
      // (SSE reconnects on its own, but that only delivers *new* events).
      reset();
      setHasMoreHistory(true);
      setInitialLoadDone(false);

      async function fetchLiveSpans() {
        try {
          const url = `/api/orgs/${orgSlug}/projects/${projectSlug}/spans?limit=50`;
          const res = await apiFetch<DataEnvelope<SpanEvent[]>>(url);
          const fetched = res.data;

          if (fetched.length > 0) {
            prependSpans([...fetched].reverse());
            const meta = res.meta as { has_more?: boolean };
            setHasMoreHistory(meta.has_more !== false);
          } else {
            setHasMoreHistory(false);
          }
        } catch {
          // Non-blocking
        } finally {
          setInitialLoadDone(true);
        }
      }

      fetchLiveSpans();
    }
    prevHistoricalRef.current = isHistoricalMode;
    prevRangeRef.current = rangeKey;
  }, [isHistoricalMode, projectId, orgSlug, projectSlug, filters.timeRange.start, filters.timeRange.end, debouncedSearch, reset, prependSpans, setLoadingHistory, setHasMoreHistory, buildFilterParams]);

  // --- Preset time ranges: backfill from the server (soft seed, not a mode switch) ---
  // Presets (5m/15m/1h/6h/24h) previously only filtered whatever was already
  // in the client buffer (initial load + live SSE trickle), so e.g. "24h"
  // right after opening the page showed only the last couple minutes.
  // Fetch the actual window from the server and merge it in — no reset(),
  // the live stream keeps running untouched, and prependSpans dedups
  // against whatever's already loaded.
  const prevPresetRef = useRef<TimeRangePreset>(filters.timeRange.preset);
  useEffect(() => {
    const preset = filters.timeRange.preset;
    if (preset !== "custom" && preset !== prevPresetRef.current && projectId) {
      const after = new Date(Date.now() - presetToMs(preset)).toISOString();
      const url =
        `/api/orgs/${orgSlug}/projects/${projectSlug}/spans?limit=150` +
        `&after=${encodeURIComponent(after)}` +
        buildFilterParams();

      apiFetch<DataEnvelope<SpanEvent[]>>(url)
        .then((res) => {
          if (res.data.length > 0) {
            prependSpans([...res.data].reverse());
            const meta = res.meta as { has_more?: boolean };
            if (!meta.has_more) setHasMoreHistory(false);
          }
        })
        .catch(() => {
          // Non-blocking — the buffer just stays whatever it already had
        });
    }
    prevPresetRef.current = preset;
  }, [filters.timeRange.preset, projectId, orgSlug, projectSlug, prependSpans, setHasMoreHistory, buildFilterParams]);

  const emptyState = useMemo(
    () => <EmptyState orgSlug={orgSlug} projectSlug={projectSlug} />,
    [orgSlug, projectSlug]
  );

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 48px)" }}>
      <EnvironmentSync />
      {/* Screen reader live region for new span announcements (AC6, UX11) */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>
      <LiveHeader
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        status={status}
        isHistorical={isHistoricalMode}
        onTimePreset={handleTimePreset}
        onCustomRangeChange={handleCustomRangeChange}
      />
      <TimelineBar />
      <div ref={containerRef} className="relative flex flex-1 overflow-hidden">
        <div
          className={cn(inspectorOpen ? "hidden md:block" : "w-full")}
          style={{
            width: inspectorOpen ? `${100 - inspectorWidth}%` : "100%",
            transition: "width 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)",
          }}
        >
          <StreamList
            projectId={projectId}
            initialLoadDone={initialLoadDone}
            isHistoricalMode={isHistoricalMode}
            inspectorSpanId={inspectorSpanId}
            onOpenInspector={handleOpenInspector}
            onCloseInspector={handleCloseInspector}
            listContainerRef={listContainerRef}
            scrollAdjustRef={scrollAdjustRef}
            isHistoryPrependRef={isHistoryPrependRef}
            onLoadHistory={loadHistory}
            emptyState={emptyState}
          />
        </div>

        {/* Resize handle + Span Inspector panel */}
        <AnimatePresence>
          {inspectorOpen && (
            <>
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
                  onClose={handleCloseInspector}
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
