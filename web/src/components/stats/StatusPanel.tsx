import {
  RiArrowRightSLine as ChevronRight,
  RiCheckboxCircleLine as CheckboxCircleLine,
  RiErrorWarningLine as ErrorWarningLine,
} from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
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
  online: { label: "Online", dot: "bg-foreground/50" },
  degraded: { label: "Degraded", dot: "bg-amber-500" },
  offline: { label: "Offline", dot: "bg-destructive" },
};

const uptimeTone = (value: number) =>
  value >= 99
    ? "text-foreground"
    : value >= 90
      ? "text-amber-600 dark:text-amber-400"
      : "text-destructive";

function StatusBadge({ status }: { status: StatsProviderHealth["status"] }) {
  const meta = statusMeta[status];
  return (
    <Badge variant="outline" className="gap-1.5 pr-2.5">
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  );
}

function StatusBar({ success, errors, label }: { success: number; errors: number; label: string }) {
  const total = success + errors;
  const successWidth = total ? (success / total) * 100 : 0;
  return (
    <div
      className="flex h-1.5 overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={label}
      title={label}
    >
      <div className="bg-foreground/60 transition-all" style={{ width: `${successWidth}%` }} />
      <div className="bg-destructive/70" style={{ width: `${total ? 100 - successWidth : 0}%` }} />
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-heading text-base font-semibold tabular-nums", tone)}>{value}</div>
    </div>
  );
}

function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-destructive">
      <ErrorWarningLine className="size-3.5 shrink-0 translate-y-px" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

function ModelGroups({ groups }: { groups: StatsUptimeGroup[] }) {
  if (!groups.length) return null;
  return (
    <details className="group border-t pt-3">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden="true" />
        Models ({groups.length})
      </summary>
      <div className="mt-2.5 space-y-2">
        {groups.map((group) => (
          <div key={`${group.provider_id}-${group.model_name}`} className="space-y-1.5 rounded-lg bg-muted/40 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <code className="min-w-0 truncate text-xs">{group.model_name}</code>
              <span className={cn("text-xs font-medium tabular-nums", uptimeTone(group.uptime_percent))}>
                {percent(group.uptime_percent)}
              </span>
            </div>
            <StatusBar success={group.success_count} errors={group.error_count} label={`${group.success_count} success, ${group.error_count} errors`} />
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

function ProviderDetails({ provider, groups }: { provider: StatsProviderHealth; groups: StatsUptimeGroup[] }) {
  return (
    <div className="space-y-3 border-t pt-3">
      <div className="grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
        <span>Last use: {date(provider.last_used_at)}</span>
        <span>Last error: {date(provider.last_error_at)}</span>
        <span>Cooldowns: {provider.cooldown_count}</span>
        <span>
          Last test: {date(provider.last_test_at)} · {provider.last_test_success === null ? "—" : provider.last_test_success ? "success" : "error"} · {provider.last_test_duration_ms ?? "—"}ms
        </span>
      </div>
      {provider.last_error && <ErrorLine>{provider.last_error}</ErrorLine>}
      {provider.cooldown_details.length > 0 && (
        <div className="space-y-1 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
          {provider.cooldown_details.map((cooldown) => (
            <div key={cooldown.credential_id} className="break-words">
              {cooldown.credential_label ?? cooldown.credential_id}: {cooldown.reason ?? "cooldown"} ({cooldown.remaining_requests} remaining, until {cooldown.cooldown_until_sequence})
            </div>
          ))}
        </div>
      )}
      {provider.last_test_error && <ErrorLine>{provider.last_test_error}</ErrorLine>}
      <ModelGroups groups={groups} />
    </div>
  );
}

function ProviderRow({ provider, groups }: { provider: StatsProviderHealth; groups: StatsUptimeGroup[] }) {
  return (
    <details className="group rounded-xl border bg-card transition-colors open:border-foreground/20">
      <summary className="list-none cursor-pointer px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-3">
          <ProviderIcon name={provider.provider_name} src={provider.avatar} sources={provider.avatar_sources} className="size-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{provider.provider_name}</div>
            <div className="text-xs text-muted-foreground">
              {provider.is_active ? "Active" : "Inactive"} · {provider.active_credential_count} credentials
            </div>
          </div>
          <div className="hidden items-center gap-6 md:flex">
            <Metric label="Uptime" value={percent(provider.uptime_percent)} tone={uptimeTone(provider.uptime_percent)} />
            <Metric label="Requests" value={provider.requests.toLocaleString()} />
            <Metric label="Latency" value={`${latency(provider.avg_latency_ms)} / ${latency(provider.p95_latency_ms)}`} />
            <Metric label="Errors" value={provider.error_count.toLocaleString()} tone={provider.error_count > 0 ? "text-destructive" : undefined} />
          </div>
          <StatusBadge status={provider.status} />
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
        </div>
        <div className="mt-3 md:hidden">
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Uptime" value={percent(provider.uptime_percent)} tone={uptimeTone(provider.uptime_percent)} />
            <Metric label="Requests" value={provider.requests.toLocaleString()} />
            <Metric label="Errors" value={provider.error_count.toLocaleString()} tone={provider.error_count > 0 ? "text-destructive" : undefined} />
          </div>
        </div>
        <div className="mt-3">
          <StatusBar success={provider.success_count} errors={provider.error_count} label={`${provider.success_count} success, ${provider.error_count} errors`} />
        </div>
      </summary>
      <div className="px-4 pb-4">
        <ProviderDetails provider={provider} groups={groups} />
      </div>
    </details>
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
    summary.error_count === 0 ? "online" : summary.uptime_percent >= 95 ? "degraded" : "offline";

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Global status</CardTitle>
          <CardDescription>Availability and response health across all providers for the selected period.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="sm:col-span-2 lg:col-span-1">
              <div className="text-xs text-muted-foreground">Current state</div>
              <div className="mt-1"><StatusBadge status={globalStatus} /></div>
            </div>
            <Metric label="Uptime" value={percent(summary.uptime_percent)} tone={uptimeTone(summary.uptime_percent)} />
            <Metric label="Requests" value={summary.total_requests.toLocaleString()} />
            <Metric label="Errors" value={summary.error_count.toLocaleString()} tone={summary.error_count > 0 ? "text-destructive" : undefined} />
            <Metric label="Latency · P95" value={`${latency(summary.avg_latency_ms)} / ${latency(summary.p95_latency_ms)}`} />
          </div>
          <StatusBar success={summary.success_count} errors={summary.error_count} label={`${summary.success_count} success, ${summary.error_count} errors`} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{summary.success_count.toLocaleString()} successful requests</span>
            <span>{summary.error_count.toLocaleString()} errors</span>
          </div>
          <details className="group border-t pt-3">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden="true" />
              View diagnostics
            </summary>
            <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              <span>Last use: {date(summary.last_used_at)}</span>
              <span className="break-words">Last error: {date(summary.last_error_at)}{summary.last_error ? ` — ${summary.last_error}` : ""}</span>
            </div>
          </details>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-heading text-base font-semibold">Provider status</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Select a provider to inspect diagnostics and model-level details.</p>
          </div>
          {health.providers.length > 0 && <span className="text-sm text-muted-foreground">{health.providers.length} providers</span>}
        </div>
        <div className="space-y-2">
          {health.providers.map((provider) => (
            <ProviderRow key={provider.provider_id} provider={provider} groups={groupsByProvider.get(provider.provider_id) ?? []} />
          ))}
        </div>
        {historical.length > 0 && (
          <details className="group rounded-xl border bg-card">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
              Historical / unknown providers
              <span className="text-xs font-normal text-muted-foreground">({historical.length})</span>
            </summary>
            <div className="px-4 pb-4"><ModelGroups groups={historical} /></div>
          </details>
        )}
        {!health.providers.length && !uptime.groups.length && (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <CheckboxCircleLine className="mx-auto size-8 text-muted-foreground/60" aria-hidden="true" />
            <h2 className="mt-3 font-heading text-lg font-medium">No provider status yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">Provider health will appear here once requests are routed through Klove.</p>
          </div>
        )}
      </section>
    </div>
  );
}
