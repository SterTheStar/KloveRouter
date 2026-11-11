import {
  RiPulseLine,
  RiCheckDoubleLine,
  RiSpeedUpLine,
  RiErrorWarningLine,
} from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { StatsUptimeSummary, StatsProviderHealth } from "@/types";
import {
  formatStatusDate,
  formatPercent,
  formatLatency,
  getUptimeTone,
} from "./status-utils";

interface StatusSummaryCardsProps {
  summary: StatsUptimeSummary;
  providers: StatsProviderHealth[];
}

export function StatusSummaryCards({ summary, providers }: StatusSummaryCardsProps) {
  const onlineCount = providers.filter((p) => p.status === "online").length;
  const degradedCount = providers.filter((p) => p.status === "degraded").length;
  const offlineCount = providers.filter((p) => p.status === "offline").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Success Rate */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-none">
          <div className="flex items-center justify-between text-tertiary">
            <span className="text-xs font-normal">Success rate</span>
            <RiCheckDoubleLine className="size-4" aria-hidden="true" />
          </div>
          <div
            className={cn(
              "mt-2 font-mono text-2xl font-normal tabular-nums text-foreground",
              summary.total_requests ? getUptimeTone(summary.uptime_percent) : undefined
            )}
          >
            {summary.total_requests ? formatPercent(summary.uptime_percent) : "—"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.success_count.toLocaleString()} succeeded
          </p>
        </div>

        {/* Total Requests */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-none">
          <div className="flex items-center justify-between text-tertiary">
            <span className="text-xs font-normal">Total requests</span>
            <RiPulseLine className="size-4" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-normal tabular-nums text-foreground">
            {summary.total_requests.toLocaleString()}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Across {providers.length} configured {providers.length === 1 ? "provider" : "providers"}
          </p>
        </div>

        {/* Latency */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-none">
          <div className="flex items-center justify-between text-tertiary">
            <span className="text-xs font-normal">Response latency</span>
            <RiSpeedUpLine className="size-4" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-normal tabular-nums text-foreground">
            {summary.total_requests ? formatLatency(summary.avg_latency_ms) : "—"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            P95 {summary.total_requests ? formatLatency(summary.p95_latency_ms) : "—"}
          </p>
        </div>

        {/* Failed Requests / Errors */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-none">
          <div className="flex items-center justify-between text-tertiary">
            <span className="text-xs font-normal">Failed requests</span>
            <RiErrorWarningLine className="size-4" aria-hidden="true" />
          </div>
          <div
            className={cn(
              "mt-2 font-mono text-2xl font-normal tabular-nums",
              summary.error_count > 0 ? "text-destructive" : "text-foreground"
            )}
          >
            {summary.error_count.toLocaleString()}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {providers.length > 0
              ? `${onlineCount} online, ${degradedCount} degraded, ${offlineCount} offline`
              : "No active providers"}
          </p>
        </div>
      </div>

      {summary.last_error && (
        <Alert variant="destructive" className="border-destructive/30 bg-destructive/5 text-destructive">
          <RiErrorWarningLine className="size-4" />
          <AlertDescription className="text-xs">
            <span className="font-normal">Recent error ({formatStatusDate(summary.last_error_at)}):</span>{" "}
            {summary.last_error}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
