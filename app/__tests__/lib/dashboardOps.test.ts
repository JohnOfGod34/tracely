import { buildLiveUrl, formatTimeRangeLabel, formatPreviousPeriodLabel } from "@/lib/liveLinks";
import {
  getAttentionEndpoints,
  getAttentionServices,
  summarizeProjectStatus,
} from "@/lib/projectHealthStatus";
import type { EndpointStats, ServiceStatus } from "@/types/dashboard";

import {
  computeErrorRateTrend,
  computeSuccessRateTrend,
  formatSuccessRate,
} from "@/lib/metricTrends";

describe("metricTrends", () => {
  it("computes error rate delta vs previous period", () => {
    const trend = computeErrorRateTrend(3.5, 1.2);
    expect(trend?.direction).toBe("up");
    expect(trend?.label).toBe("+2.3 pts");
    expect(trend?.invertColors).toBe(true);
  });

  it("computes success rate improvement when errors drop", () => {
    const trend = computeSuccessRateTrend(1.0, 3.0);
    expect(trend?.direction).toBe("up");
    expect(trend?.invertColors).toBe(false);
  });

  it("formats success rate from error rate", () => {
    expect(formatSuccessRate(0.8)).toBe("99.20%");
  });

  it("returns null latency trend when previous p95 is null (avoids NaN%)", () => {
    expect(computeLatencyTrend(0, null)).toBeNull();
    expect(computeLatencyTrend(0, undefined)).toBeNull();
  });

  it("shows stable when both latency periods are zero", () => {
    const trend = computeLatencyTrend(0, 0);
    expect(trend?.label).toBe("Stable");
  });
});

describe("buildLiveUrl", () => {
  it("builds base live path without filters", () => {
    expect(buildLiveUrl("acme", "api")).toBe("/acme/api/live");
  });

  it("includes service, search, and status params", () => {
    const url = buildLiveUrl("acme", "api", {
      timeRange: { preset: "1h" },
      service: "payment-api",
      search: "/checkout",
      statusGroups: ["4xx", "5xx"],
    });
    expect(url).toContain("/acme/api/live?");
    expect(url).toContain("time=1h");
    expect(url).toContain("service=payment-api");
    expect(url).toContain("search=%2Fcheckout");
    expect(url).toContain("status=4xx%2C5xx");
  });
});

describe("formatTimeRangeLabel", () => {
  it("labels presets in plain language", () => {
    expect(formatTimeRangeLabel({ preset: "5m" })).toBe("Last 5 minutes");
    expect(formatTimeRangeLabel({ preset: "1h" })).toBe("Last hour");
  });
});

describe("formatPreviousPeriodLabel", () => {
  it("labels previous period for trend comparisons", () => {
    expect(formatPreviousPeriodLabel({ preset: "5m" })).toBe("previous 5 min");
    expect(formatPreviousPeriodLabel({ preset: "1h" })).toBe("previous hour");
    expect(formatPreviousPeriodLabel({ preset: "custom" })).toBe("previous period");
  });
});

describe("projectHealthStatus", () => {
  const service = (overrides: Partial<ServiceStatus>): ServiceStatus => ({
    name: "api",
    status: "healthy",
    request_rate: 10,
    error_rate: 0,
    p95_latency: 100,
    ...overrides,
  });

  it("summarizes worst status across services", () => {
    const summary = summarizeProjectStatus([
      service({ status: "healthy" }),
      service({ name: "pay", status: "error" }),
    ]);
    expect(summary.worst).toBe("error");
    expect(summary.errorCount).toBe(1);
  });

  it("sorts attention endpoints by error rate", () => {
    const endpoints: EndpointStats[] = [
      { route: "/a", method: "GET", count: 100, avg_latency: 10, error_rate: 1 },
      { route: "/b", method: "POST", count: 10, avg_latency: 10, error_rate: 15 },
    ];
    expect(getAttentionEndpoints(endpoints).map((e) => e.route)).toEqual(["/b", "/a"]);
  });

  it("filters healthy services from attention list", () => {
    const result = getAttentionServices([
      service({ status: "healthy" }),
      service({ name: "slow", status: "degraded" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("slow");
  });
});
