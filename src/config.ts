import { dirname } from "node:path";

const isProduction = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET;
const encryptionKey = process.env.KLOVE_ENCRYPTION_KEY;
const defaultPassword = process.env.DEFAULT_PASSWORD;

if (!jwtSecret || !encryptionKey || !defaultPassword) {
  throw new Error(
    "JWT_SECRET, KLOVE_ENCRYPTION_KEY, and DEFAULT_PASSWORD must be configured",
  );
}

if (isProduction) {
  const weakValues = new Set([
    "klove-jwt-secret-change-in-production",
    "klove-credential-encryption-key-change-in-production",
    "klove123",
  ]);
  if (
    weakValues.has(jwtSecret) ||
    weakValues.has(encryptionKey) ||
    weakValues.has(defaultPassword) ||
    jwtSecret === encryptionKey ||
    defaultPassword.length < 12
  ) {
    throw new Error(
      "Production requires strong, distinct JWT_SECRET, KLOVE_ENCRYPTION_KEY, and DEFAULT_PASSWORD values",
    );
  }
}

export const config = {
  port: parseInt(process.env.PORT || "3000"),
  jwtSecret,
  dbPath: process.env.DB_PATH || "./data/klove.db",
  defaultPassword,
  isDev: !isProduction,
  encryptionKey,
  jwtExpirationSeconds: 8 * 60 * 60,
  logLevel: process.env.LOG_LEVEL || "info",
  get dataDir(): string {
    return dirname(this.dbPath);
  },
};
