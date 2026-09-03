import { describe, expect, test } from "bun:test";
import {
  normalizeToolDefinitions,
  normalizeToolName,
  validateToolName,
} from "./tool-names";

describe("tool name compatibility", () => {
  test("supports fragmented names and ignores repeated complete names", () => {
    let name = normalizeToolName("", "Enter");
    name = normalizeToolName(name, "Plan");
    name = normalizeToolName(name, "Mode");
    name = normalizeToolName(name, "EnterPlanMode");
    expect(name).toBe("EnterPlanMode");
  });

  test("collapses repeated upstream names", () => {
    expect(normalizeToolName("", "AgentAgentAgent")).toBe("Agent");
  });

  test("validates protocol-safe names", () => {
    expect(validateToolName("EnterPlanMode")).toBe(true);
    expect(validateToolName("bad.name")).toBe(false);
    expect(validateToolName("a".repeat(129))).toBe(false);
  });

  test("deduplicates tool definitions by normalized name", () => {
    expect(normalizeToolDefinitions([
      { type: "function", function: { name: "lookup", parameters: {} } },
      { type: "function", function: { name: "lookup", parameters: { type: "object" } } },
    ])).toHaveLength(1);
  });
});
