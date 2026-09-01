import { Database } from "bun:sqlite";
import { config } from "../config";
import { encryptSecret } from "../services/secret.service";

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
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      last_test_at TEXT,
      last_test_success INTEGER,
      last_test_error TEXT,
      last_test_duration_ms INTEGER
    );

    CREATE TABLE IF NOT EXISTS models (
      id            TEXT PRIMARY KEY,
      provider_id   TEXT NOT NULL,
      model_id      TEXT NOT NULL,
      pretty_id     TEXT,
      display_name  TEXT,
      context_window INTEGER,
      max_output_tokens INTEGER,
      max_output_tokens_source TEXT NOT NULL DEFAULT 'auto',
      fix_missing_think_opening_tag INTEGER NOT NULL DEFAULT 0,
      think_opening_tag_mode TEXT NOT NULL DEFAULT 'off',
      is_manual     INTEGER NOT NULL DEFAULT 0,
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
      UNIQUE(provider_id, model_id)
    );

    CREATE TABLE IF NOT EXISTS model_capabilities (
      model_id TEXT PRIMARY KEY,
      reasoning INTEGER,
      tools INTEGER,
      vision INTEGER,
      attachments INTEGER,
      streaming INTEGER,
      non_streaming INTEGER,
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS model_reasoning_efforts (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      effort TEXT NOT NULL,
      display_name TEXT NOT NULL,
      upstream_value TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
      UNIQUE(model_id, effort)
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

    CREATE TABLE IF NOT EXISTS atomesus_sessions (
      credential_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      messages TEXT NOT NULL DEFAULT '[]',
      model TEXT NOT NULL DEFAULT '',
      effort TEXT NOT NULL DEFAULT '',
      system TEXT NOT NULL DEFAULT '',
      file_key TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (credential_id, session_id),
      FOREIGN KEY (credential_id) REFERENCES provider_credentials(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conol_sessions (
      credential_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      messages TEXT NOT NULL DEFAULT '[]',
      model TEXT NOT NULL DEFAULT '',
      agent_server_id TEXT NOT NULL DEFAULT '',
      agent_name TEXT NOT NULL DEFAULT '',
      model_preset TEXT NOT NULL DEFAULT '',
      agent_model TEXT NOT NULL DEFAULT '',
      timezone TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (credential_id, session_id),
      FOREIGN KEY (credential_id) REFERENCES provider_credentials(id) ON DELETE CASCADE
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

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New chat',
      model TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at
      ON chat_sessions(updated_at DESC);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      attachments TEXT,
      reasoning TEXT,
      stats TEXT,
      error TEXT,
      sequence INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (chat_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
      UNIQUE(chat_id, sequence)
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_sequence
      ON chat_messages(chat_id, sequence);

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
      request_details TEXT,
      response_details TEXT,
      error_details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_request_logs_provider_model_created
      ON request_logs(provider_id, model_name, created_at);
    CREATE INDEX IF NOT EXISTS idx_request_logs_status_created
      ON request_logs(status, created_at);
  `);

  const requestLogCols = db.query("PRAGMA table_info(request_logs)").all() as { name: string }[];
  for (const [name, sql] of [
    ["request_details", "ALTER TABLE request_logs ADD COLUMN request_details TEXT"],
    ["response_details", "ALTER TABLE request_logs ADD COLUMN response_details TEXT"],
    ["error_details", "ALTER TABLE request_logs ADD COLUMN error_details TEXT"],
  ] as const) {
    if (!requestLogCols.find((column) => column.name === name)) db.exec(sql);
  }

  // Migrate existing tables: add avatar column if missing
  const cols = db.query("PRAGMA table_info(providers)").all() as {
    name: string;
  }[];
  if (!cols.find((c) => c.name === "avatar")) {
    db.exec("ALTER TABLE providers ADD COLUMN avatar TEXT");
  }
  if (!cols.find((c) => c.name === "protocol")) {
    db.exec(
      "ALTER TABLE providers ADD COLUMN protocol TEXT NOT NULL DEFAULT 'openai'",
    );
  }
  if (!cols.find((c) => c.name === "credential_mode")) {
    db.exec(
      "ALTER TABLE providers ADD COLUMN credential_mode TEXT NOT NULL DEFAULT 'fixed'",
    );
  }
  if (!cols.find((c) => c.name === "fixed_credential_id")) {
    db.exec("ALTER TABLE providers ADD COLUMN fixed_credential_id TEXT");
  }
  for (const [name, sql] of [
    ["last_test_at", "ALTER TABLE providers ADD COLUMN last_test_at TEXT"],
    ["last_test_success", "ALTER TABLE providers ADD COLUMN last_test_success INTEGER"],
    ["last_test_error", "ALTER TABLE providers ADD COLUMN last_test_error TEXT"],
    ["last_test_duration_ms", "ALTER TABLE providers ADD COLUMN last_test_duration_ms INTEGER"],
  ] as const) {
    if (!cols.find((c) => c.name === name)) db.exec(sql);
  }

  const modelCols = db.query("PRAGMA table_info(models)").all() as {
    name: string;
  }[];
  if (!modelCols.find((c) => c.name === "pretty_id"))
    db.exec("ALTER TABLE models ADD COLUMN pretty_id TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_models_provider_pretty_id ON models(provider_id, pretty_id) WHERE pretty_id IS NOT NULL");
  if (!modelCols.find((c) => c.name === "context_window"))
    db.exec("ALTER TABLE models ADD COLUMN context_window INTEGER");
  if (!modelCols.find((c) => c.name === "max_output_tokens"))
    db.exec("ALTER TABLE models ADD COLUMN max_output_tokens INTEGER");
  if (!modelCols.find((c) => c.name === "max_output_tokens_source")) {
    db.exec("ALTER TABLE models ADD COLUMN max_output_tokens_source TEXT NOT NULL DEFAULT 'auto'");
    db.exec("UPDATE models SET max_output_tokens_source = CASE WHEN max_output_tokens IS NULL THEN 'auto' WHEN is_manual != 0 THEN 'manual' ELSE 'api' END");
  }
  if (!modelCols.find((c) => c.name === "fix_missing_think_opening_tag"))
    db.exec(
      "ALTER TABLE models ADD COLUMN fix_missing_think_opening_tag INTEGER NOT NULL DEFAULT 0",
    );
  if (!modelCols.find((c) => c.name === "think_opening_tag_mode")) {
    db.exec(
      "ALTER TABLE models ADD COLUMN think_opening_tag_mode TEXT NOT NULL DEFAULT 'off'",
    );
    db.exec(
      "UPDATE models SET think_opening_tag_mode = CASE WHEN fix_missing_think_opening_tag != 0 THEN 'detect' ELSE 'off' END",
    );
  }
  if (!modelCols.find((c) => c.name === "updated_at")) {
    db.exec("ALTER TABLE models ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
    db.exec("UPDATE models SET updated_at = created_at WHERE updated_at = ''");
  }

  const chatMessageCols = db.query("PRAGMA table_info(chat_messages)").all() as {
    name: string;
  }[];
  if (!chatMessageCols.find((c) => c.name === "reasoning")) {
    db.exec("ALTER TABLE chat_messages ADD COLUMN reasoning TEXT");
  }
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS models_fill_updated_at
    AFTER INSERT ON models
    WHEN NEW.updated_at = ''
    BEGIN
      UPDATE models SET updated_at = datetime('now') WHERE id = NEW.id;
    END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS models_touch_updated_at
    AFTER UPDATE ON models
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE models SET updated_at = datetime('now') WHERE id = NEW.id;
    END
  `);

  const atomesusSessionCols = db
    .query("PRAGMA table_info(atomesus_sessions)")
    .all() as { name: string }[];
  for (const [name, sql] of [
    ["model", "ALTER TABLE atomesus_sessions ADD COLUMN model TEXT NOT NULL DEFAULT ''"],
    ["effort", "ALTER TABLE atomesus_sessions ADD COLUMN effort TEXT NOT NULL DEFAULT ''"],
    ["system", "ALTER TABLE atomesus_sessions ADD COLUMN system TEXT NOT NULL DEFAULT ''"],
    ["file_key", "ALTER TABLE atomesus_sessions ADD COLUMN file_key TEXT NOT NULL DEFAULT ''"],
  ] as const)
    if (!atomesusSessionCols.find((column) => column.name === name)) db.exec(sql);

  const credentialCols = db
    .query("PRAGMA table_info(provider_credentials)")
    .all() as { name: string }[];
  const credentialMigrations: Array<[string, string]> = [
    ["email", "ALTER TABLE provider_credentials ADD COLUMN email TEXT"],
    [
      "project_id",
      "ALTER TABLE provider_credentials ADD COLUMN project_id TEXT",
    ],
    [
      "managed_project_id",
      "ALTER TABLE provider_credentials ADD COLUMN managed_project_id TEXT",
    ],
    [
      "expires_at",
      "ALTER TABLE provider_credentials ADD COLUMN expires_at INTEGER",
    ],
    [
      "fingerprint_json",
      "ALTER TABLE provider_credentials ADD COLUMN fingerprint_json TEXT",
    ],
    [
      "quota_json",
      "ALTER TABLE provider_credentials ADD COLUMN quota_json TEXT",
    ],
  ];
  for (const [name, sql] of credentialMigrations) {
    if (!credentialCols.find((c) => c.name === name)) db.exec(sql);
  }

  const apiKeyCols = db.query("PRAGMA table_info(api_keys)").all() as {
    name: string;
  }[];
  if (!apiKeyCols.find((c) => c.name === "key_secret"))
    db.exec("ALTER TABLE api_keys ADD COLUMN key_secret TEXT");

  const usageCols = db.query("PRAGMA table_info(usage_log)").all() as {
    name: string;
  }[];
  const usageMigrations: Array<[string, string]> = [
    [
      "generation_duration_ms",
      "ALTER TABLE usage_log ADD COLUMN generation_duration_ms INTEGER NOT NULL DEFAULT 0",
    ],
    [
      "tokens_cache_read",
      "ALTER TABLE usage_log ADD COLUMN tokens_cache_read INTEGER NOT NULL DEFAULT 0",
    ],
    [
      "tokens_cache_write",
      "ALTER TABLE usage_log ADD COLUMN tokens_cache_write INTEGER NOT NULL DEFAULT 0",
    ],
    [
      "estimated_cost_usd",
      "ALTER TABLE usage_log ADD COLUMN estimated_cost_usd REAL NOT NULL DEFAULT 0",
    ],
  ];
  for (const [name, sql] of usageMigrations)
    if (!usageCols.find((c) => c.name === name)) db.exec(sql);

  // Seed editable pricing for the built-in Codex OAuth models once.
  const codexPricingDefaults = [
    ["gpt-5.3-codex", 1.75, 14, 0.175, 0],
    ["gpt-5.4", 2.5, 15, 0.25, 0],
    ["gpt-5.4-mini", 0.75, 4.5, 0.075, 0],
    ["gpt-5.5", 5, 30, 0.5, 0],
    ["gpt-5.6-luna", 0.2, 1.2, 0.02, 0.25],
    ["gpt-5.6-sol", 4, 20, 0.4, 5],
    ["gpt-5.6-terra", 2, 12, 0.2, 2.5],
  ] as const;
  for (const [
    modelName,
    inputPrice,
    outputPrice,
    cachePrice,
    cacheWritePrice,
  ] of codexPricingDefaults) {
    const models = db
      .query(
        `SELECT m.id FROM models m JOIN providers p ON p.id = m.provider_id
       WHERE p.protocol = 'codex' AND lower(m.model_id) = ?
         AND NOT EXISTS (SELECT 1 FROM model_pricing_tiers t WHERE t.model_id = m.id)`,
      )
      .all(modelName) as { id: string }[];
    for (const model of models)
      db.query(
        "INSERT INTO model_pricing_tiers (id, model_id, threshold_tokens, input_per_million, output_per_million, cache_read_per_million, cache_write_per_million) VALUES (?, ?, 0, ?, ?, ?, ?)",
      ).run(crypto.randomUUID(), model.id, inputPrice, outputPrice, cachePrice, cacheWritePrice);
  }

  // Update the previous built-in Codex prices without overwriting custom tiers.
  const codexPricingUpdates = [
    ["gpt-5.6-luna", 1, 6, 0.1, 0.2, 1.2, 0.02, 0.25],
    ["gpt-5.6-sol", 5, 30, 0.5, 4, 20, 0.4, 5],
    ["gpt-5.6-terra", 2.5, 15, 0.25, 2, 12, 0.2, 2.5],
  ] as const;
  for (const [modelName, oldInput, oldOutput, oldCache, inputPrice, outputPrice, cachePrice, cacheWritePrice] of codexPricingUpdates) {
    db.query(
      `UPDATE model_pricing_tiers SET input_per_million = ?, output_per_million = ?, cache_read_per_million = ?, cache_write_per_million = ?
       WHERE threshold_tokens = 0 AND input_per_million = ? AND output_per_million = ? AND cache_read_per_million = ? AND cache_write_per_million = 0
         AND model_id IN (SELECT m.id FROM models m JOIN providers p ON p.id = m.provider_id WHERE p.protocol = 'codex' AND lower(m.model_id) = ?)`,
    ).run(inputPrice, outputPrice, cachePrice, cacheWritePrice, oldInput, oldOutput, oldCache, modelName);
  }

  const antigravityPricingDefaults = [
    ["claude-opus-4-6-thinking", 15, 75, 1.5],
    ["claude-sonnet-4-6", 3, 15, 0.3],
    ["gemini-2.5-flash", 0.3, 2.5, 0.03],
    ["gemini-2.5-flash-lite", 0.1, 0.4, 0.01],
    ["gemini-2.5-flash-thinking", 0.3, 2.5, 0.03],
    ["gemini-2.5-pro", 1.25, 10, 0.125],
    ["gemini-3-flash", 0.9, 5.4, 0.09],
    ["gemini-3-flash-agent", 0.9, 5.4, 0.09],
    ["gemini-3.1-flash-image", 0.3, 2.5, 0.03],
    ["gemini-3.1-flash-lite", 0.1, 0.4, 0.01],
    ["gemini-3.1-pro-high", 2, 12, 0.2],
    ["gemini-3.1-pro-low", 2, 12, 0.2],
    ["gemini-pro-agent", 2, 12, 0.2],
    ["gemini-3.5-flash-extra-low", 1.5, 9, 0.15],
    ["gemini-3.5-flash-low", 1.5, 9, 0.15],
    ["gemini-3.6-flash-high", 1.5, 7.5, 0.15],
    ["gemini-3.6-flash-medium", 1.5, 7.5, 0.15],
    ["gemini-3.6-flash-low", 1.5, 7.5, 0.15],
    ["gpt-oss-120b-medium", 0.09, 0.36, 0],
  ] as const;
  for (const [
    modelName,
    inputPrice,
    outputPrice,
    cachePrice,
  ] of antigravityPricingDefaults) {
    const models = db
      .query(
        `SELECT m.id FROM models m JOIN providers p ON p.id = m.provider_id
       WHERE p.protocol = 'antigravity' AND replace(lower(m.model_id), 'googleantigravity/', '') = ?
         AND NOT EXISTS (SELECT 1 FROM model_pricing_tiers t WHERE t.model_id = m.id)`,
      )
      .all(modelName) as { id: string }[];
    for (const model of models)
      db.query(
        "INSERT INTO model_pricing_tiers (id, model_id, threshold_tokens, input_per_million, output_per_million, cache_read_per_million, cache_write_per_million) VALUES (?, ?, 0, ?, ?, ?, 0)",
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

  const rotationCols = db
    .query("PRAGMA table_info(provider_credential_rotation)")
    .all() as { name: string }[];
  if (!rotationCols.find((c) => c.name === "request_sequence"))
    db.exec(
      "ALTER TABLE provider_credential_rotation ADD COLUMN request_sequence INTEGER NOT NULL DEFAULT 0",
    );
  const cooldownCols = db
    .query("PRAGMA table_info(provider_credential_cooldown)")
    .all() as { name: string }[];
  if (!cooldownCols.find((c) => c.name === "cooldown_until_sequence"))
    db.exec(
      "ALTER TABLE provider_credential_cooldown ADD COLUMN cooldown_until_sequence INTEGER NOT NULL DEFAULT 0",
    );

  const providerRows = db
    .query(
      "SELECT id, api_key, protocol FROM providers WHERE api_key IS NOT NULL AND api_key != ''",
    )
    .all() as { id: string; api_key: string; protocol: string }[];
  for (const provider of providerRows) {
    const existing = db
      .query(
        "SELECT id FROM provider_credentials WHERE provider_id = ? LIMIT 1",
      )
      .get(provider.id);
    if (!existing) {
      const credentialId = crypto.randomUUID();
      db.query(
        "INSERT INTO provider_credentials (id, provider_id, label, kind, secret, is_active) VALUES (?, ?, ?, ?, ?, 1)",
      ).run(
        credentialId,
        provider.id,
        provider.protocol === "codex"
          ? "Codex session"
          : provider.protocol === "chatgpt"
            ? "ChatGPT session"
            : "Default API key",
        provider.protocol === "codex"
          ? "codex"
          : provider.protocol === "chatgpt"
            ? "chatgpt"
            : "api_key",
        encryptSecret(provider.api_key),
      );
      db.query("UPDATE providers SET fixed_credential_id = ? WHERE id = ?").run(
        credentialId,
        provider.id,
      );
    }
    const encryptedApiKey = encryptSecret(provider.api_key);
    if (encryptedApiKey !== provider.api_key) {
      db.query("UPDATE providers SET api_key = ? WHERE id = ?").run(
        encryptedApiKey,
        provider.id,
      );
    }
  }

  const credentialSecrets = db
    .query("SELECT id, secret FROM provider_credentials WHERE secret IS NOT NULL")
    .all() as { id: string; secret: string }[];
  for (const credential of credentialSecrets) {
    const encrypted = encryptSecret(credential.secret);
    if (encrypted !== credential.secret) {
      db.query("UPDATE provider_credentials SET secret = ? WHERE id = ?").run(
        encrypted,
        credential.id,
      );
    }
  }

  db.query("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run(
    "chat_title_model",
    "auto",
  );
  db.query("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run(
    "persist_model_per_chat",
    "false",
  );

  const existingPassword = db
    .query("SELECT value FROM settings WHERE key = ?")
    .get("panel_password") as { value: string } | undefined;

  if (!existingPassword && config.defaultPassword) {
    const hash = Bun.password.hashSync(config.defaultPassword, {
      algorithm: "bcrypt",
      cost: 10,
    });
    db.query("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "panel_password",
      hash,
    );
  }

  if (config.profileName) {
    db.query("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run(
      "profile_name",
      config.profileName,
    );
  }
}
