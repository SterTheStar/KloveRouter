import { useState } from "react";
import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiErrorWarningLine,
  RiTimeLine,
  RiCheckLine,
  RiCloseLine,
  RiShieldFlashLine,
} from "@remixicon/react";
import ProviderIcon from "@/components/ProviderIcon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { StatsProviderHealth, StatsUptimeGroup } from "@/types";
import { StatusBadge } from "./StatusBadge";
import { StatusModelList } from "./StatusModelList";
import {
  formatStatusDate,
  formatPercent,
  formatLatency,
  getUptimeTone,
} from "./status-utils";

interface StatusProviderCardProps {
  provider: StatsProviderHealth;
  groups: StatsUptimeGroup[];
  defaultOpen?: boolean;
}

export function StatusProviderCard({
  provider,
  groups,
  defaultOpen = false,
}: StatusProviderCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  const unverified =
    provider.requests === 0 && !provider.last_test_at && provider.status === "online";
  const testLabel =
    provider.requests === 0 && provider.last_test_at
      ? provider.last_test_success
        ? "Test passed"
        : "Test failed"
      : undefined;
  const effectiveStatus = unverified ? null : provider.status;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-none transition-colors">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
        className={cn(
          "cursor-pointer select-none p-4 transition-colors hover:bg-accent/20",
          open && "border-b border-border bg-accent/5"
        )}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Provider Identity & Status */}
          <div className="flex min-w-0 items-center gap-3">
            <ProviderIcon
              name={provider.provider_name}
              src={provider.avatar}
              sources={provider.avatar_sources}
              className="size-8 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-normal text-foreground">
                  {provider.provider_name}
                </span>
                <StatusBadge
                  status={effectiveStatus}
                  label={testLabel ?? (unverified ? "Not checked" : undefined)}
                />
                <Badge
                  variant={provider.is_active ? "secondary" : "outline"}
                  className="text-xs font-normal"
                >
                  {provider.is_active ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <div className="mt-0.5 text-xs text-tertiary">
                {provider.active_credential_count}{" "}
                {provider.active_credential_count === 1 ? "credential" : "credentials"}
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-6 lg:items-center">
            <div>
              <div className="text-xs text-tertiary">Requests</div>
              <div className="mt-0.5 font-mono text-sm font-normal tabular-nums text-foreground">
                {provider.requests.toLocaleString()}
              </div>
            </div>

            <div>
              <div className="text-xs text-tertiary">Success rate</div>
              <div
                className={cn(
                  "mt-0.5 font-mono text-sm font-normal tabular-nums",
                  provider.requests ? getUptimeTone(provider.uptime_percent) : "text-tertiary"
                )}
              >
                {provider.requests ? formatPercent(provider.uptime_percent) : "—"}
              </div>
            </div>

            <div>
              <div className="text-xs text-tertiary">Avg / P95 latency</div>
              <div className="mt-0.5 font-mono text-sm font-normal tabular-nums text-foreground">
                {provider.requests
                  ? `${formatLatency(provider.avg_latency_ms)} / ${formatLatency(provider.p95_latency_ms)}`
                  : "—"}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs text-tertiary">Errors</div>
                <div
                  className={cn(
                    "mt-0.5 font-mono text-sm font-normal tabular-nums",
                    provider.error_count > 0 ? "text-destructive" : "text-foreground"
                  )}
                >
                  {provider.error_count.toLocaleString()}
                </div>
              </div>

              <div className="shrink-0 text-tertiary">
                {open ? (
                  <RiArrowDownSLine className="size-4" aria-hidden="true" />
                ) : (
                  <RiArrowRightSLine className="size-4" aria-hidden="true" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Diagnostics & Model Breakdown */}
      {open && (
        <div className="border-t border-border bg-card/40 p-4 space-y-4">
          {/* Diagnostic overview tiles */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-border/60 bg-background/50 p-2.5">
              <div className="flex items-center gap-1.5 text-xs text-tertiary">
                <RiTimeLine className="size-3.5" />
                <span>Last request</span>
              </div>
              <div className="mt-1 text-xs text-foreground font-mono">
                {formatStatusDate(provider.last_used_at)}
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/50 p-2.5">
              <div className="flex items-center gap-1.5 text-xs text-tertiary">
                <RiErrorWarningLine className="size-3.5" />
                <span>Last error</span>
              </div>
              <div className="mt-1 text-xs text-foreground font-mono">
                {formatStatusDate(provider.last_error_at)}
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/50 p-2.5">
              <div className="flex items-center gap-1.5 text-xs text-tertiary">
                {provider.last_test_success === false ? (
                  <RiCloseLine className="size-3.5 text-destructive" />
                ) : (
                  <RiCheckLine className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                )}
                <span>Health check</span>
              </div>
              <div className="mt-1 text-xs text-foreground font-mono">
                {provider.last_test_success === null
                  ? "Not run"
                  : provider.last_test_success
                  ? `Passed (${provider.last_test_duration_ms ?? 0}ms)`
                  : "Failed"}
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/50 p-2.5">
              <div className="flex items-center gap-1.5 text-xs text-tertiary">
                <RiShieldFlashLine className="size-3.5" />
                <span>Cooldowns</span>
              </div>
              <div className="mt-1 text-xs text-foreground font-mono">
                {provider.cooldown_count} recorded
              </div>
            </div>
          </div>

          {/* Active Cooldown Warnings */}
          {provider.cooldown_details.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <div className="font-normal flex items-center gap-1.5">
                <RiErrorWarningLine className="size-3.5 shrink-0" />
                <span>Active provider cooldowns</span>
              </div>
              {provider.cooldown_details.map((cooldown) => (
                <div key={cooldown.credential_id} className="pl-5 text-xs">
                  {cooldown.credential_label ?? cooldown.credential_id}:{" "}
                  {cooldown.reason ?? "cooldown"} ({cooldown.remaining_requests} requests
                  remaining, sequence until {cooldown.cooldown_until_sequence})
                </div>
              ))}
            </div>
          )}

          {/* Error Details */}
          {provider.last_error && (
            <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
              <div className="font-normal flex items-center gap-1.5">
                <RiErrorWarningLine className="size-3.5 shrink-0" />
                <span>Latest error</span>
              </div>
              <div className="pl-5 font-mono text-xs break-all">
                {provider.last_error}
              </div>
            </div>
          )}

          {provider.last_test_error && (
            <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
              <div className="font-normal flex items-center gap-1.5">
                <RiErrorWarningLine className="size-3.5 shrink-0" />
                <span>Health check error</span>
              </div>
              <div className="pl-5 font-mono text-xs break-all">
                {provider.last_test_error}
              </div>
            </div>
          )}

          {/* Models Breakdown */}
          {groups.length > 0 ? (
            <StatusModelList groups={groups} />
          ) : (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-tertiary">
              No routed model requests recorded for this provider in the selected period.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
