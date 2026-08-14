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

  test("normalizes image objects and does not duplicate system instructions", () => {
    const body = responsesToChatBody({
      instructions: "system rule",
      input: [
        { role: "system", content: "system rule" },
        { role: "user", content: [{ type: "input_image", image_url: { url: "data:image/png;base64,abc", detail: "high" } }] },
      ],
      response_format: { type: "json_schema", name: "answer", schema: { type: "object" }, strict: true },
    });
    expect(body.messages.filter((message: any) => message.role === "system")).toHaveLength(1);
    expect(body.messages[1].content[0]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,abc", detail: "high" } });
    expect((body.response_format as any).json_schema.strict).toBe(true);
  });

  test("converts function call output and calculates missing total usage", () => {
    const body = responsesToChatBody({ input: [
      { type: "function_call", id: "fc_1", name: "lookup", arguments: '{"q":"x"}' },
      { type: "function_call_output", call_id: "fc_1", output: { value: 3 } },
    ], tools: [{ type: "function", name: "lookup", description: "find", parameters: {} }], tool_choice: "required", parallel_tool_calls: false });
    expect(body.messages[0].tool_calls[0].function.name).toBe("lookup");
    expect(body.messages[1]).toEqual({ role: "tool", tool_call_id: "fc_1", content: '{"value":3}' });
    expect(body.tools[0].function.description).toBe("find");
    expect(body.tool_choice).toBe("required");
    expect(body.parallel_tool_calls).toBe(false);
    expect((chatCompletionToResponse({ choices: [{ message: {} }], usage: { prompt_tokens: 2, completion_tokens: 5 } }).usage as any).total_tokens).toBe(7);
  });

  test("handles CRLF, fragmented multiline SSE and keeps real output indexes", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"late","function":{"name":"b","arguments":"a"}}]}}]}\r\n\r\n' +
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"first","function":{"name":"a","arguments":"x"}}]}}]}\r\n\r\n'));
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":1,"function":{"arguments":"b"}}]}}]}\r\n\r\n' +
          'data: {"choices":[{"delta":{"content":"line 1"}}]}\r\n\r\n' +
          'data: {"choices":[{"delta":{"content":"\\nline 2"}}]}\r\n\r\n'));
        controller.close();
      },
    });
    const text = await chatSseToResponses(new Response(stream), "model").text();
    expect(text).toContain('"output_index":0');
    expect(text).toContain('"output_index":1');
    expect(text).toContain("line 2");
    expect(text).toContain("response.completed");
  });

  test("emits one error and failed response for upstream error", async () => {
    const text = await chatSseToResponses(new Response('data: {"error":{"message":"upstream down"}}\n\n'), "model").text();
    expect((text.match(/event: error/g) ?? []).length).toBe(1);
    expect(text).toContain("response.failed");
    expect(text).not.toContain("response.completed");
  });
});
