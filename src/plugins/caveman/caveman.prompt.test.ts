import { describe, expect, it } from "bun:test";
import { extractLevelPrompt } from "./caveman.prompt";

describe("extractLevelPrompt", () => {
  const skill = [
    "| Level | Prompt |",
    "| --- | --- |",
    "| **lite** | Be short. |",
    "| **full** | Explain clearly. |",
    "| **ultra** | Explain deeply. |",
  ].join("\n");

  it("extracts a level from a markdown table", () => {
    expect(extractLevelPrompt(skill, "lite")).toBe("Be short.");
    expect(extractLevelPrompt(skill, "full")).toBe("Explain clearly.");
  });

  it("rejects missing levels", () => {
    expect(() => extractLevelPrompt(skill, "wenyan-lite")).toThrow("not found");
  });
});
