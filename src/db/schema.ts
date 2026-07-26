import { Database } from "bun:sqlite";
import { config } from "../config";

export function initSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      base_url    TEXT NOT NULL,
      api_key     TEXT NOT NULL,
      avatar      TEXT,
      protocol    TEXT NOT NULL DEFAULT 'openai',
      credential_mode TEXT NOT NULL DEFAULT 'fixed',
      fixed_credential_id TEXT,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS models (
      id            TEXT PRIMARY KEY,
      provider_id   TEXT NOT NULL,
      model_id      TEXT NOT NULL,
      display_name  TEXT,
      is_manual     INTEGER NOT NULL DEFAULT 0,
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
      UNIQUE(provider_id, model_id)
    );

    CREATE TABLE IF NOT EXISTS provider_credentials (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      label TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'api_key',
      secret TEXT,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      account_id TEXT,
      email TEXT,
      project_id TEXT,
      managed_project_id TEXT,
      expires_at INTEGER,
      fingerprint_json TEXT,
      quota_json TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_used_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      key_hash    TEXT NOT NULL,
      key_secret  TEXT,
      prefix      TEXT NOT NULL,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS provider_credential_rotation (
      provider_id        TEXT PRIMARY KEY,
      last_credential_id TEXT,
      request_sequence   INTEGER NOT NULL DEFAULT 0,
      updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS provider_credential_cooldown (
      credential_id     TEXT PRIMARY KEY,
      provider_id       TEXT NOT NULL,
      remaining_requests INTEGER NOT NULL DEFAULT 0,
      cooldown_until_sequence INTEGER NOT NULL DEFAULT 0,
      reason            TEXT,
      updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (credential_id) REFERENCES provider_credentials(id) ON DELETE CASCADE,
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_log (
      id                TEXT PRIMARY KEY,
      provider_id       TEXT NOT NULL,
      model_id          TEXT NOT NULL,
      model_name        TEXT NOT NULL,
      tokens_prompt     INTEGER NOT NULL DEFAULT 0,
      tokens_completion INTEGER NOT NULL DEFAULT 0,
      tokens_cache_read INTEGER NOT NULL DEFAULT 0,
      tokens_cache_write INTEGER NOT NULL DEFAULT 0,
      tokens_total      INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      duration_ms       INTEGER NOT NULL DEFAULT 0,
      generation_duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS model_pricing_tiers (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      threshold_tokens INTEGER NOT NULL DEFAULT 0,
      input_per_million REAL NOT NULL DEFAULT 0,
      output_per_million REAL NOT NULL DEFAULT 0,
      cache_read_per_million REAL NOT NULL DEFAULT 0,
      cache_write_per_million REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
      UNIQUE(model_id, threshold_tokens)
    );

    CREATE TABLE IF NOT EXISTS request_logs (
      id TEXT PRIMARY KEY,
      provider_id TEXT,
      provider_name TEXT NOT NULL,
      model_name TEXT NOT NULL,
      client_ip TEXT,
      requester_name TEXT,
      credential_label TEXT,
      credential_identity TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      status_code INTEGER,
      tokens_prompt INTEGER NOT NULL DEFAULT 0,
      tokens_completion INTEGER NOT NULL DEFAULT 0,
      tokens_cache_read INTEGER NOT NULL DEFAULT 0,
      tokens_cache_write INTEGER NOT NULL DEFAULT 0,
      tokens_total INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      tps REAL,
      duration_ms INTEGER,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
    );
  `);

  // Migrate existing tables: add avatar column if missing
  const cols = db
    .query("PRAGMA table_info(providers)")
    .all() as { name: string }[];
  if (!cols.find((c) => c.name === "avatar")) {
    db.exec("ALTER TABLE providers ADD COLUMN avatar TEXT");
  }
  if (!cols.find((c) => c.name === "protocol")) {
    db.exec("ALTER TABLE providers ADD COLUMN protocol TEXT NOT NULL DEFAULT 'openai'");
  }
  if (!cols.find((c) => c.name === "credential_mode")) {
    db.exec("ALTER TABLE providers ADD COLUMN credential_mode TEXT NOT NULL DEFAULT 'fixed'");
  }
  if (!cols.find((c) => c.name === "fixed_credential_id")) {
    db.exec("ALTER TABLE providers ADD COLUMN fixed_credential_id TEXT");
  }

  const credentialCols = db.query("PRAGMA table_info(provider_credentials)").all() as { name: string }[];
  const credentialMigrations: Array<[string, string]> = [
    ["email", "ALTER TABLE provider_credentials ADD COLUMN email TEXT"],
    ["project_id", "ALTER TABLE provider_credentials ADD COLUMN project_id TEXT"],
    ["managed_project_id", "ALTER TABLE provider_credentials ADD COLUMN managed_project_id TEXT"],
    ["expires_at", "ALTER TABLE provider_credentials ADD COLUMN expires_at INTEGER"],
    ["fingerprint_json", "ALTER TABLE provider_credentials ADD COLUMN fingerprint_json TEXT"],
    ["quota_json", "ALTER TABLE provider_credentials ADD COLUMN quota_json TEXT"],
  ];
  for (const [name, sql] of credentialMigrations) {
    if (!credentialCols.find((c) => c.name === name)) db.exec(sql);
  }

  const apiKeyCols = db.query("PRAGMA table_info(api_keys)").all() as { name: string }[];
  if (!apiKeyCols.find((c) => c.name === "key_secret")) db.exec("ALTER TABLE api_keys ADD COLUMN key_secret TEXT");

  const usageCols = db.query("PRAGMA table_info(usage_log)").all() as { name: string }[];
  const usageMigrations: Array<[string, string]> = [
    ["generation_duration_ms", "ALTER TABLE usage_log ADD COLUMN generation_duration_ms INTEGER NOT NULL DEFAULT 0"],
    ["tokens_cache_read", "ALTER TABLE usage_log ADD COLUMN tokens_cache_read INTEGER NOT NULL DEFAULT 0"],
    ["tokens_cache_write", "ALTER TABLE usage_log ADD COLUMN tokens_cache_write INTEGER NOT NULL DEFAULT 0"],
    ["estimated_cost_usd", "ALTER TABLE usage_log ADD COLUMN estimated_cost_usd REAL NOT NULL DEFAULT 0"],
  ];
  for (const [name, sql] of usageMigrations) if (!usageCols.find((c) => c.name === name)) db.exec(sql);

  // Seed editable pricing for the built-in Codex OAuth models once.
  const codexPricingDefaults = [
    ["gpt-5.4", 2.5, 15, 0.25],
    ["gpt-5.4-mini", 0.75, 4.5, 0.075],
    ["gpt-5.5", 5, 30, 0.5],
    ["gpt-5.6-luna", 1, 6, 0.1],
    ["gpt-5.6-sol", 5, 30, 0.5],
    ["gpt-5.6-terra", 2.5, 15, 0.25],
  ] as const;
  for (const [modelName, inputPrice, outputPrice, cachePrice] of codexPricingDefaults) {
    const models = db.query(
      `SELECT m.id FROM models m JOIN providers p ON p.id = m.provider_id
       WHERE p.protocol = 'codex' AND lower(m.model_id) = ?
         AND NOT EXISTS (SELECT 1 FROM model_pricing_tiers t WHERE t.model_id = m.id)`
    ).all(modelName) as { id: string }[];
    for (const model of models) db.query(
      "INSERT INTO model_pricing_tiers (id, model_id, threshold_tokens, input_per_million, output_per_million, cache_read_per_million, cache_write_per_million) VALUES (?, ?, 0, ?, ?, ?, 0)"
    ).run(crypto.randomUUID(), model.id, inputPrice, outputPrice, cachePrice);
  }
  const antigravityPricingDefaults = [
    ["claude-opus-4-6-thinking", 15, 75, 1.5], ["claude-sonnet-4-6", 3, 15, 0.3],
    ["gemini-2.5-flash", 0.3, 2.5, 0.03], ["gemini-2.5-flash-lite", 0.1, 0.4, 0.01],
    ["gemini-2.5-flash-thinking", 0.3, 2.5, 0.03], ["gemini-2.5-pro", 1.25, 10, 0.125],
    ["gemini-3-flash", 0.9, 5.4, 0.09], ["gemini-3-flash-agent", 0.9, 5.4, 0.09],
    ["gemini-3.1-flash-image", 0.3, 2.5, 0.03], ["gemini-3.1-flash-lite", 0.1, 0.4, 0.01],
    ["gemini-3.1-pro-high", 2, 12, 0.2], ["gemini-3.1-pro-low", 2, 12, 0.2], ["gemini-pro-agent", 2, 12, 0.2],
    ["gemini-3.5-flash-extra-low", 1.5, 9, 0.15], ["gemini-3.5-flash-low", 1.5, 9, 0.15],
    ["gemini-3.6-flash-high", 1.5, 7.5, 0.15], ["gemini-3.6-flash-medium", 1.5, 7.5, 0.15], ["gemini-3.6-flash-low", 1.5, 7.5, 0.15],
    ["gpt-oss-120b-medium", 0.09, 0.36, 0],
  ] as const;
  for (const [modelName, inputPrice, outputPrice, cachePrice] of antigravityPricingDefaults) {
    const models = db.query(
      `SELECT m.id FROM models m JOIN providers p ON p.id = m.provider_id
       WHERE p.protocol = 'antigravity' AND replace(lower(m.model_id), 'googleantigravity/', '') = ?
         AND NOT EXISTS (SELECT 1 FROM model_pricing_tiers t WHERE t.model_id = m.id)`
    ).all(modelName) as { id: string }[];
    for (const model of models) db.query(
      "INSERT INTO model_pricing_tiers (id, model_id, threshold_tokens, input_per_million, output_per_million, cache_read_per_million, cache_write_per_million) VALUES (?, ?, 0, ?, ?, ?, 0)"
    ).run(crypto.randomUUID(), model.id, inputPrice, outputPrice, cachePrice);
  }

  // Fill costs for request logs created before cost calculation was wired in.
  db.exec(`
    UPDATE request_logs
    SET estimated_cost_usd = COALESCE((
      SELECT (
        MAX(0, request_logs.tokens_prompt - request_logs.tokens_cache_read) * t.input_per_million
        + request_logs.tokens_completion * t.output_per_million
        + request_logs.tokens_cache_read * t.cache_read_per_million
        + request_logs.tokens_cache_write * t.cache_write_per_million
      ) / 1000000.0
      FROM models m
      JOIN model_pricing_tiers t ON t.model_id = m.id
      WHERE m.provider_id = request_logs.provider_id
        AND m.model_id = request_logs.model_name
        AND t.threshold_tokens <= request_logs.tokens_prompt
      ORDER BY t.threshold_tokens DESC
      LIMIT 1
    ), estimated_cost_usd)
    WHERE estimated_cost_usd = 0 AND tokens_total > 0
  `);

  const rotationCols = db.query("PRAGMA table_info(provider_credential_rotation)").all() as { name: string }[];
  if (!rotationCols.find((c) => c.name === "request_sequence")) db.exec("ALTER TABLE provider_credential_rotation ADD COLUMN request_sequence INTEGER NOT NULL DEFAULT 0");
  const cooldownCols = db.query("PRAGMA table_info(provider_credential_cooldown)").all() as { name: string }[];
  if (!cooldownCols.find((c) => c.name === "cooldown_until_sequence")) db.exec("ALTER TABLE provider_credential_cooldown ADD COLUMN cooldown_until_sequence INTEGER NOT NULL DEFAULT 0");

  const providerRows = db.query("SELECT id, api_key, protocol FROM providers WHERE api_key IS NOT NULL AND api_key != ''").all() as { id: string; api_key: string; protocol: string }[];
  for (const provider of providerRows) {
    const existing = db.query("SELECT id FROM provider_credentials WHERE provider_id = ? LIMIT 1").get(provider.id);
    if (!existing) {
      const credentialId = crypto.randomUUID();
      db.query("INSERT INTO provider_credentials (id, provider_id, label, kind, secret, is_active) VALUES (?, ?, ?, ?, ?, 1)").run(credentialId, provider.id, provider.protocol === "codex" ? "Codex session" : "Default API key", provider.protocol === "codex" ? "codex" : "api_key", provider.api_key);
      db.query("UPDATE providers SET fixed_credential_id = ? WHERE id = ?").run(credentialId, provider.id);
    }
  }

  // Seed default password if not exists
  const existing = db
    .query("SELECT value FROM settings WHERE key = ?")
    .get("panel_password") as { value: string } | undefined;

  if (!existing) {
    const hash = Bun.password.hashSync(config.defaultPassword, {
      algorithm: "bcrypt",
      cost: 10,
    });
    db.query("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "panel_password",
      hash
    );
  }
}
