import { describe, expect, test } from "bun:test";
import { generateDisplayName } from "./model-name";
import { parseModelName } from "../clients/openai";

describe("generateDisplayName", () => {
  test.each([
    ["nousportal/inclusionai/ling-3.0-flash:free", "Ling 3.0 Flash (Free)"],
    ["nousportal/poolside/laguna-s-2.1:free", "Laguna S 2.1 (Free)"],
    ["opencodezen/deepseek-v4-flash-free", "Deepseek V4 Flash (Free)"],
    ["orcarouter/gpt-5-nano", "GPT 5 Nano"],
    ["orcarouter/hy3", "Hy3"],
  ])("formats %s", (modelId, expected) => {
    expect(generateDisplayName(modelId)).toBe(expected);
  });
});

describe("parseModelName", () => {
  test("allows internal slashes", () => expect(parseModelName("provider/org/model")).toEqual({ providerName: "provider", modelId: "org/model" }));
  test.each(["", "/model", "provider/", "provider//model", "provider/ model", "provider/\nmodel"])("rejects %j", (model) => expect(parseModelName(model)).toBeNull());
});
