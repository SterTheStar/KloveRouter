import {
  RiArrowRightSLine as ChevronRight,
  RiErrorWarningLine as ErrorWarningLine,
} from "@remixicon/react";
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

const statusMeta: Record<StatsProviderHealth["status"], { label: string; dot: string; text: string }> = {
  online: { label: "Online", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
  degraded: { label: "Degraded", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  offline: { label: "Offline", dot: "bg-destructive", text: "text-destructive" },
};

const uptimeTone = (value: number) =>
  value >= 99
    ? "text-foreground"
    : value >= 90
      ? "text-amber-600 dark:text-amber-400"
      : "text-destructive";

function StatusBadge({ status, label }: { status: StatsProviderHealth["status"] | null; label?: string }) {
  const meta = status ? statusMeta[status] : { label: label ?? "Not checked", dot: "bg-muted-foreground/50", text: "text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs", meta.text)}>
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />{label ?? meta.label}
    </span>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-sm font-medium tabular-nums", tone)}>{value}</div>
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
    <details className="group mt-4">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden="true" />
        Models ({groups.length})
      </summary>
      <div className="mt-3 space-y-2">
        {groups.map((group) => (
          <div key={`${group.provider_id}-${group.model_name}`} className="grid gap-x-4 gap-y-1 rounded-md bg-muted/45 px-3 py-2 sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] sm:items-center">
            <code className="min-w-0 truncate text-xs">{group.model_name}</code>
            <span className="text-xs text-muted-foreground">{group.total_requests.toLocaleString()} requests</span>
            <span className={cn("text-xs tabular-nums", uptimeTone(group.uptime_percent))}>{percent(group.uptime_percent)} success</span>
            <span className="text-xs text-muted-foreground">P95 {latency(group.p95_latency_ms)}</span>
            <span className="text-xs text-muted-foreground">Last {date(group.last_used_at)}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function ProviderDetails({ provider, groups }: { provider: StatsProviderHealth; groups: StatsUptimeGroup[] }) {
  return (
    <div className="space-y-4 pt-1">
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
        <div className="space-y-1 text-xs text-amber-700 dark:text-amber-400">
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
  const unverified = provider.requests === 0 && !provider.last_test_at && provider.status === "online";
  const testLabel = provider.requests === 0 && provider.last_test_at
    ? provider.last_test_success ? "Test passed" : "Test failed"
    : undefined;
  const shownStatus = unverified ? null : provider.status;
  return (
    <details className="group rounded-xl bg-card px-4">
      <summary className="list-none cursor-pointer py-4 [&::-webkit-details-marker]:hidden">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(5rem,0.65fr))_auto_auto] md:items-center">
          <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
            <ProviderIcon name={provider.provider_name} src={provider.avatar} sources={provider.avatar_sources} className="size-8 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{provider.provider_name}</div>
              <div className="text-xs text-muted-foreground">
                {provider.is_active ? "Enabled" : "Disabled"} · {provider.active_credential_count} active {provider.active_credential_count === 1 ? "credential" : "credentials"}
              </div>
            </div>
          </div>
          <Metric label="Requests" value={provider.requests.toLocaleString()} />
          <Metric label="Success" value={provider.requests ? percent(provider.uptime_percent) : "—"} tone={provider.requests ? uptimeTone(provider.uptime_percent) : undefined} />
          <Metric label="Avg / P95 latency" value={provider.requests ? `${latency(provider.avg_latency_ms)} / ${latency(provider.p95_latency_ms)}` : "—"} />
          <Metric label="Errors" value={provider.error_count.toLocaleString()} tone={provider.error_count > 0 ? "text-destructive" : undefined} />
          <div className="col-span-2 flex items-center justify-between gap-2 md:col-span-1 md:justify-end">
            <StatusBadge status={shownStatus} label={testLabel ?? (unverified ? "Not checked" : undefined)} />
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
          </div>
        </div>
      </summary>
      <div className="pb-4 pl-11">
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
  return (
    <div className="space-y-7">
      <section className="space-y-4 rounded-xl bg-card p-5" aria-labelledby="overall-status-title">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="overall-status-title" className="text-base font-semibold">All providers</h2>
          <span className="text-xs text-muted-foreground">{summary.total_requests.toLocaleString()} requests · {summary.success_count.toLocaleString()} succeeded · {summary.error_count.toLocaleString()} failed</span>
        </div>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <Metric label="Success rate" value={summary.total_requests ? percent(summary.uptime_percent) : "—"} tone={summary.total_requests ? uptimeTone(summary.uptime_percent) : undefined} />
          <Metric label="Average latency" value={summary.total_requests ? latency(summary.avg_latency_ms) : "—"} />
          <Metric label="P95 latency" value={summary.total_requests ? latency(summary.p95_latency_ms) : "—"} />
        </div>
        {summary.last_error && <ErrorLine>Last error · {date(summary.last_error_at)} · {summary.last_error}</ErrorLine>}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-heading text-base font-semibold">Providers</h2>
          </div>
          {health.providers.length > 0 && <span className="text-sm text-muted-foreground">{health.providers.length} providers</span>}
        </div>
        <div className="space-y-3">
          {health.providers.map((provider) => (
            <ProviderRow key={provider.provider_id} provider={provider} groups={groupsByProvider.get(provider.provider_id) ?? []} />
          ))}
        </div>
        {historical.length > 0 && (
          <details className="group rounded-xl bg-card px-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 py-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
              Historical / unknown providers
              <span className="text-xs font-normal text-muted-foreground">({historical.length})</span>
            </summary>
            <div className="pb-4 pl-5"><ModelGroups groups={historical} /></div>
          </details>
        )}
        {!health.providers.length && !uptime.groups.length && (
          <div className="py-8 text-sm text-muted-foreground">
            <p>No requests in this period.</p>
            <p className="mt-1 text-xs">Provider health will appear here after the first routed request.</p>
          </div>
        )}
      </section>
    </div>
  );
}
