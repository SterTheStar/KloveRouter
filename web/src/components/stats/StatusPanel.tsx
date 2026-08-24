import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ProviderIcon from "@/components/ProviderIcon";
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
const statusVariant = (status: StatsProviderHealth["status"]) =>
  status === "online" ? "default" : status === "degraded" ? "secondary" : "destructive";

function StatusBar({ success, errors, label }: { success: number; errors: number; label: string }) {
  const total = success + errors;
  const successWidth = total ? (success / total) * 100 : 0;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-muted" title={label}>
      <div className="bg-white dark:bg-white" style={{ width: `${successWidth}%` }} />
      <div className="bg-destructive" style={{ width: `${total ? 100 - successWidth : 0}%` }} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-muted/50 px-2 py-1.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}

function ModelGroups({ groups }: { groups: StatsUptimeGroup[] }) {
  if (!groups.length) return null;
  return (
    <details open className="border-t pt-3">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
        Models ({groups.length})
      </summary>
      <div className="mt-2 space-y-3">
        {groups.map((group) => (
          <div key={`${group.provider_id}-${group.model_name}`} className="space-y-1.5">
            <div className="flex justify-between gap-2 text-sm">
              <code className="min-w-0 truncate">{group.model_name}</code>
              <span className="text-muted-foreground">{percent(group.uptime_percent)}</span>
            </div>
            <StatusBar
              success={group.success_count}
              errors={group.error_count}
              label={`${group.success_count} success, ${group.error_count} errors`}
            />
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
              <span>Requests {group.total_requests}</span>
              <span>Avg {group.avg_latency_ms.toFixed(0)}ms</span>
              <span>P95 {group.p95_latency_ms.toFixed(0)}ms</span>
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
          <ProviderIcon name={provider.provider_name} src={provider.avatar} sources={provider.avatar_sources} className="size-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{provider.provider_name}</div>
            <div className="text-xs text-muted-foreground">
              {provider.is_active ? "Active" : "Inactive"} · {provider.active_credential_count} credentials
            </div>
          </div>
          <Badge variant={statusVariant(provider.status)}>{provider.status}</Badge>
        </div>
        <StatusBar
          success={provider.success_count}
          errors={provider.error_count}
          label={`${provider.success_count} success, ${provider.error_count} errors`}
        />
        <div className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-5">
          <Metric label="Requests" value={provider.requests} />
          <Metric label="Uptime" value={percent(provider.uptime_percent)} />
          <Metric label="Avg" value={`${provider.avg_latency_ms.toFixed(0)}ms`} />
          <Metric label="P95" value={`${provider.p95_latency_ms.toFixed(0)}ms`} />
          <Metric label="Errors" value={provider.error_count} />
        </div>
        <div className="grid gap-2 border-t pt-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
          <span>Last use: {date(provider.last_used_at)}</span>
          <span>Last error: {date(provider.last_error_at)}</span>
          <span>Cooldowns: {provider.cooldown_count}</span>
          <span>
            Last test: {date(provider.last_test_at)} · {provider.last_test_success === null ? "—" : provider.last_test_success ? "success" : "error"} · {provider.last_test_duration_ms ?? "—"}ms
          </span>
        </div>
        {provider.last_error && <p className="break-words text-xs text-destructive">{provider.last_error}</p>}
        {provider.cooldown_details.length > 0 && (
          <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
            {provider.cooldown_details.map((cooldown) => (
              <div key={cooldown.credential_id}>
                {cooldown.credential_label ?? cooldown.credential_id}: {cooldown.reason ?? "cooldown"} ({cooldown.remaining_requests} remaining, until {cooldown.cooldown_until_sequence})
              </div>
            ))}
          </div>
        )}
        {provider.last_test_error && <p className="break-words text-xs text-destructive">{provider.last_test_error}</p>}
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

  return (
    <div className="space-y-4">
      <Card size="sm">
        <CardHeader><CardTitle>Global uptime</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-6">
            <span>Requests<strong className="block text-lg">{summary.total_requests}</strong></span>
            <span>Success<strong className="block text-lg">{summary.success_count}</strong></span>
            <span>Errors<strong className="block text-lg">{summary.error_count}</strong></span>
            <span>Uptime<strong className="block text-lg">{percent(summary.uptime_percent)}</strong></span>
            <span>Avg<strong className="block text-lg">{summary.avg_latency_ms.toFixed(0)}ms</strong></span>
            <span>P95<strong className="block text-lg">{summary.p95_latency_ms.toFixed(0)}ms</strong></span>
          </div>
          <StatusBar success={summary.success_count} errors={summary.error_count} label={`${summary.success_count} success, ${summary.error_count} errors`} />
          <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <span>Last use: {date(summary.last_used_at)}</span>
            <span>Last error: {date(summary.last_error_at)}{summary.last_error ? ` — ${summary.last_error}` : ""}</span>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-3">
        <h2 className="text-sm font-medium">Provider status</h2>
        {health.providers.map((provider) => (
          <ProviderCard key={provider.provider_id} provider={provider} groups={groupsByProvider.get(provider.provider_id) ?? []} />
        ))}
        {historical.length > 0 && (
          <Card size="sm"><CardContent><div className="mb-3 font-medium">Historical / unknown provider</div><ModelGroups groups={historical} /></CardContent></Card>
        )}
        {!health.providers.length && !uptime.groups.length && <p className="text-sm text-muted-foreground">No provider status yet.</p>}
      </div>
    </div>
  );
}
