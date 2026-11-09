import { cavemanBinary } from "./caveman.binary";
import type { CavemanCanonicalLevel, CavemanLevel } from "./caveman.types";

export const CAVEMAN_CANONICAL_LEVELS: CavemanCanonicalLevel[] = [
  "caveman",
  "ultracave",
  "megacave",
];

export const CAVEMAN_LEVELS: CavemanLevel[] = [
  "caveman",
  "ultracave",
  "megacave",
  "ultra",
  "wenyan",
  "lite",
  "full",
  "wenyan-lite",
  "wenyan-full",
  "wenyan-ultra",
];

function candidateLevelKeys(level: CavemanLevel): string[] {
  switch (level) {
    case "caveman":
      return ["caveman", "full", "lite"];
    case "lite":
      return ["lite", "caveman", "full"];
    case "full":
      return ["full", "caveman", "lite"];
    case "ultracave":
    case "ultra":
      return ["ultracave", "ultra"];
    case "megacave":
    case "wenyan":
      return ["megacave", "wenyan", "wenyan-full", "wenyan-lite", "wenyan-ultra"];
    case "wenyan-lite":
      return ["wenyan-lite", "megacave", "wenyan", "wenyan-full", "wenyan-ultra"];
    case "wenyan-full":
      return ["wenyan-full", "megacave", "wenyan", "wenyan-lite", "wenyan-ultra"];
    case "wenyan-ultra":
      return ["wenyan-ultra", "megacave", "wenyan", "wenyan-full", "wenyan-lite"];
    default:
      return [level];
  }
}

export function extractLevelPrompt(skillContent: string, level: CavemanLevel): string {
  const candidates = candidateLevelKeys(level);
  for (const candidate of candidates) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const line = skillContent.split(/\r?\n/).find((value) =>
      new RegExp(`^\\s*\\|\\s*\\*\\*${escaped}\\*\\*\\s*\\|`).test(value),
    );
    if (line) {
      const cells = line.split("|").map((cell) => cell.trim());
      const prompt = cells[2];
      if (prompt) return prompt;
    }
  }

  throw new Error(`Level "${level}" not found in Caveman SKILL.md`);
}

export async function getCavemanPrompt(level: CavemanLevel): Promise<string> {
  const skillContent = await cavemanBinary.readSkill();
  if (!skillContent) throw new Error("Caveman skill not installed. Run install first.");

  return extractLevelPrompt(skillContent, level);
}
