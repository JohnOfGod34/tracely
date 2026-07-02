"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EndpointStats, ServiceStatus } from "@/types/dashboard";
import type { TimeRange } from "@/types/span";
import { buildLiveUrl } from "@/lib/liveLinks";
import { endpointReactKey } from "@/lib/endpointStats";

interface NeedsAttentionPanelProps {
  services: ServiceStatus[];
  endpoints: EndpointStats[];
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

  return (
    <section
      className={cn("border-b border-border pb-3", className)}
      data-testid="needs-attention-panel"
      aria-label="Needs attention"
    >
      <h2 className="mb-2 text-xs font-medium text-foreground">Needs attention</h2>

      <div className="grid gap-3 lg:grid-cols-2">
        {services.length > 0 && (
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
                  className="flex min-h-10 items-center justify-between gap-2 py-2 text-sm"
                >
                  <span className="truncate font-medium">{service.name}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
                    {service.error_rate.toFixed(1)}% · {formatLatency(service.p95_latency)}
                    <ChevronRight className="size-3" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {endpoints.length > 0 && (
          <ul className="divide-y divide-border">
            {endpoints.map((ep) => (
              <li key={endpointReactKey(ep.method, ep.route)}>
                <Link
                  href={buildLiveUrl(orgSlug, projectSlug, {
                    timeRange,
                    search: ep.route || ep.method,
                    environment,
                    statusGroups: ["4xx", "5xx"],
                  })}
                  className="flex min-h-10 items-center justify-between gap-2 py-2 text-sm"
                >
                  <span className="truncate font-mono text-xs">
                    <span className="mr-1.5 text-muted-foreground">{ep.method}</span>
                    {ep.route || "/"}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {ep.error_rate.toFixed(1)}%
                    <ChevronRight className="ml-1 inline size-3" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
