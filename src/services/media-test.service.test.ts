import { describe, expect, it } from "bun:test";
import { isMediaOnlyModel } from "./media-test.service";

describe("media-test.service", () => {
  it("identifies image generation models", () => {
    expect(
      isMediaOnlyModel({
        model_id: "dall-e-3",
        capabilities: { image_generation: true },
      }),
    ).toBe("image");

    expect(
      isMediaOnlyModel({
        model_id: "flux-schnell",
        capabilities: { image_generation: true },
      }),
    ).toBe("image");
  });

  it("identifies text-to-speech models", () => {
    expect(
      isMediaOnlyModel({
        model_id: "tts-1",
        capabilities: { text_to_speech: true },
      }),
    ).toBe("tts");

    expect(
      isMediaOnlyModel({
        model_id: "elevenlabs-voice",
        capabilities: { text_to_speech: true },
      }),
    ).toBe("tts");
  });

  it("identifies video generation models", () => {
    expect(
      isMediaOnlyModel({
        model_id: "sora-2",
        capabilities: { video_generation: true },
      }),
    ).toBe("video");
  });

  it("does not classify chat models as media-only when reasoning/tools present", () => {
    expect(
      isMediaOnlyModel({
        model_id: "gpt-4o",
        capabilities: {
          reasoning: true,
          tools: true,
          image_generation: false,
        },
      }),
    ).toBeNull();
  });
});
