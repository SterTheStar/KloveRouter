import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { initSchema } from "./schema";

describe("model timestamps", () => {
  test("adds updated_at to an existing models table without changing created_at", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE models (
        id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, model_id TEXT NOT NULL,
        display_name TEXT, is_manual INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO models (id, provider_id, model_id, created_at)
      VALUES ('model', 'provider', 'test', '2020-01-02 03:04:05');
    `);
    initSchema(db);
    expect(
      db.query("SELECT created_at, updated_at FROM models WHERE id = 'model'").get(),
    ).toEqual({
      created_at: "2020-01-02 03:04:05",
      updated_at: "2020-01-02 03:04:05",
    });
    db.close();
  });

  test("fresh schema gives models independent creation and update timestamps", () => {
    const db = new Database(":memory:");
    initSchema(db);
    const columns = db.query("PRAGMA table_info(models)").all() as Array<{
      name: string;
      dflt_value: string | null;
    }>;
    expect(columns.find((column) => column.name === "created_at")?.dflt_value).toContain("datetime");
    expect(columns.find((column) => column.name === "updated_at")?.dflt_value).toContain("datetime");
    db.exec(`
      INSERT INTO providers (id, name, base_url, api_key)
      VALUES ('provider', 'Provider', 'https://example.com', 'key');
      INSERT INTO models (id, provider_id, model_id, created_at, updated_at)
      VALUES ('model', 'provider', 'test', '2020-01-02 03:04:05', '2020-01-02 03:04:05');
      UPDATE models SET display_name = 'Updated' WHERE id = 'model';
    `);
    const timestamps = db
      .query("SELECT created_at, updated_at FROM models WHERE id = 'model'")
      .get() as { created_at: string; updated_at: string };
    expect(timestamps.created_at).toBe("2020-01-02 03:04:05");
    expect(timestamps.updated_at).not.toBe(timestamps.created_at);
    db.close();
  });
});

describe("model think tag fix", () => {
  test("defaults the option to disabled in a fresh schema", () => {
    const db = new Database(":memory:");
    initSchema(db);
    const mode = (db.query("PRAGMA table_info(models)").all() as Array<{
      name: string;
      dflt_value: string | null;
    }>).find((item) => item.name === "think_opening_tag_mode");
    expect(mode?.dflt_value).toBe("'off'");
    db.close();
  });

  test("migrates an existing models table and preserves its rows", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE models (
        id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, model_id TEXT NOT NULL,
        display_name TEXT, is_manual INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO models (id, provider_id, model_id, display_name)
      VALUES ('model', 'provider', 'test', 'Existing');
    `);
    initSchema(db);
    expect(
      db.query(
        "SELECT display_name, think_opening_tag_mode FROM models WHERE id = 'model'",
      ).get(),
    ).toEqual({
      display_name: "Existing",
      think_opening_tag_mode: "off",
    });
    db.close();
  });

  test("migrates the legacy boolean into the enum column", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE models (
        id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, model_id TEXT NOT NULL,
        display_name TEXT, is_manual INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        fix_missing_think_opening_tag INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO models (id, provider_id, model_id, display_name, fix_missing_think_opening_tag)
      VALUES ('off-model', 'provider', 'off-model', 'Off', 0),
             ('detect-model', 'provider', 'detect-model', 'Detect', 1);
    `);
    initSchema(db);
    expect(
      db.query("SELECT display_name, think_opening_tag_mode FROM models ORDER BY display_name ASC").all(),
    ).toEqual([
      { display_name: "Detect", think_opening_tag_mode: "detect" },
      { display_name: "Off", think_opening_tag_mode: "off" },
    ]);
    db.close();
  });

  test("does not overwrite a later force value on re-init", () => {
    const db = new Database(":memory:");
    initSchema(db);
    db.exec(`
      INSERT INTO providers (id, name, base_url, api_key)
      VALUES ('provider', 'Provider', 'https://example.com', 'key');
      INSERT INTO models (id, provider_id, model_id, think_opening_tag_mode)
      VALUES ('model', 'provider', 'test', 'force');
    `);
    initSchema(db);
    expect(
      db.query("SELECT think_opening_tag_mode FROM models WHERE id = 'model'").get(),
    ).toEqual({ think_opening_tag_mode: "force" });
    db.close();
  });
});

describe("chat settings", () => {
  test("seeds per-chat model persistence disabled", () => {
    const db = new Database(":memory:");
    initSchema(db);
    expect(
      db.query("SELECT value FROM settings WHERE key = ?")
        .get("persist_model_per_chat"),
    ).toEqual({ value: "false" });
    db.close();
  });

  test("preserves an existing per-chat model persistence setting", () => {
    const db = new Database(":memory:");
    initSchema(db);
    db.query("UPDATE settings SET value = ? WHERE key = ?").run(
      "true",
      "persist_model_per_chat",
    );
    initSchema(db);
    expect(
      db.query("SELECT value FROM settings WHERE key = ?")
        .get("persist_model_per_chat"),
    ).toEqual({ value: "true" });
    db.close();
  });
});
