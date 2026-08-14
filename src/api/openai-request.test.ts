import { describe, expect, test } from "bun:test";
import { validateChatCompletionRequest } from "./openai-request";

describe("validateChatCompletionRequest", () => {
  test("accepts a valid OpenAI chat request", () => {
    expect(validateChatCompletionRequest({
      model: "provider/model",
      messages: [],
    })).toBeNull();
  });

  test("rejects missing, blank, or malformed model and messages", () => {
    for (const body of [
      null,
      {},
      { model: "", messages: [] },
      { model: "  ", messages: [] },
      { model: "provider/model" },
      { model: "provider/model", messages: {} },
    ]) {
      expect(validateChatCompletionRequest(body)).toBe(
        "model and messages are required",
      );
    }
  });
});
