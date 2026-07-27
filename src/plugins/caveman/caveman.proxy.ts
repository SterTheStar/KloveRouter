import { getDb } from "../../db/connection";
import { getCavemanPrompt } from "./caveman.prompt";
import { cavemanBinary } from "./caveman.binary";
import type { CavemanLevel } from "./caveman.types";

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
  if (!(await cavemanBinary.isInstalled())) return messages;

  const level = getCavemanLevel();
  const prompt = await getCavemanPrompt(level);

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

export async function getCavemanStatus(): Promise<{
  enabled: boolean;
  level: CavemanLevel;
  installed: boolean;
  version: string | null;
  skillPath: string | null;
}> {
  return {
    enabled: isCavemanEnabled(),
    level: getCavemanLevel(),
    installed: await cavemanBinary.isInstalled(),
    version: "1.9.1",
    skillPath: await cavemanBinary.isInstalled() ? cavemanBinary.skillPath() : null,
  };
}
