import { getDb } from "../../db/connection";
import { getCavemanPrompt } from "./caveman.prompt";
import { cavemanBinary } from "./caveman.binary";
import { logger } from "../../logger";
import type { CavemanLevel, CavemanStatus } from "./caveman.types";

const VALID_LEVELS: CavemanLevel[] = [
  "lite", "full", "ultra",
  "wenyan-lite", "wenyan-full", "wenyan-ultra",
];

export function isCavemanEnabled(): boolean {
  const db = getDb();
  const row = db
    .query("SELECT value FROM settings WHERE key = ?")
    .get("caveman_enabled") as { value: string } | undefined;
  return row?.value === "1";
}

export function getCavemanLevel(): CavemanLevel {
  const db = getDb();
  const row = db
    .query("SELECT value FROM settings WHERE key = ?")
    .get("caveman_level") as { value: string } | undefined;
  if (row && VALID_LEVELS.includes(row.value as CavemanLevel)) {
    return row.value as CavemanLevel;
  }
  return "full";
}

export function setCavemanEnabled(enabled: boolean): void {
  const db = getDb();
  db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    "caveman_enabled",
    enabled ? "1" : "0",
  );
}

export function setCavemanLevel(level: CavemanLevel): void {
  const db = getDb();
  db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    "caveman_level",
    level,
  );
}

export async function injectCavemanPrompt(messages: any[]): Promise<any[]> {
  if (!isCavemanEnabled()) return messages;
  if (!(await cavemanBinary.isInstalled())) {
    logger.warn("Caveman enabled but skill not installed — skipping injection");
    return messages;
  }

  const level = getCavemanLevel();
  let prompt: string;
  try {
    prompt = await getCavemanPrompt(level);
  } catch (error) {
    logger.error("Failed to load Caveman prompt", { error, level });
    return messages;
  }

  logger.info(`Caveman injecting prompt (level: ${level})`);

  const systemIndex = messages.findIndex(
    (m: any) => m.role === "system" || m.role === "developer",
  );

  if (systemIndex >= 0) {
    const updated = [...messages];
    updated[systemIndex] = {
      ...updated[systemIndex],
      content: `${prompt}\n\n${updated[systemIndex].content}`,
    };
    return updated;
  }

  return [{ role: "system", content: prompt }, ...messages];
}

function normalizeVersion(v: string | null): string {
  if (!v) return "";
  return v.replace(/^v/, "").trim();
}

export async function getCavemanStatus(): Promise<CavemanStatus> {
  const installed = await cavemanBinary.isInstalled();
  const version = installed ? await cavemanBinary.currentVersion() : null;

  const latestVersion = installed ? await cavemanBinary.checkLatestVersion() : null;
  const updateAvailable = Boolean(
    latestVersion && normalizeVersion(latestVersion) !== normalizeVersion(version),
  );

  return {
    enabled: isCavemanEnabled(),
    level: getCavemanLevel(),
    installed,
    version,
    skillPath: installed ? cavemanBinary.skillPath() : null,
    latestVersion,
    updateAvailable,
  };
}
