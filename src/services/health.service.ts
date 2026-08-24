import { getDb } from "../db/connection";
import { requestLogService } from "./request-log.service";
import { providerService } from "./provider.service";
import { avatarMediaUrl, isDataAvatar } from "./avatar.service";

export type HealthStatus = "online" | "degraded" | "offline";

export interface UptimeGroup {
  provider_id: string | null;
  provider_name: string;
  model_name: string;
  total_requests: number;
  success_count: number;
  error_count: number;
  success_rate: number;
  uptime_percent: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  last_used_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
}

export interface UptimeSummary {
  total_requests: number;
  success_count: number;
  error_count: number;
  uptime_percent: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  last_used_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
}

export interface CooldownDetail {
  credential_id: string;
  credential_label: string | null;
  remaining_requests: number;
  cooldown_until_sequence: number;
  reason: string | null;
  updated_at: string;
}

export interface ProviderHealth {
  provider_id: string;
  provider_name: string;
  avatar: string | null;
  avatar_sources: string[];
  is_active: boolean;
  active_credential_count: number;
  status: HealthStatus;
  requests: number;
  success_count: number;
  error_count: number;
  uptime_percent: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  cooldown_count: number;
  cooldowns: number;
  cooldown_details: CooldownDetail[];
  last_used_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  last_test_at: string | null;
  last_test_success: boolean | null;
  last_test_error: string | null;
  last_test_duration_ms: number | null;
}

function p95(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

function periodFilter(days: number): { sql: string; args: string[] } {
  return days > 0
    ? { sql: " AND created_at >= datetime('now', ? || ' days')", args: [`-${days}`] }
    : { sql: "", args: [] };
}

const MAX_DAYS = 90;
const MAX_ERROR_LENGTH = 500;
type RequestRow = { provider_id: string | null; provider_name: string; model_name: string; status: string; duration_ms: number | null; created_at: string; completed_at: string | null; error_message: string | null };
type Aggregation = { summary: UptimeSummary; groups: UptimeGroup[]; providers: Map<string, UptimeSummary> };

function normalizeDays(days: number): number {
  return Math.min(MAX_DAYS, Math.max(0, Number.isFinite(days) ? days : 0));
}
function errorText(value: string | null | undefined): string | null { return value == null ? null : value.slice(0, MAX_ERROR_LENGTH); }
function aggregate(rows: RequestRow[]): Aggregation {
  const grouped = new Map<string, UptimeGroup & { latencies: number[] }>();
  for (const row of rows) {
    const key = `${row.provider_id ?? row.provider_name}\u0000${row.model_name}`;
    let group = grouped.get(key);
    if (!group) { group = { provider_id: row.provider_id, provider_name: row.provider_name, model_name: row.model_name, total_requests: 0, success_count: 0, error_count: 0, success_rate: 0, uptime_percent: 0, avg_latency_ms: 0, p95_latency_ms: 0, last_used_at: null, last_error_at: null, last_error: null, latencies: [] }; grouped.set(key, group); }
    group.total_requests++;
    if (row.status === "success") group.success_count++; else { group.error_count++; group.last_error_at = row.completed_at ?? row.created_at; group.last_error = errorText(row.error_message); }
    group.last_used_at = row.completed_at ?? row.created_at;
    if (row.duration_ms != null) group.latencies.push(row.duration_ms);
  }
  const groups = [...grouped.values()].map(({ latencies, ...group }) => { const avg = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0; return { ...group, success_rate: group.total_requests ? group.success_count / group.total_requests : 0, uptime_percent: group.total_requests ? (group.success_count / group.total_requests) * 100 : 0, avg_latency_ms: avg, p95_latency_ms: p95(latencies) }; });
  const latencies = rows.flatMap((row) => row.duration_ms == null ? [] : [row.duration_ms]);
  const successCount = rows.filter((row) => row.status === "success").length;
  const lastError = rows.filter((row) => row.status === "error").at(-1);
  const summary: UptimeSummary = { total_requests: rows.length, success_count: successCount, error_count: rows.length - successCount, uptime_percent: rows.length ? (successCount / rows.length) * 100 : 0, avg_latency_ms: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0, p95_latency_ms: p95(latencies), last_used_at: rows.at(-1) ? (rows.at(-1)!.completed_at ?? rows.at(-1)!.created_at) : null, last_error_at: lastError ? (lastError.completed_at ?? lastError.created_at) : null, last_error: errorText(lastError?.error_message) };
  const providerStats = new Map<string, { summary: UptimeSummary; latencies: number[] }>();
  for (const row of rows) {
    if (!row.provider_id) continue;
    const current = providerStats.get(row.provider_id) ?? { summary: { total_requests: 0, success_count: 0, error_count: 0, uptime_percent: 0, avg_latency_ms: 0, p95_latency_ms: 0, last_used_at: null, last_error_at: null, last_error: null }, latencies: [] };
    current.summary.total_requests++; if (row.status === "success") current.summary.success_count++; else { current.summary.error_count++; current.summary.last_error_at = row.completed_at ?? row.created_at; current.summary.last_error = errorText(row.error_message); }
    current.summary.last_used_at = row.completed_at ?? row.created_at; if (row.duration_ms != null) current.latencies.push(row.duration_ms); providerStats.set(row.provider_id, current);
  }
  const providers = new Map<string, UptimeSummary>();
  for (const [id, value] of providerStats) { value.summary.uptime_percent = value.summary.total_requests ? (value.summary.success_count / value.summary.total_requests) * 100 : 0; value.summary.avg_latency_ms = value.latencies.length ? value.latencies.reduce((a, b) => a + b, 0) / value.latencies.length : 0; value.summary.p95_latency_ms = p95(value.latencies); providers.set(id, value.summary); }
  return { summary, groups, providers };
}
function requestAggregation(days: number): Aggregation {
  const db = getDb(); requestLogService.cleanupStale(); const filter = periodFilter(days);
  const rows = db.query(`SELECT provider_id, provider_name, model_name, status, duration_ms, created_at, completed_at, error_message FROM request_logs WHERE status IN ('success', 'error')${filter.sql} ORDER BY created_at ASC`).all(...filter.args) as RequestRow[];
  return aggregate(rows);
}

export const healthService = {
  getUptime(days = 0) { const period = normalizeDays(days); const { summary, groups } = requestAggregation(period); return { days: period, summary, global: summary, groups }; },
  getHealth(days = 0): { days: number; providers: ProviderHealth[] } {
    const db = getDb(); const period = normalizeDays(days); const { providers: requestStats } = requestAggregation(period);
    const providers = db.query(`SELECT p.id provider_id, p.name provider_name, p.is_active, p.last_test_at, p.last_test_success, p.last_test_error, p.last_test_duration_ms, (SELECT COUNT(*) FROM provider_credentials c WHERE c.provider_id = p.id AND c.is_active = 1 AND ((p.protocol = 'codex' AND c.kind = 'codex' AND c.access_token IS NOT NULL) OR (p.protocol = 'chatgpt' AND c.kind = 'chatgpt' AND (c.secret IS NOT NULL OR c.access_token IS NOT NULL)) OR (p.protocol = 'antigravity' AND c.kind = 'antigravity' AND c.refresh_token IS NOT NULL) OR (p.protocol = 'freebuff' AND c.kind = 'freebuff' AND c.secret IS NOT NULL) OR (p.protocol = 'qwen' AND c.kind = 'qwen' AND c.secret IS NOT NULL) OR (p.protocol = 'atomesus' AND c.kind = 'atomesus' AND c.secret IS NOT NULL) OR (p.protocol = 'conol' AND c.kind = 'conol' AND c.secret IS NOT NULL AND c.account_id IS NOT NULL) OR (p.protocol NOT IN ('codex', 'chatgpt', 'antigravity', 'freebuff', 'qwen', 'atomesus', 'conol') AND c.kind = 'api_key' AND c.secret IS NOT NULL))) active_credential_count FROM providers p ORDER BY p.name`).all() as Array<any>;
    return { days: period, providers: providers.map((provider) => {
      const stats = requestStats.get(provider.provider_id) ?? { total_requests: 0, success_count: 0, error_count: 0, uptime_percent: 0, avg_latency_ms: 0, p95_latency_ms: 0, last_used_at: null, last_error_at: null, last_error: null }; const requests = stats.total_requests; const successCount = stats.success_count; const errorCount = stats.error_count;
      const cooldownDetails = db.query(`SELECT cd.credential_id, c.label credential_label, cd.remaining_requests, cd.cooldown_until_sequence, cd.reason, cd.updated_at FROM provider_credential_cooldown cd LEFT JOIN provider_credentials c ON c.id = cd.credential_id WHERE cd.provider_id = ? AND (cd.remaining_requests > 0 OR cd.cooldown_until_sequence > 0) ORDER BY cd.updated_at DESC`).all(provider.provider_id) as CooldownDetail[];
      const status: HealthStatus = !provider.is_active || provider.active_credential_count === 0 || cooldownDetails.length > 0 || (requests > 0 && errorCount === requests) ? "offline" : errorCount > 0 || provider.last_test_success === 0 ? "degraded" : "online"; const appearance = providerService.findPublicById(provider.provider_id); const avatar = appearance?.avatar && isDataAvatar(appearance.avatar) ? avatarMediaUrl(provider.provider_id, appearance.avatar) : appearance?.avatar ?? null;
      return { provider_id: provider.provider_id, provider_name: provider.provider_name, avatar, avatar_sources: appearance?.avatar_sources ?? [], is_active: Boolean(provider.is_active), active_credential_count: Number(provider.active_credential_count), status, requests, success_count: successCount, error_count: errorCount, uptime_percent: stats.uptime_percent, avg_latency_ms: stats.avg_latency_ms, p95_latency_ms: stats.p95_latency_ms, cooldown_count: cooldownDetails.length, cooldowns: cooldownDetails.length, cooldown_details: cooldownDetails, last_used_at: stats.last_used_at, last_error_at: stats.last_error_at, last_error: stats.last_error, last_test_at: provider.last_test_at, last_test_success: provider.last_test_success == null ? null : Boolean(provider.last_test_success), last_test_error: errorText(provider.last_test_error), last_test_duration_ms: provider.last_test_duration_ms };
    }) };
  },
  recordTest(providerId: string, success: boolean, durationMs: number, error?: string) { getDb().query(`UPDATE providers SET last_test_at = datetime('now'), last_test_success = ?, last_test_error = ?, last_test_duration_ms = ?, updated_at = datetime('now') WHERE id = ?`).run(success ? 1 : 0, success ? null : errorText(error ?? "Test failed"), durationMs, providerId); },
};
