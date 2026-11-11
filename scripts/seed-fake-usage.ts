import { getDb } from "../src/db/connection";

export function seedFakeUsage() {
  const db = getDb();

  console.log("Seeding fake usage and request logs...");

  // Ensure providers exist
  const existingProviders = db.query("SELECT id, name FROM providers").all() as { id: string; name: string }[];
  if (existingProviders.length === 0) {
    db.run(
      `INSERT INTO providers (id, name, base_url, protocol, is_active)
       VALUES ('p1', 'OpenAI', 'https://api.openai.com/v1', 'openai', 1),
              ('p2', 'Anthropic', 'https://api.anthropic.com/v1', 'anthropic', 1)`
    );
  }

  const p1 = existingProviders[0]?.id ?? "p1";
  const p2 = existingProviders[1]?.id ?? "p2";
  const p1Name = existingProviders[0]?.name ?? "OpenAI";
  const p2Name = existingProviders[1]?.name ?? "Anthropic";

  // Add rich models if they don't exist
  const modelsToEnsure = [
    { id: "m-gpt4o", provider_id: p1, model_id: "gpt-4o", display_name: "GPT-4o" },
    { id: "m-o3mini", provider_id: p1, model_id: "o3-mini", display_name: "o3-mini" },
    { id: "m-claude37", provider_id: p2, model_id: "claude-3-7-sonnet", display_name: "Claude 3.7 Sonnet" },
    { id: "m-claude35haiku", provider_id: p2, model_id: "claude-3-5-haiku", display_name: "Claude 3.5 Haiku" },
  ];

  for (const m of modelsToEnsure) {
    const exists = db.query("SELECT id FROM models WHERE id = ? OR (provider_id = ? AND model_id = ?)").get(m.id, m.provider_id, m.model_id);
    if (!exists) {
      db.run(
        `INSERT INTO models (id, provider_id, model_id, display_name, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
        [m.id, m.provider_id, m.model_id, m.display_name]
      );
    }
  }

  // Clear existing usage_log and request_logs to provide a fresh realistic dataset
  db.run("DELETE FROM usage_log");
  db.run("DELETE FROM request_logs");

  const sampleModels = [
    { provider_id: p1, provider_name: p1Name, model_id: "gpt-4o", model_name: "gpt-4o", cost_per_1k: 0.005, base_tps: 82 },
    { provider_id: p1, provider_name: p1Name, model_id: "o3-mini", model_name: "o3-mini", cost_per_1k: 0.002, base_tps: 110 },
    { provider_id: p2, provider_name: p2Name, model_id: "claude-3-7-sonnet", model_name: "claude-3-7-sonnet", cost_per_1k: 0.006, base_tps: 74 },
    { provider_id: p2, provider_name: p2Name, model_id: "claude-3-5-haiku", model_name: "claude-3-5-haiku", cost_per_1k: 0.001, base_tps: 98 },
  ];

  // Also include any models already present
  const dbModels = db.query("SELECT id, provider_id, model_id, display_name FROM models WHERE is_active = 1").all() as any[];
  for (const dbm of dbModels) {
    if (!sampleModels.some((sm) => sm.model_id === dbm.model_id)) {
      sampleModels.push({
        provider_id: dbm.provider_id,
        provider_name: dbm.provider_id === p1 ? p1Name : p2Name,
        model_id: dbm.model_id,
        model_name: dbm.display_name || dbm.model_id,
        cost_per_1k: 0.003,
        base_tps: 65,
      });
    }
  }

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Generate logs over the last 30 days
  const insertUsage = db.prepare(`
    INSERT INTO usage_log (
      id, provider_id, model_id, model_name,
      tokens_prompt, tokens_completion, tokens_cache_read, tokens_cache_write,
      tokens_total, estimated_cost_usd, duration_ms, generation_duration_ms,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRequest = db.prepare(`
    INSERT INTO request_logs (
      id, provider_id, provider_name, model_name,
      status, status_code, tokens_prompt, tokens_completion,
      tokens_cache_read, tokens_cache_write, tokens_total,
      estimated_cost_usd, tps, duration_ms, created_at, completed_at, streaming
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
      // Scale request count per day (slight growth curve with weekday peaks)
      const dayDate = new Date(now - dayOffset * dayMs);
      const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
      const baseDailyReqs = isWeekend ? 12 : 35 + Math.floor(Math.sin(dayOffset / 3) * 10);

      for (let r = 0; r < baseDailyReqs; r++) {
        const id = crypto.randomUUID();
        const model = sampleModels[Math.floor(Math.random() * sampleModels.length)];

        // Spread timestamps within the day
        const reqTime = new Date(dayDate.getTime() + Math.random() * dayMs);
        const createdAt = reqTime.toISOString().replace("T", " ").replace("Z", "");

        // Realistic token sizes
        const promptTokens = Math.floor(300 + Math.random() * 2200);
        const completionTokens = Math.floor(80 + Math.random() * 950);
        const cacheRead = Math.random() > 0.45 ? Math.floor(promptTokens * 0.6) : 0;
        const cacheWrite = cacheRead === 0 && Math.random() > 0.7 ? Math.floor(promptTokens * 0.4) : 0;
        const totalTokens = promptTokens + completionTokens;

        const genDuration = Math.max(200, Math.floor((completionTokens / model.base_tps) * 1000 + (Math.random() * 200 - 100)));
        const totalDuration = genDuration + Math.floor(180 + Math.random() * 320);
        const completedAt = new Date(reqTime.getTime() + totalDuration).toISOString().replace("T", " ").replace("Z", "");

        const estimatedCost = Number(((totalTokens / 1000) * model.cost_per_1k).toFixed(6));
        const tps = Number((completionTokens / (genDuration / 1000)).toFixed(1));

        // 98.5% success rate
        const isError = Math.random() < 0.015;
        const status = isError ? "error" : "success";
        const statusCode = isError ? 503 : 200;

        insertUsage.run(
          id,
          model.provider_id,
          model.model_id,
          model.model_name,
          promptTokens,
          completionTokens,
          cacheRead,
          cacheWrite,
          totalTokens,
          estimatedCost,
          totalDuration,
          genDuration,
          createdAt
        );

        insertRequest.run(
          id,
          model.provider_id,
          model.provider_name,
          model.model_name,
          status,
          statusCode,
          promptTokens,
          completionTokens,
          cacheRead,
          cacheWrite,
          totalTokens,
          estimatedCost,
          tps,
          totalDuration,
          createdAt,
          completedAt,
          Math.random() > 0.3 ? 1 : 0
        );
      }
    }
  })();

  const countUsage = db.query("SELECT COUNT(*) as count FROM usage_log").get() as { count: number };
  const countRequests = db.query("SELECT COUNT(*) as count FROM request_logs").get() as { count: number };
  console.log(`Seeded ${countUsage.count} usage logs and ${countRequests.count} request logs!`);
}

if (import.meta.main) {
  seedFakeUsage();
}
