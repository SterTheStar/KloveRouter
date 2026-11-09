import { getDb } from "../../db/connection";
import { getCavemanPrompt, CAVEMAN_LEVELS } from "./caveman.prompt";
import { cavemanBinary } from "./caveman.binary";
import { logger } from "../../logger";
import type { CavemanCanonicalLevel, CavemanLevel, CavemanStatus } from "./caveman.types";

export function normalizeCavemanLevel(level: string | null | undefined): CavemanCanonicalLevel {
  if (level === "ultracave" || level === "ultra") return "ultracave";
  if (
    level === "megacave" ||
    level === "wenyan" ||
    level === "wenyan-lite" ||
    level === "wenyan-full" ||
    level === "wenyan-ultra"
  ) {
    return "megacave";
  }
  return "caveman";
}

export function isCavemanEnabled(): boolean {
  const db = getDb();
  const row = db
    .query("SELECT value FROM settings WHERE key = ?")
    .get("caveman_enabled") as { value: string } | undefined;
  return row?.value === "1";
}

export function getCavemanLevel(): CavemanCanonicalLevel {
  const db = getDb();
  const row = db
    .query("SELECT value FROM settings WHERE key = ?")
    .get("caveman_level") as { value: string } | undefined;
  if (row && CAVEMAN_LEVELS.includes(row.value as CavemanLevel)) {
    return normalizeCavemanLevel(row.value);
  }
  return "caveman";
}

export function setCavemanEnabled(enabled: boolean): void {
  const db = getDb();
  db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    "caveman_enabled",
    enabled ? "1" : "0",
  );
}

export function setCavemanLevel(level: CavemanLevel): void {
  const normalized = normalizeCavemanLevel(level);
  const db = getDb();
  db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    "caveman_level",
    normalized,
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

  const systemIndex = messages.findIndex((m: any) => m.role === "system");
  const developerIndex = systemIndex >= 0 ? -1 : messages.findIndex((m: any) => m.role === "developer");
  const targetIndex = systemIndex >= 0 ? systemIndex : developerIndex;

  if (targetIndex >= 0) {
    const updated = [...messages];
    const target = updated[targetIndex];
    const content = target.content;
    const injected = typeof content === "string"
      ? `${prompt}\n\n${content}`
      : Array.isArray(content)
        ? [{ type: "text", text: prompt }, ...content]
        : [{ type: "text", text: prompt }, ...(content ? [content] : [])];
    updated[targetIndex] = {
      ...target,
      role: target.role,
      content: injected,
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
