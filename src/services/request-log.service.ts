import { getDb } from "../db/connection";
import { getLiteLLMPricing } from "./litellm-pricing";
import { defaultBillingTypeForProvider, type ProviderBillingType } from "./provider.service";

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
  credential_kind: string | null;
  api_key_prefix: string | null;
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
  streaming: boolean;
  streamed_chars: number;
  streamed_bytes?: number;
  request_kind?: string | null;
  output_bytes?: number | null;
  billing_type?: ProviderBillingType;
  guardrails_status?: "blocked" | "redacted" | "audited" | null;
}

export interface RequestLogDetails extends RequestLog {
  request_details: unknown;
  response_details: unknown;
  error_details: unknown;
  guardrails_details?: unknown;
}

export type RequestLogEvent =
  | { type: "created"; log: RequestLog }
  | { type: "updated"; log: RequestLog }
  | { type: "cleared" };

type RequestLogListener = (event: RequestLogEvent) => void;
const listeners = new Set<RequestLogListener>();

function publish(event: RequestLogEvent) {
  for (const listener of listeners) {
    try { listener(event); } catch { /* A broken subscriber must never affect logging. */ }
  }
}

/** Columns needed to render the request log table (details are loaded on demand). */
const LIST_COLUMNS = "id, provider_id, provider_name, model_name, client_ip, requester_name, api_key_prefix, credential_label, credential_identity, credential_kind, status, status_code, tokens_prompt, tokens_completion, tokens_cache_read, tokens_cache_write, tokens_total, estimated_cost_usd, billing_type, tps, duration_ms, error_message, created_at, completed_at, streaming, streamed_chars, streamed_bytes, guardrails_status";

const LIST_SQL = `SELECT ${LIST_COLUMNS},
  CASE WHEN request_details IS NULL THEN NULL ELSE json_extract(request_details, '$.saturn.media_type') END AS request_kind,
  CASE WHEN response_details IS NULL THEN NULL ELSE json_extract(response_details, '$.output_bytes') END AS output_bytes
FROM request_logs`;

function hydrateRow(row: RequestLog & { request_kind: string | null; output_bytes: number | null }): RequestLog {
  row.streaming = Boolean(row.streaming);
  row.request_kind = typeof row.request_kind === "string" ? row.request_kind : null;
  row.guardrails_status = (row as any).guardrails_status || null;
  const bytes = Number(row.output_bytes);
  row.output_bytes = Number.isFinite(bytes) ? bytes : (row.streamed_bytes ? Number(row.streamed_bytes) : null);
  return row;
}

let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 30_000;

const SENSITIVE_KEY = /authorization|api[-_]?key|cookie|token|secret|password|credential|private[-_]?key|access[-_]?key/i;
const VALUE_SECRET = /\b(Bearer\s+[A-Za-z0-9._~+/-]+=*|sk-[A-Za-z0-9_-]{8,}|rk-[A-Za-z0-9_-]{8,}|gsk_[A-Za-z0-9_-]{8,}|xox[baprs]-[A-Za-z0-9-]{8,})/gi;
const MAX_DETAIL_BYTES = 64 * 1024;
const TRUNCATION_MARKER = "[truncated]";

export function scrubSensitiveValues(text: string): string {
  return text.replace(VALUE_SECRET, "[redacted]");
}

function limitString(value: string, max = MAX_DETAIL_BYTES): string {
  if (value.length <= max) return value;
  const suffix = `… ${TRUNCATION_MARKER}`;
  return `${value.slice(0, Math.max(0, max - suffix.length))}${suffix}`;
}

export function redactLogDetail(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") return limitString(scrubSensitiveValues(value));
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

/**
 * Normalize any thrown value into a plain, JSON-safe object so the stored
 * error_details keep the *real* reason (upstream status, parsed body, headers,
 * codes, cause chain) instead of just `{ name, message, stack }`. Nested values
 * still go through redactLogDetail/serializeDetail for secret scrubbing.
 */
function normalizeErrorForDetails(error: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (error instanceof Headers) return Object.fromEntries(error.entries());
  if (error instanceof Error) {
    const plain: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    if (error.stack) plain.stack = error.stack;
    for (const key of Object.keys(error as unknown as Record<string, unknown>)) {
      if (key === "name" || key === "message") continue;
      try {
        plain[key] = normalizeErrorForDetails((error as unknown as Record<string, unknown>)[key], depth + 1);
      } catch {
        plain[key] = "[unavailable]";
      }
    }
    if (error.cause !== undefined && !("cause" in plain)) {
      plain.cause = normalizeErrorForDetails(error.cause, depth + 1);
    }
    return plain;
  }
  return error;
}

function requestId() {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  return `req_${stamp}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

function requireLog(id: string): RequestLog | null {
  const row = getDb()
    .query(`${LIST_SQL} WHERE id = ?`)
    .get(id) as (RequestLog & { request_kind: string | null; output_bytes: number | null }) | null;
  return row ? hydrateRow(row) : null;
}

export const requestLogService = {
  subscribe(listener: RequestLogListener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },

  cleanupStale(force = false) {
    const now = Date.now();
    if (!force && now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    lastCleanupAt = now;
    const stale = getDb()
      .query("SELECT id FROM request_logs WHERE status = 'pending' AND created_at < datetime('now', '-30 minutes')")
      .all() as { id: string }[];
    if (!stale.length) return;
    getDb()
      .query(
        "UPDATE request_logs SET status = 'error', status_code = 499, error_message = 'Client disconnected or request timed out', completed_at = datetime('now') WHERE status = 'pending' AND created_at < datetime('now', '-30 minutes')",
      )
      .run();
    for (const { id } of stale) {
      const log = requireLog(id);
      if (log) publish({ type: "updated", log });
    }
  },

  start(input: {
    providerId: string | null;
    providerName: string;
    modelName: string;
    clientIp?: string | null;
    requesterName?: string | null;
    apiKeyPrefix?: string | null;
    requestDetails?: unknown;
    streaming?: boolean;
    guardrailsStatus?: "blocked" | "redacted" | "audited" | null;
    guardrailsDetails?: unknown;
  }) {
    const id = requestId();
    getDb()
      .query(
        "INSERT INTO request_logs (id, provider_id, provider_name, model_name, client_ip, requester_name, api_key_prefix, request_details, streaming, guardrails_status, guardrails_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.providerId,
        input.providerName,
        input.modelName,
        input.clientIp ?? null,
        input.requesterName ?? null,
        input.apiKeyPrefix ?? null,
        serializeDetail(input.requestDetails),
        input.streaming ? 1 : 0,
        input.guardrailsStatus ?? null,
        input.guardrailsDetails ? serializeDetail(input.guardrailsDetails) : null,
      );
    try {
      const log = requireLog(id);
      if (log) publish({ type: "created", log });
    } catch { /* Logging must never affect the request. */ }
    return id;
  },

  setGuardrails(id: string, status: "blocked" | "redacted" | "audited", details?: unknown) {
    try {
      getDb()
        .query(
          "UPDATE request_logs SET guardrails_status = ?, guardrails_details = ? WHERE id = ?",
        )
        .run(status, details ? serializeDetail(details) : null, id);
      const log = requireLog(id);
      if (log) publish({ type: "updated", log });
    } catch { /* Logging must never affect the request. */ }
  },

  progress(id: string, streamedChars: number) {
    try {
      getDb().query("UPDATE request_logs SET streamed_chars = ? WHERE id = ? AND status = 'pending'").run(Math.max(0, Math.floor(streamedChars)), id);
      const log = requireLog(id);
      if (log && log.status === "pending") publish({ type: "updated", log });
    } catch { /* Logging must never affect the request. */ }
  },

  progressBytes(id: string, streamedBytes: number) {
    try {
      getDb().query("UPDATE request_logs SET streamed_bytes = ? WHERE id = ? AND status = 'pending'").run(Math.max(0, Math.floor(streamedBytes)), id);
      const log = requireLog(id);
      if (log && log.status === "pending") publish({ type: "updated", log });
    } catch { /* Logging must never affect the request. */ }
  },

  setCredential(
    id: string,
    credential: {
      kind?: string | null;
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
        "UPDATE request_logs SET credential_label = ?, credential_identity = ?, credential_kind = ? WHERE id = ?",
      )
      .run(credential.label ?? null, identity, credential.kind ?? null, id);
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
    // Supplies provider/protocol needed for pricing and billing type.
    const request = db
      .query("SELECT r.provider_id, r.provider_name, r.model_name, p.protocol, p.name AS name, p.base_url, p.billing_type AS provider_billing, m.billing_type AS model_billing, m.use_litellm_pricing, r.error_details FROM request_logs r LEFT JOIN providers p ON p.id = r.provider_id LEFT JOIN models m ON m.provider_id = r.provider_id AND m.model_id = r.model_name WHERE r.id = ?")
      .get(id) as { provider_id: string | null; provider_name: string | null; model_name: string; protocol: string | null; name: string | null; base_url: string | null; provider_billing?: string; model_billing?: string; use_litellm_pricing: number | null; error_details: string | null } | null;

    const defaultProviderBilling = request?.protocol
      ? defaultBillingTypeForProvider(request.protocol, request.name ?? undefined, request.base_url ?? undefined)
      : "pay_as_you_go";

    const effectiveBilling: ProviderBillingType =
      request?.model_billing && request.model_billing !== "inherit"
        ? (request.model_billing as ProviderBillingType)
        : (request?.provider_billing as ProviderBillingType | undefined) ?? defaultProviderBilling;

    if (effectiveBilling !== "pay_as_you_go") {
      cost = 0;
    } else if (cost === undefined && prompt + completion > 0) {
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
      const catalogPrices = request?.protocol && request.use_litellm_pricing ? getLiteLLMPricing(request.protocol, request.model_name, `${request.name ?? ""} ${request.base_url ?? ""}`) : null;
      const prices = tier ?? (catalogPrices?.billing_unit === "token" ? catalogPrices : null);
      cost = prices
        ? (Math.max(0, prompt - cacheRead) * prices.input_per_million +
            completion * prices.output_per_million +
            cacheRead * prices.cache_read_per_million +
            cacheWrite * prices.cache_write_per_million) /
          1_000_000
        : 0;
    }
    const status: RequestLogStatus = input.status ?? "success";
    const statusCode = input.statusCode ?? 200;
    const responseDetails = serializeDetail(input.responseDetails ?? { status_code: statusCode });
    // Keep the rich error details captureError stored (upstream body/status/codes)
    // instead of clobbering them with a bare { message }.
    let errorDetails: string | null;
    if (input.errorDetails !== undefined) {
      errorDetails = serializeDetail(normalizeErrorForDetails(input.errorDetails));
    } else if (input.error) {
      errorDetails = request?.error_details ?? serializeDetail({ message: input.error });
    } else {
      errorDetails = null;
    }
    db.query(
      "UPDATE request_logs SET status = ?, status_code = ?, tokens_prompt = ?, tokens_completion = ?, tokens_cache_read = ?, tokens_cache_write = ?, tokens_total = ?, estimated_cost_usd = ?, duration_ms = ?, tps = ?, error_message = ?, response_details = COALESCE(?, response_details), error_details = COALESCE(?, error_details), billing_type = ?, completed_at = datetime('now') WHERE id = ? AND status = 'pending'",
    ).run(
      status,
      statusCode,
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
      responseDetails,
      errorDetails,
      effectiveBilling,
      id,
    );
    // Completing an already-finished row is a no-op; skip the event.
    const { changed } = db.query("SELECT changes() AS changed").get() as { changed: number };
    if (!changed) return;
    try {
      // Re-read the persisted row so the live update carries requester_name,
      // api_key_prefix, credential_* and client_ip set at start/setCredential.
      // Rebuilding from in-hand values blanked them (showed "—") on completion.
      const log = requireLog(id);
      if (log) publish({ type: "updated", log });
    } catch { /* Logging must never affect the request. */ }
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
        .run(serializeDetail(normalizeErrorForDetails(error)), id);
    } catch { /* Logging must never affect the request. */ }
  },

  /**
   * One-shot record for requests rejected before reaching a provider (invalid
   * body, bad API key, unknown provider/model, exhausted credentials, incompatible
   * requests...). Writes a completed error row so the panel can show *why* the
   * request failed, including ones that arrived empty.
   */
  logRejection(input: {
    providerId?: string | null;
    providerName?: string | null;
    modelName?: string | null;
    statusCode: number;
    error: string;
    errorDetails?: unknown;
    clientIp?: string | null;
    requesterName?: string | null;
    apiKeyPrefix?: string | null;
    requestDetails?: unknown;
    streaming?: boolean;
    durationMs?: number | null;
    guardrailsStatus?: "blocked" | "redacted" | "audited" | null;
    guardrailsDetails?: unknown;
  }): string | null {
    try {
      const id = requestId();
      const clamp = (value: string | null | undefined, max = 200) => {
        const text = (value ?? "").trim();
        return text ? text.slice(0, max) : null;
      };
      const providerName = clamp(input.providerName) ?? "(unrouted)";
      const modelName = clamp(input.modelName) ?? "(unknown model)";
      const error = clamp(input.error, 4000) ?? "Request rejected";
      const normalizedDetails = input.errorDetails !== undefined ? normalizeErrorForDetails(input.errorDetails) : undefined;
      const errorDetails =
        normalizedDetails !== undefined
          ? { message: error, ...(typeof normalizedDetails === "object" && normalizedDetails !== null && !Array.isArray(normalizedDetails) ? normalizedDetails as Record<string, unknown> : { detail: normalizedDetails }), rejected: true }
          : { message: error, rejected: true };
      getDb()
        .query(
          "INSERT INTO request_logs (id, provider_id, provider_name, model_name, client_ip, requester_name, api_key_prefix, status, status_code, error_message, request_details, response_details, error_details, streaming, duration_ms, completed_at, guardrails_status, guardrails_details) VALUES (?, ?, ?, ?, ?, ?, ?, 'error', ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)",
        )
        .run(
          id,
          input.providerId ?? null,
          providerName,
          modelName,
          input.clientIp ?? null,
          input.requesterName ?? null,
          input.apiKeyPrefix ?? null,
          input.statusCode,
          error,
          serializeDetail(input.requestDetails),
          serializeDetail({ status_code: input.statusCode, rejected: true }),
          serializeDetail(normalizeErrorForDetails(errorDetails)),
          input.streaming ? 1 : 0,
          input.durationMs ?? null,
          input.guardrailsStatus ?? null,
          input.guardrailsDetails ? serializeDetail(input.guardrailsDetails) : null,
        );
      try {
        const log = requireLog(id);
        if (log) publish({ type: "created", log });
      } catch { /* Logging must never affect the request. */ }
      return id;
    } catch {
      return null;
    }
  },

  get(id: string): RequestLogDetails | null {
    const db = getDb();
    const row = db.query("SELECT * FROM request_logs WHERE id = ?").get(id) as (RequestLog & { request_details: string | null; response_details: string | null; error_details: string | null; guardrails_details: string | null }) | null;
    if (!row) return null;
    // Reuse the table projection so detail views expose the same derived fields.
    const summary = db.query(`${LIST_SQL} WHERE id = ?`).get(id) as (RequestLog & { request_kind: string | null; output_bytes: number | null }) | null;
    return {
      ...(summary ? hydrateRow(summary) : { ...row, streaming: Boolean(row.streaming) }),
      request_details: parseDetail(row.request_details),
      response_details: parseDetail(row.response_details),
      error_details: parseDetail(row.error_details),
      guardrails_details: parseDetail(row.guardrails_details),
    };
  },

  list(
    input: {
      limit?: number;
      offset?: number;
      status?: string;
      provider?: string;
      search?: string;
      guardrails?: string;
      billing_type?: string;
      /** Keyset cursor: only return logs created strictly before this timestamp. */
      before?: string;
      /** Total row count is expensive on large tables; only compute it when asked. */
      withTotal?: boolean;
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
    if (input.guardrails) {
      if (input.guardrails === "violations") {
        clauses.push("guardrails_status IS NOT NULL");
      } else if (["blocked", "redacted", "audited"].includes(input.guardrails)) {
        clauses.push("guardrails_status = ?");
        values.push(input.guardrails);
      }
    }
    if (input.billing_type && ["pay_as_you_go", "subscription", "free"].includes(input.billing_type)) {
      clauses.push("billing_type = ?");
      values.push(input.billing_type);
    }
    if (input.search) {
      clauses.push(
        "(id LIKE ? OR model_name LIKE ? OR credential_label LIKE ? OR credential_identity LIKE ? OR request_details LIKE ?)",
      );
      const search = `%${input.search}%`;
      values.push(search, search, search, search, search);
    }
    if (input.before) {
      clauses.push("created_at < ?");
      values.push(input.before);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = db
      .query(
        `${LIST_SQL} ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...values, limit, offset) as (RequestLog & { request_kind: string | null; output_bytes: number | null })[];
    for (const row of rows) hydrateRow(row);
    const total = input.withTotal !== false
      ? (db
          .query(`SELECT COUNT(*) as count FROM request_logs ${where}`)
          .get(...values) as { count: number }).count
      : undefined;
    return { data: rows, total, limit, offset };
  },

  clear() {
    lastCleanupAt = 0;
    const removed = getDb().query("DELETE FROM request_logs").run().changes;
    publish({ type: "cleared" });
    return removed;
  },
};
