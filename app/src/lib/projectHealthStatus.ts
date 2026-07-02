import type { EndpointStats, ServiceStatus } from "@/types/dashboard";
import type { HealthStatus } from "@/types/health";

export interface ProjectStatusSummary {
  worst: HealthStatus | null;
  healthyCount: number;
  degradedCount: number;
  errorCount: number;
}

export function getWorstStatus(statuses: HealthStatus[]): HealthStatus | null {
  if (statuses.length === 0) return null;
  if (statuses.includes("error")) return "error";
  if (statuses.includes("degraded")) return "degraded";
  return "healthy";
}

export function summarizeProjectStatus(
  services: ServiceStatus[]
): ProjectStatusSummary {
  const healthyCount = services.filter((s) => s.status === "healthy").length;
  const degradedCount = services.filter((s) => s.status === "degraded").length;
  const errorCount = services.filter((s) => s.status === "error").length;
  const worst = getWorstStatus(services.map((s) => s.status));

  return { worst, healthyCount, degradedCount, errorCount };
}

/** Services that need investigation, worst first. */
export function getAttentionServices(services: ServiceStatus[]): ServiceStatus[] {
  const rank = { error: 0, degraded: 1, healthy: 2 };
  return [...services]
    .filter((s) => s.status !== "healthy")
    .sort((a, b) => rank[a.status] - rank[b.status] || b.error_rate - a.error_rate);
}

/** Endpoints with failures, sorted by error rate then volume. */
export function getAttentionEndpoints(
  endpoints: EndpointStats[],
  limit = 5
): EndpointStats[] {
  return [...endpoints]
    .filter((ep) => ep.error_rate > 0)
    .sort(
      (a, b) =>
        b.error_rate - a.error_rate || b.count - a.count
    )
    .slice(0, limit);
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
