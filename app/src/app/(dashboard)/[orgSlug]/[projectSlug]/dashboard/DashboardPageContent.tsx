"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { DataEnvelope } from "@/types/api";
import type { DashboardMetricsResponse } from "@/types/dashboard";
import type { TimeRange, TimeRangePreset } from "@/types/span";
import { useFilterStore } from "@/stores/filterStore";
import { useActiveAlerts } from "@/hooks/useActiveAlerts";
import {
  formatTimeRangeLabel,
  buildLiveUrl,
  parseTimeRangeFromSearchParams,
  matchesDashboardSsrPrefetch,
} from "@/lib/liveLinks";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";
import { mergeDuplicateEndpoints } from "@/lib/endpointStats";
import {
  getAttentionEndpoints,
  getAttentionServices,
  summarizeProjectStatus,
} from "@/lib/projectHealthStatus";
import { TimeframeSelector } from "@/components/shared/TimeframeSelector";
import { DashboardStatusBanner } from "@/components/dashboard/DashboardStatusBanner";
import { ActiveAlertsStrip } from "@/components/dashboard/ActiveAlertsStrip";
import { NeedsAttentionPanel } from "@/components/dashboard/NeedsAttentionPanel";
import { DashboardEnvironmentFilter } from "@/components/dashboard/DashboardEnvironmentFilter";
import {
  computeErrorRateTrend,
  computeLatencyTrend,
  computeRequestTrend,
  computeSuccessRateTrend,
  formatSuccessRate,
} from "@/lib/metricTrends";
import {
  ServiceStatusWidget,
  WidgetSkeleton,
  ThroughputWidget,
  StatusCodeWidget,
  TopEndpointsWidget,
  LatencyDistributionWidget,
  ErrorsTimelineWidget,
  MetricCard,
} from "@/components/dashboard/widgets";

interface ProjectInfo {
  id: string;
  name: string;
  slug: string;
  org_id: string;
}

export interface DashboardPageClientProps {
  orgSlug: string;
  projectSlug: string;
  projectId: string | null;
  initialMetrics: DashboardMetricsResponse | null;
}

// Skeleton grid for loading state
function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Top row - metric cards */}
      <div className="col-span-3"><WidgetSkeleton /></div>
      <div className="col-span-3"><WidgetSkeleton /></div>
      <div className="col-span-3"><WidgetSkeleton /></div>
      <div className="col-span-3"><WidgetSkeleton /></div>

      {/* Second row - charts */}
      <div className="col-span-8 h-[200px]"><WidgetSkeleton /></div>
      <div className="col-span-4 h-[200px]"><WidgetSkeleton /></div>

      {/* Third row */}
      <div className="col-span-6 h-[240px]"><WidgetSkeleton /></div>
      <div className="col-span-6 h-[240px]"><WidgetSkeleton /></div>

      {/* Fourth row */}
      <div className="col-span-4 h-[280px]"><WidgetSkeleton /></div>
      <div className="col-span-8 h-[280px]"><WidgetSkeleton /></div>
    </div>
  );
}

export default function DashboardPageClient({
  orgSlug,
  projectSlug,
  projectId: serverProjectId,
  initialMetrics,
}: DashboardPageClientProps) {
  return (
    <Suspense fallback={<DashboardPageSkeleton />}>
      <DashboardPageInner
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        projectId={serverProjectId}
        initialMetrics={initialMetrics}
      />
    </Suspense>
  );
}

function DashboardPageSkeleton() {
  return (
    <div className="p-4">
      <div className="mb-4 h-12" />
      <DashboardSkeleton />
    </div>
  );
}

function DashboardPageInner({
  orgSlug,
  projectSlug,
  projectId: serverProjectId,
  initialMetrics,
}: DashboardPageClientProps) {
  const searchParams = useSearchParams();

  const { filters, setTimeRange, setAvailableEnvironments } = useFilterStore();
  const storeTimeRange = filters.timeRange;
  const environment = filters.environment;

  // Prefer URL timeframe on first paint (before useEffect hydrates the store)
  const effectiveTimeRange = useMemo(() => {
    const fromUrl = parseTimeRangeFromSearchParams(searchParams);
    return fromUrl ?? storeTimeRange;
  }, [searchParams, storeTimeRange]);

  const timeRange = storeTimeRange;

  // Hydrate filter store from URL before paint (avoids a 5m query when URL says 24h)
  const hydratedRef = useRef(false);
  useLayoutEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const time = searchParams.get("time");
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const env = searchParams.get("env");

    if (time) {
      const validPresets = new Set(["5m", "15m", "1h", "6h", "24h", "custom"]);
      if (validPresets.has(time)) {
        setTimeRange({
          preset: time as TimeRangePreset,
          start: start ?? undefined,
          end: end ?? undefined,
        });
      }
    }

    const store = useFilterStore.getState();
    if (env && env !== "unknown") store.setEnvironment(env);
    else if (env === "unknown") store.setEnvironment("unknown");
  }, [searchParams, setTimeRange]);

  // Sync timeRange to URL
  useEffect(() => {
    const params = new URLSearchParams();

    if (timeRange.preset !== "5m") {
      params.set("time", timeRange.preset);
    }
    if (timeRange.preset === "custom") {
      if (timeRange.start) params.set("start", timeRange.start);
      if (timeRange.end) params.set("end", timeRange.end);
    }
    if (environment && environment !== "unknown") {
      params.set("env", environment);
    }

    const search = params.toString();
    const newUrl = `${window.location.pathname}${search ? `?${search}` : ""}`;
    window.history.replaceState(null, "", newUrl);
  }, [timeRange, environment]);

  // Handle timeframe change
  const handleTimeRangeChange = useCallback(
    (range: TimeRange) => {
      setTimeRange(range);
    },
    [setTimeRange]
  );

  // Project ID — from SSR or client fallback
  const [projectId, setProjectId] = useState<string | null>(serverProjectId);

  useEffect(() => {
    setProjectId(serverProjectId);
  }, [serverProjectId]);

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
        // Non-blocking
      }
    }

    loadProject();
    return () => {
      cancelled = true;
    };
  }, [projectId, orgSlug, projectSlug]);

  const envParam =
    environment && environment !== "unknown" ? environment : undefined;

  const queryTimeRange = effectiveTimeRange;
  const useSsrInitialData = matchesDashboardSsrPrefetch(queryTimeRange, environment);

  // React Query for dashboard metrics
  const {
    data: dashboardData,
    isLoading,
    error,
    dataUpdatedAt,
    isFetching,
  } = useQuery<DashboardMetricsResponse>({
    queryKey: [
      "dashboard",
      "metrics",
      projectId,
      queryTimeRange.preset,
      queryTimeRange.start,
      queryTimeRange.end,
      environment,
    ],
    queryFn: async () => {
      if (!projectId) throw new Error("No project ID");
      const params = new URLSearchParams();
      params.set("time", queryTimeRange.preset);
      if (queryTimeRange.preset === "custom") {
        if (queryTimeRange.start) params.set("start", queryTimeRange.start);
        if (queryTimeRange.end) params.set("end", queryTimeRange.end);
      }
      if (envParam) params.set("env", envParam);
      if (environment === "unknown") params.set("env", "unknown");
      const res = await apiFetch<DataEnvelope<DashboardMetricsResponse>>(
        `/api/orgs/${orgSlug}/projects/${projectSlug}/dashboard/metrics?${params.toString()}`
      );
      return res.data;
    },
    enabled: !!projectId,
    initialData: useSsrInitialData && initialMetrics ? initialMetrics : undefined,
    initialDataUpdatedAt:
      useSsrInitialData && initialMetrics ? Date.now() : undefined,
    placeholderData: keepPreviousData,
    refetchInterval: queryTimeRange.preset !== "custom" ? 10000 : false,
    staleTime: 8000,
  });

  useEffect(() => {
    if (dashboardData?.available_environments?.length) {
      setAvailableEnvironments(dashboardData.available_environments);
    }
  }, [dashboardData?.available_environments, setAvailableEnvironments]);

  // Log error for debugging
  if (error) {
    console.error("Dashboard metrics fetch error:", error);
  }

  const { data: activeAlertsData, isLoading: alertsLoading } = useActiveAlerts({
    orgSlug,
    projectSlug,
    enabled: !!projectId,
  });

  const activeAlerts = activeAlertsData?.events ?? [];

  const showLoading =
    !projectId || (isLoading && !dashboardData) || (isFetching && !dashboardData);
  const hasData = dashboardData && (
    dashboardData.total_requests > 0 ||
    dashboardData.services.length > 0 ||
    dashboardData.top_endpoints.length > 0 ||
    dashboardData.requests_per_minute.length > 0 ||
    dashboardData.status_codes.length > 0
  );
  const showEmpty =
    !isLoading && !isFetching && !error && projectId && dashboardData != null && !hasData;
  const showData = !isLoading && dashboardData && hasData;

  // Prepare data for widgets
  const statusCodeData = dashboardData?.status_codes.map((sc) => ({
    code: sc.code,
    count: sc.count,
  })) || [];

  const mergedTopEndpoints = useMemo(
    () => mergeDuplicateEndpoints(dashboardData?.top_endpoints ?? []),
    [dashboardData?.top_endpoints]
  );

  const endpointData = useMemo(
    () =>
      mergedTopEndpoints.map((ep) => ({
        route: ep.route,
        method: ep.method,
        count: ep.count,
        avgLatency: ep.avg_latency,
        errorRate: ep.error_rate,
      })),
    [mergedTopEndpoints]
  );

  const statusSummary = useMemo(
    () => summarizeProjectStatus(dashboardData?.services ?? []),
    [dashboardData?.services]
  );

  const attentionServices = useMemo(
    () => getAttentionServices(dashboardData?.services ?? []),
    [dashboardData?.services]
  );

  const attentionEndpoints = useMemo(
    () => getAttentionEndpoints(mergedTopEndpoints),
    [mergedTopEndpoints]
  );

  const timeRangeLabel = formatTimeRangeLabel(effectiveTimeRange);
  const envLabel =
    environment && environment !== "unknown"
      ? environment
      : environment === "unknown"
        ? "Unlabeled environment"
        : null;
  const headerContextLabel = envLabel
    ? `${timeRangeLabel} · ${envLabel}`
    : timeRangeLabel;

  const lastUpdatedLabel = useMemo(() => {
    if (!dataUpdatedAt) return undefined;
    const secs = Math.max(0, Math.floor((Date.now() - dataUpdatedAt) / 1000));
    if (secs < 10) return "just now";
    if (secs < 60) return `${secs}s ago`;
    return `${Math.floor(secs / 60)}m ago`;
  }, [dataUpdatedAt, isFetching]);

  const previous = dashboardData?.previous_period ?? undefined;

  const requestTrend = useMemo(
    () =>
      dashboardData
        ? computeRequestTrend(dashboardData.total_requests, previous?.total_requests)
        : null,
    [dashboardData, previous?.total_requests]
  );

  const errorTrend = useMemo(
    () =>
      dashboardData
        ? computeErrorRateTrend(dashboardData.error_rate, previous?.error_rate)
        : null,
    [dashboardData, previous?.error_rate]
  );

  const latencyTrend = useMemo(
    () =>
      dashboardData
        ? computeLatencyTrend(dashboardData.p95_latency, previous?.p95_latency)
        : null,
    [dashboardData, previous?.p95_latency]
  );

  const successTrend = useMemo(
    () =>
      dashboardData
        ? computeSuccessRateTrend(dashboardData.error_rate, previous?.error_rate)
        : null,
    [dashboardData, previous?.error_rate]
  );

  const successRate = dashboardData
    ? formatSuccessRate(dashboardData.error_rate)
    : "—";

  const errorTone =
    dashboardData && dashboardData.error_rate > 5
      ? "critical"
      : dashboardData && dashboardData.error_rate > 1
        ? "warning"
        : "default";

  const latencyTone =
    dashboardData && dashboardData.p95_latency > 2000
      ? "critical"
      : dashboardData && dashboardData.p95_latency > 500
        ? "warning"
        : "default";

  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Overview</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {headerContextLabel}
            {lastUpdatedLabel && showData ? ` · updated ${lastUpdatedLabel}` : ""}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <DashboardEnvironmentFilter className="sm:w-auto" />
          <TimeframeSelector
            timeRange={effectiveTimeRange}
            onTimeRangeChange={handleTimeRangeChange}
            variant="inline"
            appearance="segmented"
          />
          <Link
            href={buildLiveUrl(orgSlug, projectSlug, {
              timeRange: effectiveTimeRange,
              environment,
            })}
            className="inline-flex min-h-9 items-center justify-center rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted/60"
          >
            Live
          </Link>
        </div>
      </div>

      {error && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          Could not load dashboard metrics. Check your connection and refresh the page.
        </div>
      )}

      {/* Content */}
      {showLoading && <DashboardSkeleton />}
      {showEmpty && (
        <DashboardEmptyState
          orgSlug={orgSlug}
          projectSlug={projectSlug}
          timeRangeLabel={timeRangeLabel}
          timeRange={effectiveTimeRange}
          environment={environment}
        />
      )}
      {showData && dashboardData && (
        <>
          <DashboardStatusBanner
            summary={statusSummary}
            activeAlertCount={activeAlerts.length}
            orgSlug={orgSlug}
            projectSlug={projectSlug}
            isLoading={alertsLoading && activeAlerts.length === 0}
          />

          <div className="grid grid-cols-12 gap-3">
          <MetricCard
            title="Requests"
            value={dashboardData.total_requests.toLocaleString()}
            trend={requestTrend?.direction}
            trendValue={requestTrend?.label}
            invertTrendColors={requestTrend?.invertColors}
            className="col-span-6 lg:col-span-3"
          />
          <MetricCard
            title="Error rate"
            value={`${dashboardData.error_rate.toFixed(2)}%`}
            trend={errorTrend?.direction}
            trendValue={errorTrend?.label}
            invertTrendColors={errorTrend?.invertColors}
            tone={errorTone}
            className="col-span-6 lg:col-span-3"
          />
          <MetricCard
            title="P95 latency"
            value={dashboardData.p95_latency >= 1000 ? `${(dashboardData.p95_latency / 1000).toFixed(2)}s` : `${Math.round(dashboardData.p95_latency)}ms`}
            trend={latencyTrend?.direction}
            trendValue={latencyTrend?.label}
            invertTrendColors={latencyTrend?.invertColors}
            tone={latencyTone}
            className="col-span-6 lg:col-span-3"
          />
          <MetricCard
            title="Success rate"
            value={successRate}
            trend={successTrend?.direction}
            trendValue={successTrend?.label}
            invertTrendColors={successTrend?.invertColors}
            className="col-span-6 lg:col-span-3"
          />
          </div>

          <ActiveAlertsStrip
            events={activeAlerts}
            orgSlug={orgSlug}
            projectSlug={projectSlug}
          />

          <NeedsAttentionPanel
            services={attentionServices}
            endpoints={attentionEndpoints}
            orgSlug={orgSlug}
            projectSlug={projectSlug}
            timeRange={effectiveTimeRange}
            environment={environment}
          />

          <div className="grid grid-cols-12 gap-4">
          {/* Row 2: Main charts */}
          <ThroughputWidget
            data={dashboardData.requests_per_minute}
            className="col-span-12 lg:col-span-8"
          />
          <StatusCodeWidget
            data={statusCodeData}
            className="col-span-12 sm:col-span-6 lg:col-span-4"
          />

          {/* Row 3: Secondary charts */}
          <ErrorsTimelineWidget
            data={dashboardData.errors_per_minute}
            orgSlug={orgSlug}
            projectSlug={projectSlug}
            timeRange={effectiveTimeRange}
            environment={environment}
            className="col-span-12 lg:col-span-6"
          />
          <LatencyDistributionWidget
            data={dashboardData.latency_distribution}
            p50={dashboardData.p50_latency}
            p95={dashboardData.p95_latency}
            p99={dashboardData.p99_latency}
            className="col-span-12 lg:col-span-6"
          />

          {/* Row 4: Lists and service status */}
          <TopEndpointsWidget
            endpoints={endpointData}
            orgSlug={orgSlug}
            projectSlug={projectSlug}
            timeRange={effectiveTimeRange}
            environment={environment}
            className="col-span-12 lg:col-span-7"
          />
          <ServiceStatusWidget
            services={dashboardData.services}
            orgSlug={orgSlug}
            projectSlug={projectSlug}
            timeRange={effectiveTimeRange}
            environment={environment}
            className="col-span-12 lg:col-span-5"
          />
        </div>
        </>
      )}
    </div>
  );
}
