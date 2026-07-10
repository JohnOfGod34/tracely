import type { DataPoint } from "@/types/dashboard";

function alignSeries(
  requests: DataPoint[],
  errors: DataPoint[]
): { req: number; err: number }[] {
  const errByTs = new Map(errors.map((p) => [p.timestamp, p.value]));
  return requests.map((p) => ({
    req: p.value,
    err: errByTs.get(p.timestamp) ?? 0,
  }));
}

export function requestsSparkline(requests: DataPoint[]): number[] {
  return requests.map((p) => p.value);
}

export function errorsSparkline(errors: DataPoint[]): number[] {
  return errors.map((p) => p.value);
}

export function errorRateSparkline(
  requests: DataPoint[],
  errors: DataPoint[]
): number[] {
  return alignSeries(requests, errors).map(({ req, err }) =>
    req > 0 ? (err / req) * 100 : 0
  );
}

export function successRateSparkline(
  requests: DataPoint[],
  errors: DataPoint[]
): number[] {
  return errorRateSparkline(requests, errors).map((rate) =>
    Math.max(0, 100 - rate)
  );
}

/** Normalize latency-ish series when no time series exists — flat line from current value. */
export function flatSparkline(value: number, points = 12): number[] {
  const safe = Number.isFinite(value) ? value : 0;
  return Array.from({ length: points }, () => safe);
}
