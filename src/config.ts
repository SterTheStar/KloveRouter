import { dirname, join } from "node:path";

export const config = {
  port: parseInt(process.env.PORT || "3000"),
  jwtSecret: process.env.JWT_SECRET || "klove-jwt-secret-change-in-production",
  dbPath: process.env.DB_PATH || "./data/klove.db",
  defaultPassword: process.env.DEFAULT_PASSWORD || "klove123",
  isDev: process.env.NODE_ENV !== "production",
  encryptionKey:
    process.env.KLOVE_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "klove-credential-encryption-key-change-in-production",
  logLevel: process.env.LOG_LEVEL || "info",
  get dataDir(): string {
    return dirname(this.dbPath);
  },
};
