"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, Radio } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { buildLiveUrl } from "@/lib/liveLinks";
import type { DataEnvelope } from "@/types/api";
import type { TimeRange } from "@/types/span";
import { SdkSetupPanel } from "@/components/onboarding/SdkSetupPanel";

interface ApiKeyItem {
  id: string;
  prefix: string;
}

interface DashboardEmptyStateProps {
  orgSlug: string;
  projectSlug: string;
  timeRangeLabel: string;
  timeRange: TimeRange;
  environment?: string | null;
}

export function DashboardEmptyState({
  orgSlug,
  projectSlug,
  timeRangeLabel,
  timeRange,
  environment,
}: DashboardEmptyStateProps) {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    async function checkKeys() {
      try {
        const res = await apiFetch<DataEnvelope<ApiKeyItem[]>>(
          `/api/orgs/${orgSlug}/projects/${projectSlug}/api-keys`
        );
        setHasApiKey(res.data.length > 0);
      } catch {
        setHasApiKey(true);
      }
    }
    checkKeys();
  }, [orgSlug, projectSlug]);

  if (hasApiKey === null) {
    return (
      <div className="flex h-[280px] items-center justify-center">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (hasApiKey) {
    return (
      <div className="flex flex-col items-center gap-6 py-12 text-center">
        <Activity className="size-10 text-muted-foreground/50" aria-hidden />
        <div>
          <p className="text-base font-medium text-foreground">No activity in this period</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            No requests were recorded for {timeRangeLabel.toLowerCase()}. Open the live stream
            for real-time events or try a wider window.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={buildLiveUrl(orgSlug, projectSlug, { timeRange, environment })}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Radio className="size-4" aria-hidden />
            Open live stream
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-8 py-8">
      <div className="text-center">
        <Activity className="mx-auto mb-3 size-10 text-muted-foreground/50" aria-hidden />
        <p className="text-base font-medium text-muted-foreground">No metrics yet</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground/80">
          Your dashboard will populate once the SDK sends its first spans. Set up the SDK below, then
          send a test request.
        </p>
      </div>
      <SdkSetupPanel
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        title="Connect your application"
        description="Install the SDK and send your first request to see throughput, errors, and latency here."
      />
    </div>
  );
}
