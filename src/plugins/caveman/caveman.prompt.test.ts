import { describe, expect, it } from "bun:test";
import { extractLevelPrompt } from "./caveman.prompt";

describe("extractLevelPrompt", () => {
  const legacySkill = [
    "| Level | Prompt |",
    "| --- | --- |",
    "| **lite** | Be short. |",
    "| **full** | Explain clearly. |",
    "| **ultra** | Explain deeply. |",
  ].join("\n");

  const v4Skill = [
    "| Level | Prompt |",
    "| --- | --- |",
    "| **caveman** | Be terse. |",
    "| **ultracave** | Max short. |",
    "| **megacave** | 以文言答。 |",
  ].join("\n");

  it("extracts canonical levels from v4 table", () => {
    expect(extractLevelPrompt(v4Skill, "caveman")).toBe("Be terse.");
    expect(extractLevelPrompt(v4Skill, "ultracave")).toBe("Max short.");
    expect(extractLevelPrompt(v4Skill, "megacave")).toBe("以文言答。");
    expect(extractLevelPrompt(v4Skill, "ultra")).toBe("Max short.");
    expect(extractLevelPrompt(v4Skill, "wenyan")).toBe("以文言答。");
  });

  it("extracts from legacy table and falls back gracefully", () => {
    expect(extractLevelPrompt(legacySkill, "lite")).toBe("Be short.");
    expect(extractLevelPrompt(legacySkill, "full")).toBe("Explain clearly.");
    expect(extractLevelPrompt(legacySkill, "caveman")).toBe("Explain clearly.");
    expect(extractLevelPrompt(legacySkill, "ultra")).toBe("Explain deeply.");
    expect(extractLevelPrompt(legacySkill, "ultracave")).toBe("Explain deeply.");
  });

  it("rejects missing levels", () => {
    expect(() => extractLevelPrompt(legacySkill, "wenyan")).toThrow("not found");
    expect(() => extractLevelPrompt(legacySkill, "wenyan-lite")).toThrow("not found");
  });
});
