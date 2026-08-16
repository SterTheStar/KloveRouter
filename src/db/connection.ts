import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config";
import { initSchema } from "./schema";
import { initializeSecurity } from "../services/security.service";

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    if (config.dbPath !== ":memory:") {
      mkdirSync(dirname(config.dbPath), { recursive: true });
    }
    db = new Database(config.dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    initializeSecurity(db);
    initSchema(db);
  }
  return db;
}
