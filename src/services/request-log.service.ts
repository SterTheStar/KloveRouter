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

function requestId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `req_${stamp}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

export const requestLogService = {
  cleanupStale() {
    getDb().query("UPDATE request_logs SET status = 'error', status_code = 499, error_message = 'Client disconnected or request timed out', completed_at = datetime('now') WHERE status = 'pending' AND created_at < datetime('now', '-30 minutes')").run();
  },

  start(input: { providerId: string; providerName: string; modelName: string; clientIp?: string | null; requesterName?: string | null }) {
    const id = requestId();
    getDb().query("INSERT INTO request_logs (id, provider_id, provider_name, model_name, client_ip, requester_name) VALUES (?, ?, ?, ?, ?, ?)").run(id, input.providerId, input.providerName, input.modelName, input.clientIp ?? null, input.requesterName ?? null);
    return id;
  },

  setCredential(id: string, credential: { label?: string | null; account_id?: string | null; email?: string | null; project_id?: string | null }) {
    const identity = credential.email || credential.account_id || credential.project_id || null;
    getDb().query("UPDATE request_logs SET credential_label = ?, credential_identity = ? WHERE id = ?").run(credential.label ?? null, identity, id);
  },

  complete(id: string, input: { status?: RequestLogStatus; statusCode?: number; promptTokens?: number; completionTokens?: number; cacheRead?: number; cacheWrite?: number; cost?: number; durationMs?: number; tps?: number | null; error?: string | null }) {
    const db = getDb();
    const prompt = input.promptTokens ?? 0;
    const completion = input.completionTokens ?? 0;
    const cacheRead = input.cacheRead ?? 0;
    const cacheWrite = input.cacheWrite ?? 0;
    let cost = input.cost;
    if (cost === undefined && prompt + completion > 0) {
      const request = db.query("SELECT provider_id, model_name FROM request_logs WHERE id = ?").get(id) as { provider_id: string | null; model_name: string } | null;
      const tier = request?.provider_id ? db.query(
        "SELECT t.input_per_million, t.output_per_million, t.cache_read_per_million, t.cache_write_per_million FROM model_pricing_tiers t JOIN models m ON m.id = t.model_id WHERE m.provider_id = ? AND m.model_id = ? AND t.threshold_tokens <= ? ORDER BY t.threshold_tokens DESC LIMIT 1"
      ).get(request.provider_id, request.model_name, prompt) as { input_per_million: number; output_per_million: number; cache_read_per_million: number; cache_write_per_million: number } | null : null;
      cost = tier ? (Math.max(0, prompt - cacheRead) * tier.input_per_million + completion * tier.output_per_million + cacheRead * tier.cache_read_per_million + cacheWrite * tier.cache_write_per_million) / 1_000_000 : 0;
    }
    db.query("UPDATE request_logs SET status = ?, status_code = ?, tokens_prompt = ?, tokens_completion = ?, tokens_cache_read = ?, tokens_cache_write = ?, tokens_total = ?, estimated_cost_usd = ?, duration_ms = ?, tps = ?, error_message = ?, completed_at = datetime('now') WHERE id = ? AND status = 'pending'").run(input.status ?? "success", input.statusCode ?? 200, prompt, completion, cacheRead, cacheWrite, prompt + completion, cost ?? 0, input.durationMs ?? null, input.tps ?? (input.durationMs && input.durationMs > 0 ? completion / (input.durationMs / 1000) : null), input.error ?? null, id);
  },

  list(input: { limit?: number; offset?: number; status?: string; provider?: string; search?: string } = {}) {
    const db = getDb();
    this.cleanupStale();
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const offset = Math.max(input.offset ?? 0, 0);
    const clauses: string[] = [];
    const values: (string | number)[] = [];
    if (input.status && ["pending", "success", "error"].includes(input.status)) { clauses.push("status = ?"); values.push(input.status); }
    if (input.provider) { clauses.push("provider_name = ?"); values.push(input.provider); }
    if (input.search) { clauses.push("(id LIKE ? OR model_name LIKE ? OR credential_label LIKE ? OR credential_identity LIKE ?)"); const search = `%${input.search}%`; values.push(search, search, search, search); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = db.query(`SELECT * FROM request_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...values, limit, offset) as RequestLog[];
    const total = (db.query(`SELECT COUNT(*) as count FROM request_logs ${where}`).get(...values) as { count: number }).count;
    return { data: rows, total, limit, offset };
  },

  clear() {
    return getDb().query("DELETE FROM request_logs").run().changes;
  },
};
