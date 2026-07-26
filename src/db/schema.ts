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
      tokens_total      INTEGER NOT NULL DEFAULT 0,
      duration_ms       INTEGER NOT NULL DEFAULT 0,
      generation_duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
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
  if (!usageCols.find((c) => c.name === "generation_duration_ms")) db.exec("ALTER TABLE usage_log ADD COLUMN generation_duration_ms INTEGER NOT NULL DEFAULT 0");

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
