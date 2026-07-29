import { describe, expect, test } from "bun:test";
import {
  chatCompletionToResponse,
  chatSseToResponses,
  responsesToChatBody,
} from "./responses-api";

describe("Responses API compatibility", () => {
  test("converts input, images, functions and output limits to chat", () => {
    const body = responsesToChatBody({
      model: "provider/model",
      instructions: "Be brief",
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "describe" },
          { type: "input_image", image_url: "https://example.com/a.png" },
        ],
      }],
      max_output_tokens: 100,
      tools: [{ type: "function", name: "lookup", parameters: { type: "object" } }],
    });
    expect(body.messages).toEqual([
      { role: "system", content: "Be brief" },
      { role: "user", content: [
        { type: "text", text: "describe" },
        { type: "image_url", image_url: { url: "https://example.com/a.png" } },
      ] },
    ]);
    expect(body.max_output_tokens).toBe(100);
    expect(body.tools[0].function.name).toBe("lookup");
  });

  test("converts text, reasoning, tools and usage to a response object", () => {
    const response = chatCompletionToResponse({
      id: "chatcmpl-test",
      created: 123,
      model: "model",
      choices: [{ message: {
        content: "answer",
        reasoning_content: "thought",
        tool_calls: [{ id: "call_1", function: { name: "lookup", arguments: "{}" } }],
      } }],
      usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
    });
    expect(response.id).toBe("resp_test");
    expect(response.output.map((item: any) => item.type)).toEqual([
      "reasoning", "message", "function_call",
    ]);
    expect(response.usage?.total_tokens).toBe(6);
  });

  test("translates chat SSE deltas and completion into Responses events", async () => {
    const upstream = new Response(
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n' +
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"lookup","arguments":"{}"}}]}}],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}\n\n' +
      'data: [DONE]\n\n',
      { headers: { "Content-Type": "text/event-stream" } },
    );
    const text = await chatSseToResponses(upstream, "provider/model").text();
    expect(text).toContain("response.output_text.delta");
    expect(text).toContain("response.function_call_arguments.done");
    expect(text).toContain("response.completed");
    expect(text).toContain('"total_tokens":3');
  });
});
