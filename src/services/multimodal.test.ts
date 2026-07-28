import { describe, expect, test } from "bun:test";
import { validateMultimodalRequest, parseDataImage } from "./multimodal";
import { validateModelRequest } from "./request-validation";

const model: any = {
  model_id: "vision-test",
  context_window: 1000,
  max_output_tokens: null,
  capabilities: { vision: true, tools: null },
};

describe("multimodal request validation", () => {
  test("accepts remote and base64 image URLs", () => {
    expect(() => validateMultimodalRequest({ messages: [{ role: "user", content: [
      { type: "image_url", image_url: { url: "https://example.com/a.png" } },
      { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } },
    ] }] }, model)).not.toThrow();
  });

  test("rejects images for models without vision", () => {
    expect(() => validateModelRequest(
      { messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://example.com/a.png" } }] }] },
      { ...model, capabilities: { ...model.capabilities, vision: false } },
    )).toThrow("does not support images");
  });

  test("parses base64 image metadata", () => {
    expect(parseDataImage("data:image/jpeg;base64,aGVsbG8=")).toEqual({
      mimeType: "image/jpeg",
      data: "aGVsbG8=",
      bytes: 5,
    });
  });
});
