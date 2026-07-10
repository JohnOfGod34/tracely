"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ServiceStatus } from "@/types/dashboard";
import type { AttentionEndpoint } from "@/lib/projectHealthStatus";
import type { TimeRange } from "@/types/span";
import { buildLiveUrl } from "@/lib/liveLinks";
import { endpointReactKey, resolveEndpointP95 } from "@/lib/endpointStats";
import {
  STATUS_DOT,
  errorRateTextClass,
  latencyTextClass,
} from "@/lib/statusStyles";

interface NeedsAttentionPanelProps {
  services: ServiceStatus[];
  endpoints: AttentionEndpoint[];
  orgSlug: string;
  projectSlug: string;
  timeRange: TimeRange;
  environment?: string | null;
  className?: string;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function MetricChip({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] tabular-nums",
        className
      )}
    >
      <span className="font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span>{value}</span>
    </span>
  );
}

export function NeedsAttentionPanel({
  services,
  endpoints,
  orgSlug,
  projectSlug,
  timeRange,
  environment,
  className,
}: NeedsAttentionPanelProps) {
  if (services.length === 0 && endpoints.length === 0) return null;

  const errorEndpoints = endpoints.filter((ep) => ep.kind === "error");
  const slowEndpoints = endpoints.filter((ep) => ep.kind === "slow");

  return (
    <section
      className={cn("rounded-lg border border-border bg-card p-4", className)}
      data-testid="needs-attention-panel"
      aria-label="Needs attention"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-foreground">Needs attention</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Worst endpoints by error rate or p95 latency — not a project average
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground">Open in Live to inspect</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {services.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Services
            </h3>
            <ul className="divide-y divide-border">
              {services.map((service) => (
                <li key={service.name}>
                  <Link
                    href={buildLiveUrl(orgSlug, projectSlug, {
                      timeRange,
                      service: service.name,
                      environment,
                      statusGroups: service.error_rate >= 1 ? ["4xx", "5xx"] : undefined,
                    })}
                    className="flex min-h-11 items-center justify-between gap-3 py-2.5 text-sm hover:opacity-80"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[service.status])}
                        aria-hidden
                      />
                      <span className="truncate font-medium">{service.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <MetricChip
                        label="err"
                        value={`${service.error_rate.toFixed(1)}%`}
                        className={errorRateTextClass(service.error_rate)}
                      />
                      <MetricChip
                        label="p95"
                        value={formatLatency(service.p95_latency)}
                        className={latencyTextClass(service.p95_latency)}
                      />
                      <ChevronRight className="size-3 text-muted-foreground" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {endpoints.length > 0 && (
          <div className={services.length > 0 ? "" : "lg:col-span-2"}>
            <h3 className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Endpoints
            </h3>

            {errorEndpoints.length > 0 && (
              <ul className="divide-y divide-border">
                {errorEndpoints.map((ep) => (
                  <li key={endpointReactKey(ep.method, ep.route)}>
                    <Link
                      href={buildLiveUrl(orgSlug, projectSlug, {
                        timeRange,
                        search: ep.route || ep.method,
                        environment,
                        statusGroups: ["4xx", "5xx"],
                      })}
                      className="flex min-h-11 items-center justify-between gap-3 py-2.5 text-sm hover:opacity-80"
                    >
                      <span className="min-w-0 truncate font-mono text-xs">
                        <span className="mr-1.5 text-muted-foreground">{ep.method}</span>
                        {ep.route || "/"}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <MetricChip
                          label="err"
                          value={`${ep.error_rate.toFixed(1)}%`}
                          className={errorRateTextClass(ep.error_rate)}
                        />
                        <ChevronRight className="size-3 text-muted-foreground" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {slowEndpoints.length > 0 && (
              <ul
                className={cn(
                  "divide-y divide-border",
                  errorEndpoints.length > 0 && "mt-2 border-t border-border pt-2"
                )}
              >
                {slowEndpoints.map((ep) => (
                  <li key={endpointReactKey(ep.method, ep.route)}>
                    <Link
                      href={buildLiveUrl(orgSlug, projectSlug, {
                        timeRange,
                        search: ep.route || ep.method,
                        environment,
                      })}
                      className="flex min-h-11 items-center justify-between gap-3 py-2.5 text-sm hover:opacity-80"
                    >
                      <span className="min-w-0 truncate font-mono text-xs">
                        <span className="mr-1.5 text-muted-foreground">{ep.method}</span>
                        {ep.route || "/"}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <MetricChip
                          label="p95"
                          value={formatLatency(resolveEndpointP95(ep))}
                          className={latencyTextClass(resolveEndpointP95(ep))}
                        />
                        <ChevronRight className="size-3 text-muted-foreground" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
