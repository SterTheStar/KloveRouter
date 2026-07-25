import { Database } from "bun:sqlite";
import { config } from "../config";
import { initSchema } from "./schema";

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    db = new Database(config.dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    initSchema(db);
  }
  return db;
}
