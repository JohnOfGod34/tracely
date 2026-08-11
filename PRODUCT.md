# Product

## Register

product

## Users

Developers and small engineering teams running APIs, web apps, and mobile
backends who instrument their services with OpenTelemetry and use Tracely's
dashboard to answer "is anything broken right now, and where." They land on
the dashboard mid-incident or during a daily health check, scanning for
request volume, error rate, and latency spikes per endpoint before diving
into individual traces.

## Product Purpose

Tracely is an open-source, OTLP-based monitoring tool for APIs, web apps,
and mobile apps ("Ship Fast, Stay Safe"). ClickHouse stores high-volume span
data (with a `metrics_1m` materialized view pre-aggregating request/error
counts per route); Postgres stores org/project/auth/alert configuration.
Success looks like: a developer can go from "something feels off" to
"here's the endpoint and the error" in under a minute, without running a
heavyweight APM tool.

## Brand Personality

Direct, technical, trustworthy, no-frills. The dashboard is a working tool
for developers, not a marketing surface — clarity and speed of comprehension
beat visual flourish.

## Anti-references

Not a bloated enterprise APM dashboard (Datadog/New Relic-style visual
clutter, walls of low-signal widgets). Not consumer-flashy — no heavy
gradients, decorative illustrations, or marketing sheen. The existing
dashboard's flat, data-dense widget system (MetricCard, Sparkline,
DashboardPanel) is the right register; extend it, don't reinvent it.

## Design Principles

- **Signal over decoration** — every element on the dashboard should help
  answer "is something wrong?" faster, not just look good.
- **Data density with clarity** — pack in metrics without becoming
  unscannable; consistent card/sparkline vocabulary keeps dense screens
  legible.
- **Progressive configuration** — power-user customization (e.g. pinning
  specific endpoints to watch) should be additive and local, never cluttering
  the default view for other users.
- **Reuse the existing widget system** — new dashboard features compose
  `DashboardPanel`, `MetricCard`/`MetricSparklineCard`, and the established
  ClickHouse aggregation helpers (`endpointStats.ts`,
  `_normalize_http_route`) rather than introducing parallel patterns.
- **Fast feedback loop** — prefer client-side/local state for personalization
  features when no team-wide sharing is required, keeping interactions
  instant and backend-free.

## Accessibility & Inclusion

WCAG AA baseline (product default). Respect `prefers-reduced-motion` for
chart/sparkline animations, consistent with the existing dashboard's motion
conventions.
