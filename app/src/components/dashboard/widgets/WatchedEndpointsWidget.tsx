"use client";

import { useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DataEnvelope } from "@/types/api";
import type { EndpointStats } from "@/types/dashboard";
import type { TimeRange } from "@/types/span";
import { DashboardPanel } from "@/components/dashboard/DashboardPanel";
import { DASHBOARD_METRIC_HELP } from "@/lib/dashboardMetricHelp";
import { normalizeMethod, normalizeRoute, endpointReactKey } from "@/lib/endpointStats";

interface WatchedEndpoint {
  method: string;
  route: string;
}

interface WatchedEndpointsWidgetProps {
  projectId?: string;
  orgSlug: string;
  projectSlug: string;
  timeRange: TimeRange;
  environment?: string | null;
  className?: string;
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function storageKey(projectId: string): string {
  return `tracely:watched-endpoints:${projectId}`;
}

/** Parses "GET /v3/jobseekers" or bare "/v3/jobseekers" (defaults to GET). */
function parseEndpointInput(raw: string): WatchedEndpoint | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);
  if (parts.length > 1 && HTTP_METHODS.includes(parts[0].toUpperCase())) {
    const route = parts.slice(1).join(" ");
    if (!route) return null;
    return { method: normalizeMethod(parts[0]), route: normalizeRoute(route) };
  }
  return { method: "GET", route: normalizeRoute(trimmed) };
}

export function WatchedEndpointsWidget({
  projectId,
  orgSlug,
  projectSlug,
  timeRange,
  environment,
  className,
}: WatchedEndpointsWidgetProps) {
  const [watched, setWatched] = useState<WatchedEndpoint[]>([]);
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    try {
      const stored = localStorage.getItem(storageKey(projectId));
      setWatched(stored ? JSON.parse(stored) : []);
    } catch {
      setWatched([]);
    }
  }, [projectId]);

  function persist(next: WatchedEndpoint[]) {
    setWatched(next);
    if (projectId) {
      localStorage.setItem(storageKey(projectId), JSON.stringify(next));
    }
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseEndpointInput(input);
    if (!parsed) {
      setInputError("Enter a route, e.g. GET /v3/jobseekers");
      return;
    }
    const exists = watched.some(
      (w) => w.method === parsed.method && w.route === parsed.route
    );
    if (exists) {
      setInputError("Already tracked");
      return;
    }
    setInputError(null);
    persist([...watched, parsed]);
    setInput("");
  }

  function handleRemove(target: WatchedEndpoint) {
    persist(
      watched.filter((w) => !(w.method === target.method && w.route === target.route))
    );
  }

  const envParam = environment && environment !== "unknown" ? environment : undefined;

  const results = useQueries({
    queries: watched.map((endpoint) => ({
      queryKey: [
        "dashboard",
        "endpoint-stats",
        projectId,
        endpoint.method,
        endpoint.route,
        timeRange.preset,
        timeRange.start,
        timeRange.end,
        environment,
      ],
      queryFn: async () => {
        const params = new URLSearchParams();
        params.set("method", endpoint.method);
        params.set("route", endpoint.route);
        params.set("time", timeRange.preset);
        if (timeRange.preset === "custom") {
          if (timeRange.start) params.set("start", timeRange.start);
          if (timeRange.end) params.set("end", timeRange.end);
        }
        if (envParam) params.set("env", envParam);
        if (environment === "unknown") params.set("env", "unknown");
        const res = await apiFetch<DataEnvelope<EndpointStats>>(
          `/api/orgs/${orgSlug}/projects/${projectSlug}/dashboard/endpoint-stats?${params.toString()}`
        );
        return res.data;
      },
      enabled: !!projectId,
      refetchInterval: timeRange.preset !== "custom" ? 10000 : false,
      staleTime: 8000,
    })),
  });

  return (
    <DashboardPanel
      title="Watched Endpoints"
      description={DASHBOARD_METRIC_HELP.watchedEndpoints}
      testId="watched-endpoints-widget"
      className={className}
    >
      <form onSubmit={handleAdd} className="mb-3 flex gap-2">
        <label htmlFor="watched-endpoint-input" className="sr-only">
          Add an endpoint to watch
        </label>
        <input
          id="watched-endpoint-input"
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (inputError) setInputError(null);
          }}
          placeholder="GET /v3/jobseekers"
          className="min-h-9 flex-1 min-w-0 rounded-md border border-border bg-background px-2.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          aria-invalid={!!inputError}
          aria-describedby={inputError ? "watched-endpoint-error" : undefined}
        />
        <button
          type="submit"
          className="min-h-9 shrink-0 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted"
        >
          Add
        </button>
      </form>
      {inputError && (
        <p id="watched-endpoint-error" className="mb-3 -mt-2 text-xs text-destructive">
          {inputError}
        </p>
      )}

      {watched.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No endpoints tracked yet
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {watched.map((endpoint, i) => {
            const query = results[i];
            const stats = query.data;
            return (
              <li
                key={endpointReactKey(endpoint.method, endpoint.route)}
                className="flex min-h-10 items-center justify-between gap-2 py-2 text-sm"
              >
                <span className="min-w-0 truncate font-mono text-xs">
                  <span className="mr-1.5 text-muted-foreground">{endpoint.method}</span>
                  {endpoint.route}
                </span>
                <span className="flex shrink-0 items-center gap-3 text-xs tabular-nums">
                  {query.isLoading ? (
                    <span className="text-muted-foreground">…</span>
                  ) : query.isError ? (
                    <span className="text-destructive">error</span>
                  ) : (
                    <>
                      <span className="text-muted-foreground">
                        {stats?.count.toLocaleString() ?? 0} reqs
                      </span>
                      <span
                        className={cn(
                          (stats?.error_rate ?? 0) >= 5 && "text-destructive",
                          (stats?.error_rate ?? 0) >= 1 &&
                            (stats?.error_rate ?? 0) < 5 &&
                            "text-warning",
                          (stats?.error_rate ?? 0) < 1 && "text-muted-foreground"
                        )}
                      >
                        {(stats?.error_rate ?? 0).toFixed(1)}%
                      </span>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(endpoint)}
                    aria-label={`Stop watching ${endpoint.method} ${endpoint.route}`}
                    className="flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardPanel>
  );
}

export default WatchedEndpointsWidget;
