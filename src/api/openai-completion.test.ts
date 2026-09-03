import { describe, expect, test } from "bun:test";
import { openAICompletionFromSse } from "./openai-completion";

function response(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  );
}

describe("openAICompletionFromSse", () => {
  test("aggregates fragmented CRLF text, reasoning, tools, finish and usage", async () => {
    const events = [
      { id: "chatcmpl-1", created: 10, model: "test", choices: [{ index: 0, delta: { reasoning_content: "think " }, finish_reason: null }] },
      { choices: [{ index: 0, delta: { content: "hello" }, finish_reason: null }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "lookup", arguments: "{\"q\":" } }] }, finish_reason: null }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: "\"x\"}" } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 } },
    ];
    const raw = `${events.map((event) => `data: ${JSON.stringify(event)}`).join("\r\n\r\n")}\r\n\r\ndata: [DONE]\r\n\r\n`;
    const chunks = [raw.slice(0, 17), raw.slice(17, 63), raw.slice(63, 121), raw.slice(121)];

    const { completion } = await openAICompletionFromSse(response(chunks), "fallback");

    expect(completion).toMatchObject({
      id: "chatcmpl-1",
      object: "chat.completion",
      model: "test",
      choices: [{
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: "hello",
          reasoning_content: "think ",
          tool_calls: [{ id: "call_1", function: { name: "lookup", arguments: "{\"q\":\"x\"}" } }],
        },
      }],
      usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
    });
  });

  test("preserves cache details when a later usage chunk omits them", async () => {
    const first = {
      choices: [{ index: 0, delta: { content: "ok" }, finish_reason: null }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 1,
        prompt_tokens_details: { cached_tokens: 8 },
      },
    };
    const final = {
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 },
    };

    const { completion } = await openAICompletionFromSse(
      response([`data: ${JSON.stringify(first)}\n\ndata: ${JSON.stringify(final)}\n\n`]),
      "test",
    );

    expect(completion.usage.prompt_tokens_details.cached_tokens).toBe(8);
    expect(completion.usage.total_tokens).toBe(11);
  });

  test("does not duplicate a repeated complete tool name", async () => {
    const chunks = [
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: "EnterPlanMode" } }] } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: "EnterPlanMode", arguments: "{}" } }] } }] },
    ];
    const { completion } = await openAICompletionFromSse(
      response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)),
      "test",
    );
    expect(completion.choices[0].message.tool_calls[0].function.name).toBe("EnterPlanMode");
  });

  test("returns null content for a tool-only completion", async () => {
    const chunk = { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call", type: "function", function: { name: "run", arguments: "{}" } }] }, finish_reason: "tool_calls" }] };
    const { completion } = await openAICompletionFromSse(response([`data: ${JSON.stringify(chunk)}\n\n`]), "test");
    expect(completion.choices[0].message.content).toBeNull();
  });

  test("rejects an SSE error instead of returning a partial completion", async () => {
    await expect(
      openAICompletionFromSse(
        response(['data: {"choices":[{"delta":{"content":"partial"}}]}\n\ndata: {"error":{"message":"quota exhausted"}}\n\n']),
        "test",
      ),
    ).rejects.toThrow("quota exhausted");
  });

  test("rejects malformed JSON events", async () => {
    await expect(
      openAICompletionFromSse(response(["data: {broken}\n\n"]), "test"),
    ).rejects.toThrow("invalid OpenAI SSE JSON");
  });
});
