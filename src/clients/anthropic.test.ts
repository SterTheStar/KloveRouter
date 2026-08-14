import { describe, expect, it, mock } from "bun:test";
import {
  AnthropicRequestError,
  anthropicEndpoint,
  createAnthropicMessage,
  createAnthropicStream,
  splitAnthropicMessages,
  toOpenAICompletion,
} from "./anthropic";

const provider = { base_url: "https://api.anthropic.com/v1/", api_key: "secret" } as any;

describe("splitAnthropicMessages", () => {
  it("keeps system and developer instructions in Anthropic system", () => {
    const result = splitAnthropicMessages([
      { role: "developer", content: "Caveman" },
      { role: "system", content: "Custom skill" },
      { role: "user", content: "Hello" },
    ]);

    expect(result.system).toBe("Caveman\nCustom skill");
    expect(result.messages).toEqual([{ role: "user", content: "Hello" }]);
  });
});

it("converts OpenAI image parts to Anthropic image blocks", () => {
  const result = splitAnthropicMessages([
    { role: "user", content: [
      { type: "text", text: "describe" },
      { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } },
    ] },
  ]);

  expect(result.messages[0].content).toEqual([
    { type: "text", text: "describe" },
    { type: "image", source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" } },
  ]);
});

it("round-trips tool calls and tool results, including multimodal result content", () => {
  const result = splitAnthropicMessages([
    { role: "assistant", content: "", tool_calls: [{ id: "call_1", function: { name: "lookup", arguments: '{"q":"x"}' } }] },
    { role: "tool", tool_call_id: "call_1", content: [{ type: "text", text: "found" }, { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } }] },
  ]);
  expect(result.messages).toEqual([
    { role: "assistant", content: [{ type: "text", text: "" }, { type: "tool_use", id: "call_1", name: "lookup", input: { q: "x" } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: [{ type: "text", text: "found" }, { type: "image", source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" } }] }] },
  ]);
  expect(toOpenAICompletion({ id: "m", type: "message", role: "assistant", model: "x", content: [{ type: "tool_use", id: "call_1", name: "lookup", input: { q: "x" } }], stop_reason: "tool_use" }).choices[0].message.tool_calls).toHaveLength(1);
});

it("normalizes endpoints", () => {
  expect(anthropicEndpoint({ ...provider, base_url: "https://example.test" })).toBe("https://example.test/v1/messages");
  expect(anthropicEndpoint({ ...provider, base_url: "https://example.test/v1/" }, "models")).toBe("https://example.test/v1/models");
});

it("preserves status/body and sends headers and signal", async () => {
  const signal = AbortSignal.timeout(1000);
  const fetchMock = mock(() => Promise.resolve(new Response(JSON.stringify({ error: { message: "bad" } }), { status: 429 })));
  const original = globalThis.fetch;
  globalThis.fetch = fetchMock as any;
  try {
    await expect(createAnthropicMessage(provider, {}, undefined, signal)).rejects.toBeInstanceOf(AnthropicRequestError);
    const error = await createAnthropicMessage(provider, {}, undefined, signal).catch((value) => value) as AnthropicRequestError;
    expect(error.status).toBe(429);
    expect(error.body).toEqual({ error: { message: "bad" } });
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const request = calls[0]?.[1];
    expect((request.headers as Record<string, string>).Accept).toBe("application/json");
    expect(request.signal).toBe(signal);
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 200 })));
    await createAnthropicStream(provider, {}, undefined, signal);
    const streamRequest = calls[2]?.[1];
    expect((streamRequest.headers as Record<string, string>).Accept).toBe("text/event-stream");
  } finally {
    globalThis.fetch = original;
  }
});
