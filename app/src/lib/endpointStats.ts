import type { EndpointStats } from "@/types/dashboard";

/** Canonical path for dedup: trim, leading slash, no trailing slash (except root). */
export function normalizeRoute(route: string): string {
  let r = (route || "/").trim();
  if (!r.startsWith("/")) r = `/${r}`;
  if (r.length > 1) r = r.replace(/\/+$/, "") || "/";
  return r || "/";
}

export function normalizeMethod(method: string): string {
  const m = (method || "GET").trim().toUpperCase();
  return m || "GET";
}

/** Stable identity for method + route. */
export function endpointIdentity(method: string, route: string): string {
  return `${normalizeMethod(method)}\0${normalizeRoute(route)}`;
}

/** React list key — safe to use after mergeDuplicate*. */
export function endpointReactKey(method: string, route: string): string {
  return endpointIdentity(method, route).replace("\0", "-");
}

function mergeEndpointRow<T extends EndpointStats>(
  prev: T,
  ep: T,
  method: string,
  route: string
): T {
  const count = prev.count + ep.count;
  return {
    ...prev,
    route,
    method,
    count,
    avg_latency:
      count > 0
        ? (prev.avg_latency * prev.count + ep.avg_latency * ep.count) / count
        : 0,
    error_rate:
      count > 0
        ? (prev.error_rate * prev.count + ep.error_rate * ep.count) / count
        : 0,
  };
}

/**
 * Merge duplicate endpoint rows (NULL/empty method, trailing slashes, etc.).
 * Count-weighted averages for latency and error rate.
 */
export function mergeDuplicateEndpoints(endpoints: EndpointStats[]): EndpointStats[] {
  const byKey = new Map<string, EndpointStats>();

  for (const ep of endpoints) {
    const method = normalizeMethod(ep.method);
    const route = normalizeRoute(ep.route);
    const key = endpointIdentity(method, route);
    const prev = byKey.get(key);

    if (!prev) {
      byKey.set(key, { ...ep, method, route });
      continue;
    }

    byKey.set(key, mergeEndpointRow(prev, ep, method, route));
  }

  return Array.from(byKey.values());
}

/** Widget shape (camelCase) — same merge semantics as API rows. */
export interface WidgetEndpointStats {
  route: string;
  method: string;
  count: number;
  avgLatency: number;
  errorRate: number;
}

function mergeWidgetRow(
  prev: WidgetEndpointStats,
  ep: WidgetEndpointStats,
  method: string,
  route: string
): WidgetEndpointStats {
  const count = prev.count + ep.count;
  return {
    route,
    method,
    count,
    avgLatency:
      count > 0
        ? (prev.avgLatency * prev.count + ep.avgLatency * ep.count) / count
        : 0,
    errorRate:
      count > 0
        ? (prev.errorRate * prev.count + ep.errorRate * ep.count) / count
        : 0,
  };
}

export function mergeDuplicateWidgetEndpoints(
  endpoints: WidgetEndpointStats[]
): WidgetEndpointStats[] {
  const byKey = new Map<string, WidgetEndpointStats>();

  for (const ep of endpoints) {
    const method = normalizeMethod(ep.method);
    const route = normalizeRoute(ep.route);
    const key = endpointIdentity(method, route);
    const prev = byKey.get(key);

    if (!prev) {
      byKey.set(key, { ...ep, method, route });
      continue;
    }

    byKey.set(key, mergeWidgetRow(prev, ep, method, route));
  }

  return Array.from(byKey.values());
}
