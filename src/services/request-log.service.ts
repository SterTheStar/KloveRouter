import { getDb } from "../db/connection";

export type RequestLogStatus = "pending" | "success" | "error";

export interface RequestLog {
  id: string;
  provider_id: string | null;
  provider_name: string;
  model_name: string;
  client_ip: string | null;
  requester_name: string | null;
  credential_label: string | null;
  credential_identity: string | null;
  status: RequestLogStatus;
  status_code: number | null;
  tokens_prompt: number;
  tokens_completion: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
  tokens_total: number;
  estimated_cost_usd: number;
  tps: number | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface RequestLogDetails extends RequestLog {
  request_details: unknown;
  response_details: unknown;
  error_details: unknown;
}

const SENSITIVE_KEY = /authorization|api[-_]?key|cookie|token|secret|password|credential|private[-_]?key|access[-_]?key/i;
const MAX_DETAIL_BYTES = 64 * 1024;
const TRUNCATION_MARKER = "[truncated]";

function limitString(value: string, max = MAX_DETAIL_BYTES): string {
  if (value.length <= max) return value;
  const suffix = `… ${TRUNCATION_MARKER}`;
  return `${value.slice(0, Math.max(0, max - suffix.length))}${suffix}`;
}

export function redactLogDetail(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") return limitString(value);
  if (typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactLogDetail(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [
      key, SENSITIVE_KEY.test(key) ? "[redacted]" : redactLogDetail(item, depth + 1),
    ]));
  }
  return value;
}

function serializeDetail(value: unknown): string | null {
  if (value == null) return null;
  try {
    const serialized = JSON.stringify(redactLogDetail(value));
    if (serialized.length <= MAX_DETAIL_BYTES) return serialized;
    return JSON.stringify({
      _truncated: true,
      _original_bytes: serialized.length,
      value_preview: limitString(serialized, MAX_DETAIL_BYTES - 96),
    });
  } catch {
    return JSON.stringify({ _truncated: true, value: "[unavailable]" });
  }
}

function parseDetail(value: string | null): unknown {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return value; }
}

function requestId() {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  return `req_${stamp}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

export const requestLogService = {
  cleanupStale() {
    getDb()
      .query(
        "UPDATE request_logs SET status = 'error', status_code = 499, error_message = 'Client disconnected or request timed out', completed_at = datetime('now') WHERE status = 'pending' AND created_at < datetime('now', '-30 minutes')",
      )
      .run();
  },

  start(input: {
    providerId: string;
    providerName: string;
    modelName: string;
    clientIp?: string | null;
    requesterName?: string | null;
    requestDetails?: unknown;
  }) {
    const id = requestId();
    getDb()
      .query(
        "INSERT INTO request_logs (id, provider_id, provider_name, model_name, client_ip, requester_name, request_details) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.providerId,
        input.providerName,
        input.modelName,
        input.clientIp ?? null,
        input.requesterName ?? null,
        serializeDetail(input.requestDetails),
      );
    return id;
  },

  setCredential(
    id: string,
    credential: {
      label?: string | null;
      account_id?: string | null;
      email?: string | null;
      project_id?: string | null;
    },
  ) {
    const identity =
      credential.email ||
      credential.account_id ||
      credential.project_id ||
      null;
    getDb()
      .query(
        "UPDATE request_logs SET credential_label = ?, credential_identity = ? WHERE id = ?",
      )
      .run(credential.label ?? null, identity, id);
  },

  complete(
    id: string,
    input: {
      status?: RequestLogStatus;
      statusCode?: number;
      promptTokens?: number;
      completionTokens?: number;
      cacheRead?: number;
      cacheWrite?: number;
      cost?: number;
      durationMs?: number;
      tps?: number | null;
      error?: string | null;
      responseDetails?: unknown;
      errorDetails?: unknown;
    },
  ) {
    const db = getDb();
    const prompt = input.promptTokens ?? 0;
    const completion = input.completionTokens ?? 0;
    const cacheRead = input.cacheRead ?? 0;
    const cacheWrite = input.cacheWrite ?? 0;
    let cost = input.cost;
    if (cost === undefined && prompt + completion > 0) {
      const request = db
        .query("SELECT provider_id, model_name FROM request_logs WHERE id = ?")
        .get(id) as { provider_id: string | null; model_name: string } | null;
      const tier = request?.provider_id
        ? (db
            .query(
              "SELECT t.input_per_million, t.output_per_million, t.cache_read_per_million, t.cache_write_per_million FROM model_pricing_tiers t JOIN models m ON m.id = t.model_id WHERE m.provider_id = ? AND m.model_id = ? AND t.threshold_tokens <= ? ORDER BY t.threshold_tokens DESC LIMIT 1",
            )
            .get(request.provider_id, request.model_name, prompt) as {
            input_per_million: number;
            output_per_million: number;
            cache_read_per_million: number;
            cache_write_per_million: number;
          } | null)
        : null;
      cost = tier
        ? (Math.max(0, prompt - cacheRead) * tier.input_per_million +
            completion * tier.output_per_million +
            cacheRead * tier.cache_read_per_million +
            cacheWrite * tier.cache_write_per_million) /
          1_000_000
        : 0;
    }
    db.query(
      "UPDATE request_logs SET status = ?, status_code = ?, tokens_prompt = ?, tokens_completion = ?, tokens_cache_read = ?, tokens_cache_write = ?, tokens_total = ?, estimated_cost_usd = ?, duration_ms = ?, tps = ?, error_message = ?, response_details = COALESCE(?, response_details), error_details = COALESCE(?, error_details), completed_at = datetime('now') WHERE id = ? AND status = 'pending'",
    ).run(
      input.status ?? "success",
      input.statusCode ?? 200,
      prompt,
      completion,
      cacheRead,
      cacheWrite,
      prompt + completion,
      cost ?? 0,
      input.durationMs ?? null,
      input.tps ??
        (input.durationMs && input.durationMs > 0
          ? completion / (input.durationMs / 1000)
          : null),
      typeof redactLogDetail(input.error) === "string" ? redactLogDetail(input.error) as string : input.error ? JSON.stringify(redactLogDetail(input.error)) : null,
      serializeDetail(input.responseDetails ?? { status_code: input.statusCode ?? 200 }),
      serializeDetail(input.errorDetails ?? (input.error ? { message: input.error } : null)),
      id,
    );
  },

  captureResponse(id: string, response: { status?: number; headers?: Headers | Record<string, string | undefined>; contentType?: string | null; streaming?: boolean }) {
    try {
      const headers = response.headers instanceof Headers
        ? Object.fromEntries(response.headers.entries())
        : response.headers;
      getDb().query("UPDATE request_logs SET response_details = ? WHERE id = ?")
        .run(serializeDetail({ status: response.status, headers, content_type: response.contentType, streaming: response.streaming }), id);
    } catch { /* Logging must never affect the request. */ }
  },

  captureError(id: string, error: unknown) {
    try {
      getDb().query("UPDATE request_logs SET error_details = ? WHERE id = ?")
        .run(serializeDetail(error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error), id);
    } catch { /* Logging must never affect the request. */ }
  },

  get(id: string): RequestLogDetails | null {
    const row = getDb().query("SELECT * FROM request_logs WHERE id = ?").get(id) as (RequestLog & { request_details: string | null; response_details: string | null; error_details: string | null }) | null;
    if (!row) return null;
    return { ...row, request_details: parseDetail(row.request_details), response_details: parseDetail(row.response_details), error_details: parseDetail(row.error_details) };
  },

  list(
    input: {
      limit?: number;
      offset?: number;
      status?: string;
      provider?: string;
      search?: string;
    } = {},
  ) {
    const db = getDb();
    this.cleanupStale();
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const offset = Math.max(input.offset ?? 0, 0);
    const clauses: string[] = [];
    const values: (string | number)[] = [];
    if (
      input.status &&
      ["pending", "success", "error"].includes(input.status)
    ) {
      clauses.push("status = ?");
      values.push(input.status);
    }
    if (input.provider) {
      clauses.push("provider_name = ?");
      values.push(input.provider);
    }
    if (input.search) {
      clauses.push(
        "(id LIKE ? OR model_name LIKE ? OR credential_label LIKE ? OR credential_identity LIKE ?)",
      );
      const search = `%${input.search}%`;
      values.push(search, search, search, search);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = db
      .query(
        `SELECT id, provider_id, provider_name, model_name, client_ip, requester_name, credential_label, credential_identity, status, status_code, tokens_prompt, tokens_completion, tokens_cache_read, tokens_cache_write, tokens_total, estimated_cost_usd, tps, duration_ms, error_message, created_at, completed_at FROM request_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...values, limit, offset) as RequestLog[];
    const total = (
      db
        .query(`SELECT COUNT(*) as count FROM request_logs ${where}`)
        .get(...values) as { count: number }
    ).count;
    return { data: rows, total, limit, offset };
  },

  clear() {
    return getDb().query("DELETE FROM request_logs").run().changes;
  },
};
