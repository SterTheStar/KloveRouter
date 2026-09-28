import { describe, expect, test } from "bun:test";
import { openAIEndpoint, parseModelName } from "./openai";

describe("parseModelName", () => {
  test("accepts nested model paths", () => {
    expect(parseModelName("provider/org/model")).toEqual({ providerName: "provider", modelId: "org/model" });
  });

  test.each(["", "provider", "/model", "provider/", "provider//model", " provider/model", "provider/model ", "provider/model\n"])("rejects %j", (value) => {
    expect(parseModelName(value)).toBeNull();
  });
});

describe("OpenAI-compatible endpoints", () => {
  test("builds versioned model and Responses API endpoint URLs", () => {
    expect(openAIEndpoint({ base_url: "https://api.example.test/v1/" } as any, "responses")).toBe("https://api.example.test/v1/responses");
    expect(openAIEndpoint({ base_url: "https://api.example.test" } as any, "models")).toBe("https://api.example.test/v1/models");
  });
});
