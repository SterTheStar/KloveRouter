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

    CREATE TABLE IF NOT EXISTS api_keys (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      key_hash    TEXT NOT NULL,
      prefix      TEXT NOT NULL,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migrate existing tables: add avatar column if missing
  const cols = db
    .query("PRAGMA table_info(providers)")
    .all() as { name: string }[];
  if (!cols.find((c) => c.name === "avatar")) {
    db.exec("ALTER TABLE providers ADD COLUMN avatar TEXT");
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
