import { getDb } from "../db/connection";

export interface UsageLog {
  id: string;
  provider_id: string;
  model_id: string;
  model_name: string;
  tokens_prompt: number;
  tokens_completion: number;
  tokens_total: number;
  duration_ms: number;
  created_at: string;
}

export interface StatsOverview {
  total_requests: number;
  total_tokens: number;
  total_tokens_prompt: number;
  total_tokens_completion: number;
  avg_tokens_per_request: number;
  avg_duration_ms: number;
}

export interface StatsByProvider {
  provider_id: string;
  provider_name: string;
  requests: number;
  tokens_total: number;
}

export interface StatsByModel {
  model_id: string;
  model_name: string;
  provider_id: string;
  provider_name: string;
  requests: number;
  tokens_total: number;
  tokens_prompt: number;
  tokens_completion: number;
  avg_duration_ms: number;
  tps: number | null;
}

export interface DailyStats {
  date: string;
  requests: number;
  tokens_total: number;
}

export const usageService = {
  record(
    providerId: string,
    modelId: string,
    modelName: string,
    tokensPrompt: number,
    tokensCompletion: number,
    durationMs: number
  ): UsageLog {
    const db = getDb();
    const id = crypto.randomUUID();
    const total = tokensPrompt + tokensCompletion;
    db.query(
      `INSERT INTO usage_log (id, provider_id, model_id, model_name, tokens_prompt, tokens_completion, tokens_total, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, providerId, modelId, modelName, tokensPrompt, tokensCompletion, total, durationMs);
    return db.query("SELECT * FROM usage_log WHERE id = ?").get(id) as UsageLog;
  },

  getOverview(days: number = 30): StatsOverview {
    const db = getDb();
    const row = db
      .query(
        `SELECT
           COUNT(*) as total_requests,
           COALESCE(SUM(tokens_total), 0) as total_tokens,
           COALESCE(SUM(tokens_prompt), 0) as total_tokens_prompt,
           COALESCE(SUM(tokens_completion), 0) as total_tokens_completion,
           COALESCE(CAST(SUM(tokens_total) AS REAL) / MAX(COUNT(*), 1), 0) as avg_tokens_per_request,
           COALESCE(CAST(SUM(duration_ms) AS REAL) / MAX(COUNT(*), 1), 0) as avg_duration_ms
         FROM usage_log
         WHERE created_at >= datetime('now', ? || ' days')`
      )
      .get(`-${days}`) as StatsOverview;
    return row;
  },

  getByProvider(days: number = 30): StatsByProvider[] {
    const db = getDb();
    return db
      .query(
        `SELECT
           u.provider_id,
           p.name as provider_name,
           COUNT(*) as requests,
           COALESCE(SUM(u.tokens_total), 0) as tokens_total
         FROM usage_log u
         JOIN providers p ON p.id = u.provider_id
         WHERE u.created_at >= datetime('now', ? || ' days')
         GROUP BY u.provider_id
         ORDER BY tokens_total DESC`
      )
      .all(`-${days}`) as StatsByProvider[];
  },

  getByModel(days: number = 30): StatsByModel[] {
    const db = getDb();
    return db
      .query(
        `SELECT
           u.model_id,
           u.model_name,
           u.provider_id,
           p.name as provider_name,
           COUNT(*) as requests,
           COALESCE(SUM(u.tokens_total), 0) as tokens_total,
           COALESCE(SUM(u.tokens_prompt), 0) as tokens_prompt,
           COALESCE(SUM(u.tokens_completion), 0) as tokens_completion,
           COALESCE(CAST(SUM(u.duration_ms) AS REAL) / MAX(COUNT(*), 1), 0) as avg_duration_ms,
           CASE WHEN SUM(u.duration_ms) > 0
             THEN CAST(SUM(u.tokens_total) AS REAL) / (CAST(SUM(u.duration_ms) AS REAL) / 1000.0)
             ELSE NULL
           END as tps
         FROM usage_log u
         JOIN providers p ON p.id = u.provider_id
         WHERE u.created_at >= datetime('now', ? || ' days')
         GROUP BY u.model_id, u.model_name
         ORDER BY tokens_total DESC`
      )
      .all(`-${days}`) as StatsByModel[];
  },

  getDailyStats(days: number = 30): DailyStats[] {
    const db = getDb();
    return db
      .query(
        `SELECT
           DATE(created_at) as date,
           COUNT(*) as requests,
           COALESCE(SUM(tokens_total), 0) as tokens_total
         FROM usage_log
         WHERE created_at >= datetime('now', ? || ' days')
         GROUP BY DATE(created_at)
         ORDER BY date ASC`
      )
      .all(`-${days}`) as DailyStats[];
  },

  getModelTps(modelId: string): number | null {
    const db = getDb();
    const row = db
      .query(
        `SELECT
           COUNT(*) as requests,
           COALESCE(SUM(tokens_total), 0) as total_tokens,
           COALESCE(SUM(duration_ms), 0) as total_duration_ms
         FROM usage_log
         WHERE model_id = ? AND duration_ms > 0`
      )
      .get(modelId) as { requests: number; total_tokens: number; total_duration_ms: number } | undefined;
    if (!row || row.requests === 0 || row.total_duration_ms === 0) return null;
    return row.total_tokens / (row.total_duration_ms / 1000.0);
  },

  getAllModelTps(): { model_id: string; tps: number | null }[] {
    const db = getDb();
    return db
      .query(
        `SELECT
           model_id,
           CASE WHEN SUM(duration_ms) > 0
             THEN CAST(SUM(tokens_total) AS REAL) / (CAST(SUM(duration_ms) AS REAL) / 1000.0)
             ELSE NULL
           END as tps
         FROM usage_log
         WHERE duration_ms > 0
         GROUP BY model_id`
      )
      .all() as { model_id: string; tps: number | null }[];
  },
};
