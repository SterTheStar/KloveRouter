import { cavemanBinary } from "./caveman.binary";
import type { CavemanLevel } from "./caveman.types";

export const CAVEMAN_LEVELS: CavemanLevel[] = [
  "lite", "full", "ultra",
  "wenyan-lite", "wenyan-full", "wenyan-ultra",
];

export function extractLevelPrompt(skillContent: string, level: CavemanLevel): string {
  const escaped = level.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = skillContent.split(/\r?\n/).find((value) =>
    new RegExp(`^\\s*\\|\\s*\\*\\*${escaped}\\*\\*\\s*\\|`).test(value),
  );
  if (line) {
    const cells = line.split("|").map((cell) => cell.trim());
    const prompt = cells[2];
    if (prompt) return prompt;
  }

  throw new Error(`Level "${level}" not found in Caveman SKILL.md`);
}

export async function getCavemanPrompt(level: CavemanLevel): Promise<string> {
  const skillContent = await cavemanBinary.readSkill();
  if (!skillContent) throw new Error("Caveman skill not installed. Run install first.");

  return extractLevelPrompt(skillContent, level);
}
