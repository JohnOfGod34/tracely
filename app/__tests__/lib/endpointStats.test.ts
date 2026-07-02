import {
  endpointIdentity,
  endpointReactKey,
  mergeDuplicateEndpoints,
  mergeDuplicateWidgetEndpoints,
  normalizeRoute,
} from "@/lib/endpointStats";

describe("endpointStats", () => {
  it("endpointIdentity normalizes empty method to GET", () => {
    expect(endpointIdentity("", "/users/me")).toBe("GET\0/users/me");
    expect(endpointIdentity("get", "/users/me")).toBe("GET\0/users/me");
  });

  it("normalizeRoute collapses trailing slashes", () => {
    expect(normalizeRoute("/docs/")).toBe("/docs");
    expect(normalizeRoute("docs")).toBe("/docs");
    expect(normalizeRoute("/")).toBe("/");
  });

  it("endpointReactKey matches display-style keys after normalization", () => {
    expect(endpointReactKey("GET", "/docs/")).toBe("GET-/docs");
  });

  it("mergeDuplicateEndpoints combines rows with same method and route", () => {
    const merged = mergeDuplicateEndpoints([
      {
        route: "/users/me",
        method: "GET",
        count: 100,
        avg_latency: 50,
        error_rate: 2,
      },
      {
        route: "/users/me",
        method: "",
        count: 50,
        avg_latency: 80,
        error_rate: 4,
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].count).toBe(150);
    expect(merged[0].avg_latency).toBeCloseTo(60);
    expect(merged[0].error_rate).toBeCloseTo(2.666, 2);
  });

  it("mergeDuplicateEndpoints merges trailing-slash variants", () => {
    const merged = mergeDuplicateEndpoints([
      {
        route: "/docs",
        method: "GET",
        count: 80,
        avg_latency: 10,
        error_rate: 0,
      },
      {
        route: "/docs/",
        method: "GET",
        count: 20,
        avg_latency: 30,
        error_rate: 0,
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].route).toBe("/docs");
    expect(merged[0].count).toBe(100);
  });

  it("mergeDuplicateWidgetEndpoints dedupes camelCase rows", () => {
    const merged = mergeDuplicateWidgetEndpoints([
      { route: "/users/me", method: "GET", count: 10, avgLatency: 100, errorRate: 1 },
      { route: "/users/me", method: "GET", count: 5, avgLatency: 200, errorRate: 3 },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].count).toBe(15);
  });
});
