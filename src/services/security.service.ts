import { randomBytes } from "node:crypto";
import type { Database } from "bun:sqlite";
import { config } from "../config";

const JWT_SECRET_SETTING = "security_jwt_secret";
const ENCRYPTION_KEY_SETTING = "security_encryption_key";

let effectiveSecrets: { jwtSecret: string; encryptionKey: string } | null = null;

function readSetting(db: Database, key: string) {
  return (db.query("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value;
}

function secureRandomSecret() {
  return randomBytes(48).toString("base64url");
}

export function initializeSecurity(db: Database) {
  db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const jwtSecret = readSetting(db, JWT_SECRET_SETTING) || config.jwtSecret || secureRandomSecret();
  let encryptionKey =
    readSetting(db, ENCRYPTION_KEY_SETTING) ||
    config.encryptionKey ||
    secureRandomSecret();
  if (jwtSecret === encryptionKey) encryptionKey = secureRandomSecret();
  if (jwtSecret === encryptionKey) throw new Error("JWT and encryption secrets must be distinct");
  db.query("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run(JWT_SECRET_SETTING, jwtSecret);
  db.query("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run(ENCRYPTION_KEY_SETTING, encryptionKey);
  effectiveSecrets = { jwtSecret, encryptionKey };
}

export function getSecuritySecrets(db?: Database) {
  if (!effectiveSecrets && db) initializeSecurity(db);
  if (!effectiveSecrets) throw new Error("Security secrets have not been initialized");
  return effectiveSecrets;
}

export function resetSecurityForTests() {
  effectiveSecrets = null;
}
