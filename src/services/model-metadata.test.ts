import { describe, expect, test } from "bun:test";
import {
  mergeMetadata,
  parseRawModelMetadata,
  resolveModelMetadata,
} from "./model-metadata";

describe("model metadata resolver", () => {
  test("normal API metadata applies only values returned by the API", async () => {
    const metadata = await resolveModelMetadata(
      "openai",
      "gpt-5-test",
      {
        context_window: 111_111,
        max_output_tokens: 22_222,
        capabilities: { tools: false, vision: false },
        supported_reasoning_efforts: [
          { reasoning_effort: "minimal" },
          { reasoning_effort: "high" },
        ],
        default_reasoning_effort: "minimal",
      },
    );

    expect(metadata.context_window).toBe(111_111);
    expect(metadata.max_output_tokens).toBe(22_222);
    expect(metadata.capabilities?.tools).toBe(false);
    expect(metadata.capabilities?.vision).toBe(false);
    expect(metadata.capabilities?.reasoning).toBe(true);
    expect(metadata.capabilities?.streaming).toBeUndefined();
    expect(metadata.reasoning_efforts).toEqual([
      expect.objectContaining({ effort: "minimal", is_default: true }),
      expect.objectContaining({ effort: "high", is_default: false }),
    ]);
  });

  test("does not supplement fields absent from a normal API response", async () => {
    const metadata = await resolveModelMetadata(
      "openai",
      "sparse-model",
      { id: "sparse-model", object: "model" },
    );
    expect(metadata.context_window).toBeUndefined();
    expect(metadata.max_output_tokens).toBeUndefined();
    expect(metadata.capabilities).toEqual({
      reasoning: undefined,
      tools: undefined,
      vision: undefined,
      attachments: undefined,
      streaming: undefined,
      non_streaming: undefined,
    });
    expect(metadata.reasoning_efforts).toBeUndefined();
  });

  test("raw null limits allow catalog discovery and capability false remains authoritative", () => {
    expect(mergeMetadata(
      { context_window: null, capabilities: { tools: false } },
      { context_window: 32_768, capabilities: { tools: true, vision: true } },
    )).toEqual(expect.objectContaining({
      context_window: 32_768,
      capabilities: expect.objectContaining({ tools: false, vision: true }),
    }));
  });

  test("parses common upstream limit, modality, and effort fields", () => {
    const parsed = parseRawModelMetadata({
      input_token_limit: "1048576",
      output_token_limit: 65_536,
      modalities: { input: ["text", "image", "file"] },
      tool_call: true,
      capabilities: { reasoning: true },
      reasoning: { efforts: ["low", "medium", "high"], default_effort: "high" },
    });
    expect(parsed.context_window).toBe(1_048_576);
    expect(parsed.max_output_tokens).toBe(65_536);
    expect(parsed.capabilities).toEqual(expect.objectContaining({
      tools: true,
      vision: true,
      attachments: true,
    }));
    expect(parsed.reasoning_efforts?.find((effort) => effort.is_default)?.effort).toBe("high");
  });

  test("prefers the model maximum context window when provider returns both limits", () => {
    const parsed = parseRawModelMetadata({
      context_window: 272_000,
      max_context_window: 1_000_000,
    });

    expect(parsed.context_window).toBe(1_000_000);
  });

  test("parses Antigravity model limits and explicit capabilities", async () => {
    const raw = {
      maxTokens: 1_048_576,
      maxOutputTokens: 65_536,
      supportsImages: true,
      supportsThinking: true,
      supportsVideo: true,
      supportedMimeTypes: ["image/png", "application/pdf"],
      supported_reasoning_levels: ["low", "high"],
      default_reasoning_level: "high",
    };

    const parsed = await resolveModelMetadata("antigravity", "gemini-test", raw);

    expect(parsed).toEqual(expect.objectContaining({
      context_window: 1_048_576,
      max_output_tokens: 65_536,
    }));
    expect(parsed.capabilities).toEqual(expect.objectContaining({
      reasoning: true,
      vision: true,
      attachments: true,
    }));
    expect(parsed.reasoning_efforts).toEqual([
      expect.objectContaining({ effort: "low", is_default: false }),
      expect.objectContaining({ effort: "high", is_default: true }),
    ]);

    const normalApiParsed = parseRawModelMetadata(raw);
    expect(normalApiParsed.capabilities).toEqual(expect.objectContaining({
      reasoning: true,
      vision: true,
      attachments: true,
    }));
    expect(normalApiParsed.reasoning_efforts).toEqual([
      expect.objectContaining({ effort: "low", is_default: false }),
      expect.objectContaining({ effort: "high", is_default: true }),
    ]);
  });

  test("parses OpenRouter-style architecture, top provider, and supported efforts", () => {
    const parsed = parseRawModelMetadata({
      context_length: 1_000_000,
      architecture: {
        modality: "text+image->text",
        input_modalities: ["text", "image", "file"],
      },
      top_provider: { max_completion_tokens: 32_000 },
      supported_parameters: ["reasoning", "tools"],
      reasoning: {
        supported_efforts: ["low", "medium", "high"],
        default_effort: "high",
      },
    });
    expect(parsed.context_window).toBe(1_000_000);
    expect(parsed.max_output_tokens).toBe(32_000);
    expect(parsed.capabilities).toEqual(expect.objectContaining({
      reasoning: true,
      tools: true,
      vision: true,
      attachments: true,
    }));
    expect(parsed.reasoning_efforts?.find((effort) => effort.is_default)?.effort)
      .toBe("high");
  });

  test("keeps metadata nested in special provider model records", () => {
    const parsed = parseRawModelMetadata({
      model: {
        name: "gemini-special",
        input_token_limit: 1_000_000,
        output_token_limit: 8_192,
      },
    });
    expect(parsed.context_window).toBe(1_000_000);
    expect(parsed.max_output_tokens).toBe(8_192);
  });

  test("dedicated integrations only auto-apply reliable numeric limits", async () => {
    const metadata = await resolveModelMetadata("atomesus", "atomesus-2", {});
    expect(metadata.context_window).toBeUndefined();
    expect(metadata.max_output_tokens).toBeUndefined();
    expect(metadata.capabilities).toBeUndefined();
    expect(metadata.reasoning_efforts).toBeUndefined();
  });

  test("dedicated integrations do not auto-apply capability booleans or efforts", async () => {
    const metadata = await resolveModelMetadata(
      "qwen",
      "qwen-test-reasoning-disabled",
      {
        context_window: 32_768,
        max_output_tokens: 8_192,
        capabilities: { reasoning: false, tools: true },
        reasoning_efforts: ["low", "high"],
      },
    );
    expect(metadata.context_window).toBe(32_768);
    expect(metadata.max_output_tokens).toBe(8_192);
    expect(metadata.capabilities).toBeUndefined();
    expect(metadata.reasoning_efforts).toBeUndefined();
  });

  test("normal API providers still auto-apply returned capabilities", async () => {
    const metadata = await resolveModelMetadata(
      "openai",
      "api-model",
      {
        context_window: 100_000,
        capabilities: { reasoning: false, tools: true },
        supports_streaming: true,
      },
    );
    expect(metadata.context_window).toBe(100_000);
    expect(metadata.capabilities).toEqual(
      expect.objectContaining({ reasoning: false, tools: true, streaming: true }),
    );
  });
});
