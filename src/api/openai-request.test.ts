import { describe, expect, test } from "bun:test";
import { validateChatCompletionRequest } from "./openai-request";

describe("validateChatCompletionRequest", () => {
  test("accepts a valid OpenAI chat request", () => {
    expect(validateChatCompletionRequest({
      model: "provider/model",
      messages: [{ role: "user", content: "hi" }],
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
      expect(validateChatCompletionRequest(body)).toMatch(/model|messages|object/);
    }
  });

  test("rejects an empty messages array with a specific reason", () => {
    expect(validateChatCompletionRequest({
      model: "provider/model",
      messages: [],
    })).toBe("messages must contain at least one message");
  });

  test("rejects messages without a role or with malformed content", () => {
    expect(validateChatCompletionRequest({
      model: "provider/model",
      messages: [{}],
    })).toBe("messages[0].role is required and must be a string");
    expect(validateChatCompletionRequest({
      model: "provider/model",
      messages: [{ role: "user" }],
    })).toBe("messages[0].content must be a string or content parts array");
    expect(validateChatCompletionRequest({
      model: "provider/model",
      messages: ["nope"],
    })).toBe("messages[0] must be an object");
    expect(validateChatCompletionRequest({
      model: "provider/model",
      messages: [{ role: "assistant", tool_calls: [{ function: { name: "x" } }] }],
    })).toBeNull();
  });
});
