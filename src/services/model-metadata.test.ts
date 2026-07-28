import { describe, expect, test } from "bun:test";
import {
  mergeMetadata,
  parseRawModelMetadata,
  resolveModelMetadata,
} from "./model-metadata";

describe("model metadata resolver", () => {
  test("raw provider metadata wins over catalog and family defaults", async () => {
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
      {
        openai: {
          models: {
            "gpt-5-test": {
              id: "gpt-5-test",
              reasoning: true,
              tool_call: true,
              limit: { context: 200_000, output: 100_000 },
            },
          },
        },
      },
    );

    expect(metadata.context_window).toBe(111_111);
    expect(metadata.max_output_tokens).toBe(22_222);
    expect(metadata.capabilities?.tools).toBe(false);
    expect(metadata.capabilities?.vision).toBe(false);
    expect(metadata.capabilities?.reasoning).toBe(true);
    expect(metadata.capabilities?.streaming).toBe(true);
    expect(metadata.reasoning_efforts).toEqual([
      expect.objectContaining({ effort: "minimal", is_default: true }),
      expect.objectContaining({ effort: "high", is_default: false }),
    ]);
  });

  test("catalog supplies exact limits without protocol limit guesses", async () => {
    const catalog = {
      anthropic: {
        models: {
          "claude-sonnet-known": {
            id: "claude-sonnet-known",
            reasoning: true,
            tool_call: true,
            attachment: true,
            modalities: { input: ["text", "image"] },
            limit: { context: 200_000, output: 64_000 },
          },
        },
      },
    };
    const known = await resolveModelMetadata("anthropic", "claude-sonnet-known", {}, catalog);
    const unknown = await resolveModelMetadata("anthropic", "claude-unlisted", {}, catalog);

    expect(known.context_window).toBe(200_000);
    expect(known.max_output_tokens).toBe(64_000);
    expect(known.capabilities).toEqual(expect.objectContaining({
      reasoning: true,
      tools: true,
      vision: true,
      attachments: true,
      streaming: true,
      non_streaming: true,
    }));
    expect(known.reasoning_efforts?.find((effort) => effort.is_default)?.effort).toBe("medium");
    expect(unknown.context_window).toBeUndefined();
    expect(unknown.max_output_tokens).toBeUndefined();
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

  test("AtomeSus defaults include supported efforts and no fabricated limits", async () => {
    const metadata = await resolveModelMetadata("atomesus", "atomesus-2", {}, null);
    expect(metadata.context_window).toBeUndefined();
    expect(metadata.max_output_tokens).toBeUndefined();
    expect(metadata.capabilities).toEqual(expect.objectContaining({
      reasoning: true,
      tools: false,
      attachments: true,
    }));
    expect(metadata.reasoning_efforts?.find((effort) => effort.is_default)?.effort).toBe("medium");
  });

  test("does not advertise effort levels when an authoritative source disables reasoning", async () => {
    const metadata = await resolveModelMetadata(
      "qwen",
      "qwen-test-reasoning-disabled",
      { capabilities: { reasoning: false } },
      null,
    );
    expect(metadata.capabilities?.reasoning).toBe(false);
    expect(metadata.reasoning_efforts).toBeUndefined();
  });
});
