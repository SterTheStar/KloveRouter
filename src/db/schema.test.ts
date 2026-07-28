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
