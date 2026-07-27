import { cavemanBinary } from "./caveman.binary";
import type { CavemanLevel } from "./caveman.types";

export const CAVEMAN_LEVELS: CavemanLevel[] = [
  "lite", "full", "ultra",
  "wenyan-lite", "wenyan-full", "wenyan-ultra",
];

function extractLevelPrompt(skillContent: string, level: CavemanLevel): string {
  const label = level;
  const regex = new RegExp(`\\|\\s*\\*\\*${label}\\*\\*\\s*\\|(.+?)\\|`);
  const match = skillContent.match(regex);
  if (match) return match[1].trim();

  throw new Error(`Level "${level}" not found in Caveman SKILL.md`);
}

export async function getCavemanPrompt(level: CavemanLevel): Promise<string> {
  const skillContent = await cavemanBinary.readSkill();
  if (!skillContent) throw new Error("Caveman skill not installed. Run install first.");

  return extractLevelPrompt(skillContent, level);
}
