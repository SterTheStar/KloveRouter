import { dirname } from "node:path";

const isProduction = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET?.trim() || undefined;
const encryptionKey = process.env.KLOVE_ENCRYPTION_KEY?.trim() || undefined;
const defaultPassword = process.env.DEFAULT_PASSWORD?.trim() || undefined;
const profileName = process.env.PROFILE_NAME?.trim() || undefined;

if (isProduction) {
  const weakValues = new Set([
    "klove-jwt-secret-change-in-production",
    "klove-credential-encryption-key-change-in-production",
    "klove123",
  ]);
  if (
    (jwtSecret && weakValues.has(jwtSecret)) ||
    (encryptionKey && weakValues.has(encryptionKey)) ||
    (defaultPassword && weakValues.has(defaultPassword)) ||
    (jwtSecret && encryptionKey && jwtSecret === encryptionKey) ||
    (defaultPassword && defaultPassword.length < 12)
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
  profileName,
  isDev: !isProduction,
  encryptionKey,
  jwtExpirationSeconds: 7 * 24 * 60 * 60,
  logLevel: process.env.LOG_LEVEL || "info",
  trustedProxyIps: new Set(
    (process.env.TRUSTED_PROXY_IPS || "")
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean),
  ),
  get dataDir(): string {
    return dirname(this.dbPath);
  },
};
