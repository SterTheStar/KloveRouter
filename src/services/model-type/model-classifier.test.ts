import { describe, expect, test } from "bun:test";
import {
  classifyModel,
  isChatModel,
  isImageModel,
  isTtsModel,
  isSttModel,
  isVideoModel,
  isEmbeddingModel,
  isMediaModel,
} from "./model-classifier";

describe("Model Classifier", () => {
  test("classifies standard chat LLMs", () => {
    const gpt4o = classifyModel({ modelId: "gpt-4o" });
    expect(gpt4o.modelType).toBe("chat");
    expect(gpt4o.inputModalities).toContain("text");
    expect(gpt4o.outputModalities).toContain("text");
    expect(isChatModel({ model_id: "gpt-4o" })).toBe(true);
    expect(isMediaModel({ model_id: "gpt-4o" })).toBe(false);

    const claude = classifyModel({ modelId: "claude-3-7-sonnet-20250219" });
    expect(claude.modelType).toBe("chat");

    const deepseek = classifyModel({ modelId: "deepseek-r1" });
    expect(deepseek.modelType).toBe("chat");
  });

  test("classifies multimodal chat LLMs with vision or audio input", () => {
    const visionModel = classifyModel({
      modelId: "gemini-2.5-flash",
      inputModalities: ["text", "image", "audio"],
    });
    expect(visionModel.modelType).toBe("chat");
    expect(visionModel.inputModalities).toContain("image");
    expect(visionModel.inputModalities).toContain("audio");
    expect(visionModel.inferredCapabilities.vision).toBe(true);
    expect(visionModel.inferredCapabilities.audio_input).toBe(true);
  });

  test("classifies image generation models", () => {
    const dalle = classifyModel({ modelId: "dall-e-3" });
    expect(dalle.modelType).toBe("image");
    expect(dalle.outputModalities).toContain("image");
    expect(dalle.inferredCapabilities.image_generation).toBe(true);
    expect(isImageModel({ model_id: "dall-e-3" })).toBe(true);
    expect(isMediaModel({ model_id: "dall-e-3" })).toBe(true);
    expect(isChatModel({ model_id: "dall-e-3" })).toBe(false);

    const flux = classifyModel({ modelId: "black-forest-labs/flux-1.1-pro" });
    expect(flux.modelType).toBe("image");

    const imagen = classifyModel({ modelId: "imagen-3.0-generate-002" });
    expect(imagen.modelType).toBe("image");

    const sd = classifyModel({ modelId: "stabilityai/stable-diffusion-3.5-large" });
    expect(sd.modelType).toBe("image");
  });

  test("classifies text-to-speech (TTS) models", () => {
    const tts1 = classifyModel({ modelId: "tts-1-hd" });
    expect(tts1.modelType).toBe("tts");
    expect(tts1.outputModalities).toContain("audio");
    expect(tts1.inferredCapabilities.text_to_speech).toBe(true);
    expect(isTtsModel({ model_id: "tts-1-hd" })).toBe(true);
    expect(isMediaModel({ model_id: "tts-1-hd" })).toBe(true);

    const elevenlabs = classifyModel({ modelId: "eleven_turbo_v2_5" });
    expect(elevenlabs.modelType).toBe("tts");

    const kokoro = classifyModel({ modelId: "hexgrad/Kokoro-82M" });
    expect(kokoro.modelType).toBe("tts");
  });

  test("classifies speech-to-text (STT) models", () => {
    const whisper = classifyModel({ modelId: "whisper-1" });
    expect(whisper.modelType).toBe("stt");
    expect(whisper.inputModalities).toContain("audio");
    expect(whisper.outputModalities).toContain("text");
    expect(isSttModel({ model_id: "whisper-1" })).toBe(true);
  });

  test("classifies video generation models", () => {
    const sora = classifyModel({ modelId: "sora-1.0-turbo" });
    expect(sora.modelType).toBe("video");
    expect(sora.outputModalities).toContain("video");
    expect(sora.inferredCapabilities.video_generation).toBe(true);
    expect(isVideoModel({ model_id: "sora-1.0-turbo" })).toBe(true);
    expect(isMediaModel({ model_id: "sora-1.0-turbo" })).toBe(true);

    const runway = classifyModel({ modelId: "runway/gen-3-alpha" });
    expect(runway.modelType).toBe("video");

    const kling = classifyModel({ modelId: "kling-v1.5-pro" });
    expect(kling.modelType).toBe("video");
  });

  test("classifies text embedding models", () => {
    const embedding = classifyModel({ modelId: "text-embedding-3-small" });
    expect(embedding.modelType).toBe("embedding");
    expect(embedding.outputModalities).toContain("embedding");
    expect(isEmbeddingModel({ model_id: "text-embedding-3-small" })).toBe(true);
    expect(isChatModel({ model_id: "text-embedding-3-small" })).toBe(false);

    const bge = classifyModel({ modelId: "BAAI/bge-m3" });
    expect(bge.modelType).toBe("embedding");

    const voyage = classifyModel({ modelId: "voyage-large-2" });
    expect(voyage.modelType).toBe("embedding");
  });

  test("respects explicit declaredType override", () => {
    const overridden = classifyModel({
      modelId: "custom-generic-model",
      declaredType: "image",
    });
    expect(overridden.modelType).toBe("image");
  });

  test("respects explicit mode from LiteLLM", () => {
    const modeTts = classifyModel({
      modelId: "custom-audio-engine",
      mode: "audio_speech",
    });
    expect(modeTts.modelType).toBe("tts");
  });
});
