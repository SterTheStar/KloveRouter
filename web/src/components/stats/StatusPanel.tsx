import {
  RiArrowRightSLine as ChevronRight,
  RiCheckboxCircleLine as CheckboxCircleLine,
  RiErrorWarningLine as ErrorWarningLine,
} from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import ProviderIcon from "@/components/ProviderIcon";
import { cn } from "@/lib/utils";
import type {
  StatsHealth,
  StatsProviderHealth,
  StatsUptime,
  StatsUptimeGroup,
} from "@/types";

const date = (value: string | null) =>
  value
    ? new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z")).toLocaleString()
    : "—";
const percent = (value: number) => `${value.toFixed(2)}%`;
const latency = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms.toFixed(0)}ms`;

const statusMeta: Record<
  StatsProviderHealth["status"],
  { label: string; dot: string }
> = {
  online: { label: "Online", dot: "bg-emerald-500" },
  degraded: { label: "Degraded", dot: "bg-amber-500" },
  offline: { label: "Offline", dot: "bg-red-500" },
};

const uptimeTone = (value: number) =>
  value >= 99
    ? "text-emerald-600 dark:text-emerald-400"
    : value >= 90
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";

function StatusBadge({ status }: { status: StatsProviderHealth["status"] }) {
  const meta = statusMeta[status];
  return (
    <Badge variant="outline" className="gap-1.5 pr-2.5">
      <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  );
}

function StatusBar({ success, errors, label }: { success: number; errors: number; label: string }) {
  const total = success + errors;
  const successWidth = total ? (success / total) * 100 : 0;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-muted" title={label}>
      <div className="bg-emerald-500 transition-all" style={{ width: `${successWidth}%` }} />
      <div className="bg-red-500" style={{ width: `${total ? 100 - successWidth : 0}%` }} />
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="rounded-lg bg-muted/50 px-2.5 py-2">
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 font-heading text-lg font-semibold tabular-nums",
          tone,
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-destructive">
      <ErrorWarningLine className="size-3.5 shrink-0 translate-y-px" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

function ModelGroups({ groups }: { groups: StatsUptimeGroup[] }) {
  if (!groups.length) return null;
  return (
    <details className="group border-t pt-2.5">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
        Models ({groups.length})
      </summary>
      <div className="mt-2.5 space-y-2">
        {groups.map((group) => (
          <div
            key={`${group.provider_id}-${group.model_name}`}
            className="space-y-1.5 rounded-lg bg-muted/40 px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2 text-sm">
              <code className="min-w-0 truncate text-xs">{group.model_name}</code>
              <span className={cn("text-xs font-medium tabular-nums", uptimeTone(group.uptime_percent))}>
                {percent(group.uptime_percent)}
              </span>
            </div>
            <StatusBar
              success={group.success_count}
              errors={group.error_count}
              label={`${group.success_count} success, ${group.error_count} errors`}
            />
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-4">
              <span>Requests {group.total_requests.toLocaleString()}</span>
              <span>Avg {latency(group.avg_latency_ms)}</span>
              <span>P95 {latency(group.p95_latency_ms)}</span>
              <span>Last use {date(group.last_used_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function ProviderCard({ provider, groups }: { provider: StatsProviderHealth; groups: StatsUptimeGroup[] }) {
  return (
    <Card size="sm" className="min-w-0">
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <ProviderIcon name={provider.provider_name} src={provider.avatar} sources={provider.avatar_sources} className="size-9" />
            <span
              className={cn(
                "absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-card",
                statusMeta[provider.status].dot,
              )}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{provider.provider_name}</div>
            <div className="text-xs text-muted-foreground">
              {provider.is_active ? "Active" : "Inactive"} · {provider.active_credential_count} credentials
            </div>
          </div>
          <StatusBadge status={provider.status} />
        </div>
        <StatusBar
          success={provider.success_count}
          errors={provider.error_count}
          label={`${provider.success_count} success, ${provider.error_count} errors`}
        />
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          <Metric label="Requests" value={provider.requests.toLocaleString()} />
          <Metric label="Uptime" value={percent(provider.uptime_percent)} tone={uptimeTone(provider.uptime_percent)} />
          <Metric label="Avg latency" value={latency(provider.avg_latency_ms)} />
          <Metric label="P95" value={latency(provider.p95_latency_ms)} />
          <Metric
            label="Errors"
            value={provider.error_count.toLocaleString()}
            tone={provider.error_count > 0 ? "text-destructive" : undefined}
          />
        </div>
        <div className="grid gap-x-4 gap-y-1 border-t pt-2.5 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
          <span>Last use: {date(provider.last_used_at)}</span>
          <span>Last error: {date(provider.last_error_at)}</span>
          <span>Cooldowns: {provider.cooldown_count}</span>
          <span>
            Last test: {date(provider.last_test_at)} · {provider.last_test_success === null ? "—" : provider.last_test_success ? "success" : "error"} · {provider.last_test_duration_ms ?? "—"}ms
          </span>
        </div>
        {provider.last_error && <ErrorLine>{provider.last_error}</ErrorLine>}
        {provider.cooldown_details.length > 0 && (
          <div className="space-y-1 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
            {provider.cooldown_details.map((cooldown) => (
              <div key={cooldown.credential_id} className="break-words">
                {cooldown.credential_label ?? cooldown.credential_id}: {cooldown.reason ?? "cooldown"} ({cooldown.remaining_requests} remaining, until {cooldown.cooldown_until_sequence})
              </div>
            ))}
          </div>
        )}
        {provider.last_test_error && <ErrorLine>{provider.last_test_error}</ErrorLine>}
        <ModelGroups groups={groups} />
      </CardContent>
    </Card>
  );
}

export function StatusPanel({ uptime, health }: { uptime: StatsUptime; health: StatsHealth }) {
  const groupsByProvider = new Map<string, StatsUptimeGroup[]>();
  for (const group of uptime.groups) {
    if (group.provider_id) groupsByProvider.set(group.provider_id, [...(groupsByProvider.get(group.provider_id) ?? []), group]);
  }
  const knownProviderIds = new Set(health.providers.map((provider) => provider.provider_id));
  const historical = uptime.groups.filter((group) => !group.provider_id || !knownProviderIds.has(group.provider_id));
  const summary = uptime.summary;
  const globalStatus: StatsProviderHealth["status"] =
    summary.error_count === 0
      ? "online"
      : summary.uptime_percent >= 95
        ? "degraded"
        : "offline";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Global uptime</CardTitle>
          <CardDescription>
            Success ratio and latency across all providers for the selected
            period.
          </CardDescription>
          <CardAction>
            <StatusBadge status={globalStatus} />
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <div
                className={cn(
                  "font-heading text-4xl font-semibold tracking-tight tabular-nums",
                  uptimeTone(summary.uptime_percent),
                )}
              >
                {percent(summary.uptime_percent)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                uptime across {summary.total_requests.toLocaleString()} requests
              </div>
            </div>
            <div className="flex gap-6">
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Avg latency</div>
                <div className="mt-0.5 font-heading text-lg font-semibold tabular-nums">
                  {latency(summary.avg_latency_ms)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">P95</div>
                <div className="mt-0.5 font-heading text-lg font-semibold tabular-nums">
                  {latency(summary.p95_latency_ms)}
                </div>
              </div>
            </div>
          </div>
          <StatusBar
            success={summary.success_count}
            errors={summary.error_count}
            label={`${summary.success_count} success, ${summary.error_count} errors`}
          />
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
              Success
              <span className="font-medium tabular-nums text-foreground">
                {summary.success_count.toLocaleString()}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-full bg-red-500" />
              Errors
              <span className="font-medium tabular-nums text-foreground">
                {summary.error_count.toLocaleString()}
              </span>
            </span>
          </div>
          <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <span>Last use: {date(summary.last_used_at)}</span>
            <span className="break-words">
              Last error: {date(summary.last_error_at)}
              {summary.last_error ? ` — ${summary.last_error}` : ""}
            </span>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-3">
        <h2 className="font-heading text-base font-semibold">
          Provider status
          {health.providers.length > 0 && (
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">
              ({health.providers.length})
            </span>
          )}
        </h2>
        <div className="grid items-start gap-3 xl:grid-cols-2">
          {health.providers.map((provider) => (
            <ProviderCard key={provider.provider_id} provider={provider} groups={groupsByProvider.get(provider.provider_id) ?? []} />
          ))}
        </div>
        {historical.length > 0 && (
          <Card size="sm">
            <CardContent className="space-y-2.5">
              <div className="font-medium">Historical / unknown providers</div>
              <ModelGroups groups={historical} />
            </CardContent>
          </Card>
        )}
        {!health.providers.length && !uptime.groups.length && (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <CheckboxCircleLine className="mx-auto size-8 text-muted-foreground/60" />
            <h2 className="mt-3 font-heading text-lg font-medium">
              No provider status yet
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Provider health will appear here once requests are routed through
              Klove.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
