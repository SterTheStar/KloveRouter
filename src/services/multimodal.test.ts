import { describe, expect, test } from "bun:test";
import { validateMultimodalRequest, parseDataImage, parseDataMedia } from "./multimodal";
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

  test("parses supported audio and video data URL metadata", () => {
    expect(parseDataMedia("data:audio/wav;base64,YWJj")).toEqual({ mimeType: "audio/wav", data: "YWJj", bytes: 3 });
    expect(parseDataMedia("data:video/mp4;base64,YWJj")).toEqual({ mimeType: "video/mp4", data: "YWJj", bytes: 3 });
  });

  test("validates audio, video, and file capabilities and payloads", () => {
    const request = { messages: [{ role: "user", content: [
      { type: "input_audio", input_audio: { data: "aGVsbG8=", format: "wav" } },
      { type: "video_url", video_url: { url: "https://example.com/clip.mp4" } },
      { type: "file", file: { file_id: "file_123" } },
    ] }] };
    const capable = { ...model, capabilities: { ...model.capabilities, audio_input: true, video: true, attachments: true } };
    expect(() => validateMultimodalRequest(request, capable)).not.toThrow();
    expect(() => validateMultimodalRequest(request, { ...capable, capabilities: { ...capable.capabilities, audio_input: false } })).toThrow("does not support audio");
  });

  test("rejects malformed audio and insecure media URLs", () => {
    expect(() => validateMultimodalRequest({ messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: "abc" } }] }] }, model)).toThrow("audio format");
    expect(() => validateMultimodalRequest({ messages: [{ role: "user", content: [{ type: "video_url", video_url: { url: "http://example.com/clip.mp4" } }] }] }, model)).toThrow("HTTPS");
  });
});
