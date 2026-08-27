import { describe, expect, test } from "bun:test";
import type { Model } from "./model.service";
import {
  estimateRequestTextTokens,
  resolveRequestedOutputTokens,
  validateModelRequest,
} from "./request-validation";

const model = {
  model_id: "metadata-model",
  context_window: 100,
  max_output_tokens: 40,
  capabilities: { tools: true },
} as Model;

describe("metadata-backed request validation", () => {
  test("accepts equivalent output aliases and rejects conflicts or invalid values", () => {
    expect(
      resolveRequestedOutputTokens({ max_completion_tokens: 20, max_tokens: 20 }),
    ).toEqual({ field: "max_completion_tokens", value: 20 });
    expect(() =>
      resolveRequestedOutputTokens({ max_output_tokens: 20, max_tokens: 21 }),
    ).toThrow("Conflicting output token limits");
    for (const value of [0, -1, 1.5, "10", null])
      expect(() => resolveRequestedOutputTokens({ max_tokens: value })).toThrow(
        "positive integer",
      );
  });

  test("enforces known output limit for every alias", () => {
    for (const field of [
      "max_output_tokens",
      "max_completion_tokens",
      "max_tokens",
    ])
      expect(() => validateModelRequest({ [field]: 41 }, model)).toThrow(
        "maximum output of 40",
      );
  });

  test("preserves original output token fields and does not map to a single alias", () => {
    const body: Record<string, unknown> = {
      max_completion_tokens: 20,
      max_tokens: 20,
    };
    validateModelRequest(body, model);
    expect(body).toEqual({ max_completion_tokens: 20, max_tokens: 20 });
  });

  test("accepts provider-specific output limits when metadata allows them", () => {
    expect(() => validateModelRequest({ max_completion_tokens: 485298 }, {
      ...model,
      max_output_tokens: 500000,
      context_window: null,
    })).not.toThrow();
  });

  test("enforces explicitly false tools while unknown metadata stays permissive", () => {
    expect(() =>
      validateModelRequest(
        { messages: [], tools: [] },
        { ...model, capabilities: { ...model.capabilities, tools: false } },
      ),
    ).toThrow("does not support tools or functions");
    expect(() =>
      validateModelRequest(
        { messages: [], functions: [] },
        { ...model, capabilities: { ...model.capabilities, tools: false } },
      ),
    ).toThrow("does not support tools or functions");
    expect(() =>
      validateModelRequest(
        { messages: [], tools: [{}], max_tokens: 100000 },
        {
          ...model,
          context_window: null,
          max_output_tokens: null,
          capabilities: { ...model.capabilities, tools: null },
        },
      ),
    ).not.toThrow();
  });

  test("uses only text characters for a conservative context estimate", () => {
    const body = {
      messages: [
        { role: "user", content: "a".repeat(201) },
        { role: "user", content: [{ type: "text", text: "b".repeat(39) }] },
         { role: "user", content: [{ type: "image_url", image_url: { url: "https://example.com/large.png" } }] },
      ],
      max_tokens: 40,
    };
    expect(estimateRequestTextTokens(body)).toBe(60);
    expect(() => validateModelRequest(body, model)).not.toThrow();
    body.messages[0].content = "a".repeat(205);
    expect(() => validateModelRequest(body, model)).toThrow(
      "estimated 61 input tokens + 40 requested output tokens = 101",
    );
    expect(() => validateModelRequest(body, model)).toThrow("not truncated");
  });
});
