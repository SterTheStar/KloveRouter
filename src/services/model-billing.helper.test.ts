import { describe, expect, test } from "bun:test";
import { isFreeModel } from "./model-billing.helper";

describe("isFreeModel helper", () => {
  test("identifies explicit is_free: true", () => {
    expect(isFreeModel({ id: "some-model", is_free: true })).toBe(true);
    expect(isFreeModel({ model_id: "custom-internal", is_free: true })).toBe(true);
    expect(isFreeModel({ id: "custom", is_free: false })).toBe(false);
  });

  test("identifies free models by model_id or id with various formats", () => {
    // OpenRouter style :free
    expect(isFreeModel({ id: "google/gemini-2.0-flash-thinking-exp:free" })).toBe(true);
    expect(isFreeModel({ model_id: "meta-llama/llama-3.3-70b-instruct:free" })).toBe(true);
    expect(isFreeModel({ model_id: "deepseek/deepseek-r1:free" })).toBe(true);
    expect(isFreeModel({ id: "qwen/qwen-2.5-coder-32b-instruct:free" })).toBe(true);

    // Suffix with hyphen
    expect(isFreeModel({ model_id: "jev-1.13-free" })).toBe(true);
    expect(isFreeModel({ id: "deepseek-coder-free" })).toBe(true);

    // Prefix with hyphen or slash
    expect(isFreeModel({ model_id: "free-model-v1" })).toBe(true);
    expect(isFreeModel({ id: "openrouter/free" })).toBe(true);
    expect(isFreeModel({ model_id: "free" })).toBe(true);

    // Underscore or dot
    expect(isFreeModel({ id: "model_free" })).toBe(true);
    expect(isFreeModel({ model_id: "model.free" })).toBe(true);
  });

  test("does not false-positive on words containing free as substring", () => {
    expect(isFreeModel({ id: "freeze-v1" })).toBe(false);
    expect(isFreeModel({ id: "freedom-chat" })).toBe(false);
    expect(isFreeModel({ id: "freestyle-7b" })).toBe(false);
    expect(isFreeModel({ id: "gpt-4o" })).toBe(false);
    expect(isFreeModel({ id: "claude-3-7-sonnet" })).toBe(false);
  });
});
