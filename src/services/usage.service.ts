import { getDb } from "../db/connection";
import { getLiteLLMPricing } from "./litellm-pricing";

export interface UsageLog {
  id: string;
  provider_id: string;
  model_id: string;
  model_name: string;
  tokens_prompt: number;
  tokens_completion: number;
  tokens_cache_write: number;
  tokens_total: number;
  estimated_cost_usd: number;
  total_tokens_cache: number;
  duration_ms: number;
  generation_duration_ms: number;
  created_at: string;
}

export interface StatsOverview {
  total_requests: number;
  total_tokens: number;
  total_tokens_prompt: number;
  total_tokens_completion: number;
  avg_tokens_per_request: number;
  avg_duration_ms: number;
  estimated_cost_usd: number;
  tokens_cache_read: number;
}

export interface StatsByProvider {
  provider_id: string;
  provider_name: string;
  requests: number;
  tokens_total: number;
  estimated_cost_usd: number;
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
  tokens_cache_read: number;
  estimated_cost_usd: number;
}

export interface DailyStats {
  date: string;
  requests: number;
  tokens_total: number;
  estimated_cost_usd: number;
}

export interface ProviderUsageWindow {
  tokens: number;
  calls: number;
  estimated_cost_usd: number;
}

export interface ProviderUsageWindows {
  daily: ProviderUsageWindow;
  weekly: ProviderUsageWindow;
  monthly: ProviderUsageWindow;
}

export const usageService = {
  record(
    providerId: string,
    modelId: string,
    modelName: string,
    tokensPrompt: number,
    tokensCompletion: number,
    durationMs: number,
    generationDurationMs = durationMs,
    details: { cacheRead?: number; cacheWrite?: number } = {},
  ): UsageLog {
    const db = getDb();
    const id = crypto.randomUUID();
    const total = tokensPrompt + tokensCompletion;
    const cacheRead = details.cacheRead ?? 0;
    const cacheWrite = details.cacheWrite ?? 0;
    const tier = db
      .query(
        "SELECT * FROM model_pricing_tiers WHERE model_id = ? AND threshold_tokens <= ? ORDER BY threshold_tokens DESC LIMIT 1",
      )
      .get(modelId, tokensPrompt) as {
      input_per_million: number;
      output_per_million: number;
      cache_read_per_million: number;
      cache_write_per_million: number;
      } | null;
    const provider = tier ? null : db.query("SELECT p.protocol, p.name, p.base_url, m.use_litellm_pricing FROM providers p JOIN models m ON m.provider_id = p.id WHERE p.id = ? AND m.id = ?").get(providerId, modelId) as { protocol: string; name: string; base_url: string; use_litellm_pricing: number } | null;
    const catalogPrices = provider?.use_litellm_pricing ? getLiteLLMPricing(provider.protocol, modelName, `${provider.name} ${provider.base_url}`) : null;
    const prices = tier ?? (catalogPrices?.billing_unit === "token" ? catalogPrices : null);
    const uncachedPrompt = Math.max(0, tokensPrompt - cacheRead);
    const estimatedCost = prices
      ? (uncachedPrompt * prices.input_per_million +
          tokensCompletion * prices.output_per_million +
          cacheRead * prices.cache_read_per_million +
          cacheWrite * prices.cache_write_per_million) /
        1_000_000
      : 0;
    db.query(
      `INSERT INTO usage_log (id, provider_id, model_id, model_name, tokens_prompt, tokens_completion, tokens_cache_read, tokens_cache_write, tokens_total, estimated_cost_usd, duration_ms, generation_duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      providerId,
      modelId,
      modelName,
      tokensPrompt,
      tokensCompletion,
      cacheRead,
      cacheWrite,
      total,
      estimatedCost,
      durationMs,
      generationDurationMs,
    );
    return db.query("SELECT * FROM usage_log WHERE id = ?").get(id) as UsageLog;
  },

  getOverview(days: number = 30): StatsOverview {
    const db = getDb();
    const dateFilter =
      days > 0 ? "WHERE created_at >= datetime('now', ? || ' days')" : "";
    const row = db
      .query(
        `SELECT
           COUNT(*) as total_requests,
            COALESCE(SUM(tokens_total), 0) as total_tokens,
           COALESCE(SUM(tokens_prompt), 0) as total_tokens_prompt,
            COALESCE(SUM(tokens_completion), 0) as total_tokens_completion,
            COALESCE(SUM(estimated_cost_usd), 0) as estimated_cost_usd,
            COALESCE(SUM(tokens_cache_read), 0) as total_tokens_cache,
           COALESCE(CAST(SUM(tokens_total) AS REAL) / MAX(COUNT(*), 1), 0) as avg_tokens_per_request,
           COALESCE(CAST(SUM(duration_ms) AS REAL) / MAX(COUNT(*), 1), 0) as avg_duration_ms
          FROM usage_log
          ${dateFilter}`,
      )
      .get(...(days > 0 ? [`-${days}`] : [])) as StatsOverview;
    return row;
  },

  getByProvider(days: number = 30): StatsByProvider[] {
    const db = getDb();
    const dateFilter =
      days > 0 ? "WHERE u.created_at >= datetime('now', ? || ' days')" : "";
    return db
      .query(
        `SELECT
           u.provider_id,
           p.name as provider_name,
           COUNT(*) as requests,
            COALESCE(SUM(u.tokens_total), 0) as tokens_total
            ,COALESCE(SUM(u.estimated_cost_usd), 0) as estimated_cost_usd
         FROM usage_log u
         JOIN providers p ON p.id = u.provider_id
          ${dateFilter}
         GROUP BY u.provider_id
         ORDER BY tokens_total DESC`,
      )
      .all(...(days > 0 ? [`-${days}`] : [])) as StatsByProvider[];
  },

  getByModel(days: number = 30): StatsByModel[] {
    const db = getDb();
    const dateFilter =
      days > 0 ? "WHERE u.created_at >= datetime('now', ? || ' days')" : "";
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
            COALESCE(SUM(u.tokens_cache_read), 0) as tokens_cache_read,
            COALESCE(SUM(u.estimated_cost_usd), 0) as estimated_cost_usd,
           COALESCE(CAST(SUM(u.duration_ms) AS REAL) / MAX(COUNT(*), 1), 0) as avg_duration_ms,
            CASE WHEN SUM(u.generation_duration_ms) > 0
              THEN CAST(SUM(u.tokens_completion) AS REAL) / (CAST(SUM(u.generation_duration_ms) AS REAL) / 1000.0)
             ELSE NULL
           END as tps
         FROM usage_log u
         JOIN providers p ON p.id = u.provider_id
          ${dateFilter}
         GROUP BY u.model_id, u.model_name
         ORDER BY tokens_total DESC`,
      )
      .all(...(days > 0 ? [`-${days}`] : [])) as StatsByModel[];
  },

  getDailyStats(days: number = 30): DailyStats[] {
    const db = getDb();
    const dateFilter =
      days > 0 ? "WHERE created_at >= datetime('now', ? || ' days')" : "";
    return db
      .query(
        `SELECT
           DATE(created_at) as date,
           COUNT(*) as requests,
            COALESCE(SUM(tokens_total), 0) as tokens_total
            ,COALESCE(SUM(estimated_cost_usd), 0) as estimated_cost_usd
         FROM usage_log
          ${dateFilter}
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
      )
      .all(...(days > 0 ? [`-${days}`] : [])) as DailyStats[];
  },

  getProviderWindows(providerId: string): ProviderUsageWindows {
    const db = getDb();
    const row = db
      .query(
        `SELECT
           COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-1 day') THEN tokens_total ELSE 0 END), 0) AS daily_tokens,
           COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END), 0) AS daily_calls,
           COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-1 day') THEN estimated_cost_usd ELSE 0 END), 0) AS daily_usd,
           COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN tokens_total ELSE 0 END), 0) AS weekly_tokens,
           COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END), 0) AS weekly_calls,
           COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN estimated_cost_usd ELSE 0 END), 0) AS weekly_usd,
           COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN tokens_total ELSE 0 END), 0) AS monthly_tokens,
           COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END), 0) AS monthly_calls,
           COALESCE(SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN estimated_cost_usd ELSE 0 END), 0) AS monthly_usd
         FROM usage_log
         WHERE provider_id = ?`,
      )
      .get(providerId) as {
      daily_tokens: number;
      daily_calls: number;
      daily_usd: number;
      weekly_tokens: number;
      weekly_calls: number;
      weekly_usd: number;
      monthly_tokens: number;
      monthly_calls: number;
      monthly_usd: number;
    };
    return {
      daily: {
        tokens: Number(row.daily_tokens),
        calls: Number(row.daily_calls),
        estimated_cost_usd: Number(row.daily_usd),
      },
      weekly: {
        tokens: Number(row.weekly_tokens),
        calls: Number(row.weekly_calls),
        estimated_cost_usd: Number(row.weekly_usd),
      },
      monthly: {
        tokens: Number(row.monthly_tokens),
        calls: Number(row.monthly_calls),
        estimated_cost_usd: Number(row.monthly_usd),
      },
    };
  },

  getModelTps(modelId: string): number | null {
    const db = getDb();
    const row = db
      .query(
        `SELECT
           COUNT(*) as requests,
           COALESCE(SUM(tokens_total), 0) as total_tokens,
            COALESCE(SUM(generation_duration_ms), 0) as total_generation_duration_ms
         FROM usage_log
          WHERE model_id = ? AND generation_duration_ms > 0`,
      )
      .get(modelId) as
      | {
          requests: number;
          total_generation_duration_ms: number;
          total_tokens: number;
        }
      | undefined;
    if (!row || row.requests === 0 || row.total_generation_duration_ms === 0)
      return null;
    return row.total_tokens / (row.total_generation_duration_ms / 1000.0);
  },

  getAllModelTps(): { model_id: string; tps: number | null }[] {
    const db = getDb();
    return db
      .query(
        `SELECT
           model_id,
            CASE WHEN SUM(generation_duration_ms) > 0
              THEN CAST(SUM(tokens_completion) AS REAL) / (CAST(SUM(generation_duration_ms) AS REAL) / 1000.0)
             ELSE NULL
           END as tps
         FROM usage_log
          WHERE generation_duration_ms > 0
         GROUP BY model_id`,
      )
      .all() as { model_id: string; tps: number | null }[];
  },
};
