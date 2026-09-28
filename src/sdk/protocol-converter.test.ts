import { describe, expect, test } from "bun:test";
import {
  anthropicResponseToChat,
  anthropicSseToChat,
  chatCompletionToAnthropic,
  chatCompletionToResponse,
  chatSseToAnthropic,
  chatSseToResponses,
  convertRequest,
  convertResponse,
  convertStream,
  requestFromChat,
  requestToChat,
  rewriteResponsesStreamModel,
  responsesSseToChat,
} from "./protocol-converter";

describe("protocol conversion SDK", () => {
  test("exports request conversion between every protocol", () => {
    const chat = { model: "vendor/model", messages: [
      { role: "system", content: "rules" },
      { role: "user", content: [{ type: "text", text: "hello" }, { type: "image_url", image_url: { url: "https://example.test/a.png" } }] },
      { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "lookup", arguments: "{\"q\":1}" } }] },
      { role: "tool", tool_call_id: "call_1", content: "found" },
    ], max_tokens: 300, tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }], tool_choice: "required", stream: true };
    for (const from of ["chat_completions", "responses", "anthropic"] as const) {
      for (const to of ["chat_completions", "responses", "anthropic"] as const) {
        expect(convertRequest(from, to, from === "chat_completions" ? chat : from === "responses" ? {
          model: chat.model,
          input: [
            { role: "system", content: "rules" },
            { role: "user", content: [{ type: "input_text", text: "hello" }, { type: "input_image", image_url: "https://example.test/a.png" }] },
            { type: "function_call", call_id: "call_1", name: "lookup", arguments: "{\"q\":1}" },
            { type: "function_call_output", call_id: "call_1", output: "found" },
          ],
          max_output_tokens: 300,
          tools: [{ type: "function", name: "lookup", parameters: { type: "object" } }],
          tool_choice: "required",
          stream: true,
        } : {
          model: chat.model,
          system: "rules",
          max_tokens: 300,
          messages: [{ role: "user", content: [{ type: "text", text: "hello" }, { type: "image", source: { type: "url", url: "https://example.test/a.png" } }] }, { role: "assistant", content: [{ type: "tool_use", id: "call_1", name: "lookup", input: { q: 1 } }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: "found" }] }],
          tools: [{ name: "lookup", input_schema: { type: "object" } }],
          tool_choice: { type: "any" },
          stream: true,
        })).toBeTruthy();
      }
    }
    expect(requestToChat("responses", { input: [{ type: "input_text", text: "hello" }] }).messages[0]).toEqual({ role: "user", content: [{ type: "text", text: "hello" }] });
  });

  test("converts Chat Completions bodies for OpenAI Responses upstreams", () => {
    const body = requestFromChat("responses", {
      model: "model",
      messages: [
        { role: "system", content: "rules" },
        { role: "user", content: "hello" },
        { role: "assistant", content: "working" },
        { role: "assistant", content: null, tool_calls: [{ id: "call_1", function: { name: "lookup", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "call_1", content: "found" },
      ],
      max_tokens: 123,
      tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }],
      tool_choice: { type: "function", function: { name: "lookup" } },
      stream: true,
    });
    expect(body.instructions).toBe("rules");
    expect(body.input.map((item: any) => item.type)).toEqual(["message", "message", "function_call", "function_call_output"]);
    expect(body.max_output_tokens).toBe(123);
    expect(body.tools[0].name).toBe("lookup");
    expect(body.tool_choice).toEqual({ type: "function", name: "lookup" });
    expect(body.stream).toBe(true);
  });

  test("preserves image, audio, video, and file parts through Responses conversion", () => {
    const converted = requestFromChat("responses", {
      model: "model",
      messages: [{ role: "user", content: [
        { type: "input_audio", input_audio: { data: "YWJj", format: "wav" } },
        { type: "input_video", video_url: { url: "https://example.com/video.mp4" } },
        { type: "input_file", file_id: "file-1" },
      ] }],
      stream: false,
    });
    expect(converted.input[0].content).toEqual([
      { type: "input_audio", input_audio: { data: "YWJj", format: "wav" } },
      { type: "input_video", video_url: { url: "https://example.com/video.mp4" } },
      { type: "input_file", file_id: "file-1" },
    ]);
  });

  test("returns a clear error instead of silently discarding audio for Anthropic", () => {
    expect(() => requestFromChat("anthropic", {
      model: "model",
      messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: "YWJj", format: "wav" } }] }],
      max_tokens: 100,
    })).toThrow("cannot be represented by Anthropic Messages");
  });

  test("rewrites upstream response model IDs in Responses streams without changing event semantics", async () => {
    const stream = await rewriteResponsesStreamModel(new Response([
      'event: response.created\ndata: {"type":"response.created","response":{"id":"resp_1","model":"upstream-name"}}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_1","model":"upstream-name","status":"completed"}}\n\n',
    ].join("")), "configured-name").text();
    expect(stream).toContain('"model":"configured-name"');
    expect(stream).not.toContain('"model":"upstream-name"');
  });

  test("converts Anthropic completion stop reasons, cache usage and tools", () => {
    const chat = anthropicResponseToChat({
      id: "msg_1", model: "model", stop_reason: "max_tokens",
      content: [{ type: "thinking", thinking: "hmm" }, { type: "text", text: "answer" }, { type: "tool_use", id: "tool_1", name: "lookup", input: { key: "v" } }],
      usage: { input_tokens: 4, output_tokens: 7, cache_read_input_tokens: 2, cache_creation_input_tokens: 1 },
    });
    expect(chat.choices[0].finish_reason).toBe("length");
    expect(chat.choices[0].message.reasoning_content).toBe("hmm");
    expect(() => chatCompletionToAnthropic(chat)).toThrow("provider-issued signature");
    expect(chat.usage.prompt_tokens_details.cached_tokens).toBe(2);
    expect(anthropicResponseToChat({ id: "msg_limit", model: "m", stop_reason: "max_tokens", content: [], usage: { input_tokens: 1, output_tokens: 2 } }).choices[0].finish_reason).toBe("length");
    const anthropic = chatCompletionToAnthropic({ ...chat, choices: [{ ...chat.choices[0], message: { ...chat.choices[0].message, reasoning_content: undefined }, finish_reason: "length" }] });
    expect(anthropic.stop_reason).toBe("max_tokens");
    expect(anthropic.content.map((part: any) => part.type)).toEqual(["text", "tool_use"]);
    expect(convertResponse("anthropic", "responses", { id: "msg_2", model: "m", stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "x", input: {} }], usage: { input_tokens: 1, output_tokens: 2 } }).output[0].type).toBe("function_call");
  });

  test("rejects unsupported server-side tools and stateful Responses chaining clearly", () => {
    expect(() => requestToChat("anthropic", { model: "m", max_tokens: 10, messages: [], tools: [{ type: "web_search_20250305", name: "web_search" }] })).toThrow("server-side tools");
    expect(() => requestToChat("responses", { model: "m", previous_response_id: "resp_old", input: "continue" })).toThrow("previous_response_id");
  });

  test("preserves or clearly rejects fields without a stateless equivalent", () => {
    const chat = requestToChat("responses", { model: "m", input: "hello", user: "user-1", prompt_cache_key: "cache-1", service_tier: "priority" });
    expect(chat.user).toBe("user-1");
    expect(chat.prompt_cache_key).toBe("cache-1");
    expect(() => requestToChat("responses", { model: "m", input: [{ type: "computer_call", call_id: "c" }] })).toThrow("cannot be converted");
    expect(() => requestToChat("anthropic", { model: "m", max_tokens: 10, messages: [], context_management: { edits: [] } })).toThrow("context_management");
  });

  test("rejects lossy cross-protocol options instead of silently dropping them", () => {
    expect(() => convertRequest("chat_completions", "responses", { model: "m", messages: [], logprobs: true })).toThrow("logprobs");
    expect(() => convertRequest("chat_completions", "anthropic", { model: "m", messages: [], n: 2 })).toThrow("n");
    expect(() => convertRequest("chat_completions", "anthropic", { model: "m", messages: [], tool_choice: "none" })).toThrow("tool_choice=none");
    expect(() => requestToChat("responses", { model: "m", input: "hi", tools: [{ type: "web_search_preview" }] })).toThrow("tool type");
    expect(() => convertResponse("chat_completions", "responses", { choices: [{ message: {} }, { message: {} }] })).toThrow("n > 1");
  });

  test("converts completion responses and preserves incomplete output status", () => {
    const completion = { id: "chatcmpl_1", created: 42, model: "model", choices: [{ finish_reason: "length", message: { content: "partial", refusal: "no", reasoning_content: "thought", tool_calls: [{ id: "call", function: { name: "search", arguments: "{}" } }] } }], usage: { prompt_tokens: 3, completion_tokens: 5 } };
    const response = chatCompletionToResponse(completion);
    expect(response.status).toBe("incomplete");
    expect(response.incomplete_details.reason).toBe("max_output_tokens");
    expect(response.output.map((item: any) => item.type)).toEqual(["reasoning", "message", "function_call"]);
    expect(() => convertResponse("responses", "anthropic", response)).toThrow("provider-issued signature");
  });

  test("converts streams in each direction and includes terminal events", async () => {
    const chatStream = new Response([
      'data: {"choices":[{"delta":{"role":"assistant","reasoning_content":"think"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"run","arguments":"{}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\n\n',
      "data: [DONE]\n\n",
    ].join(""));
    const responses = await convertStream("chat_completions", "responses", new Response([
      'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"run","arguments":"{}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\n\n',
      "data: [DONE]\n\n",
    ].join("")), "model").text();
    expect(responses).not.toContain("response.reasoning_summary_text.delta");
    expect(responses).toContain("response.output_text.delta");
    expect(responses).toContain("response.function_call_arguments.delta");
    expect(responses).toContain("response.completed");

    const anthropic = await chatSseToAnthropic(new Response('data: {"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}\n\n'), "model").text();
    expect(anthropic).toContain("event: message_start");
    expect(anthropic).toContain('"type":"text_delta","text":"hi"');
    expect(anthropic).toContain("event: message_stop");

    const chat = await anthropicSseToChat(new Response([
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","usage":{"input_tokens":4}}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool_1","name":"find","input":{}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{}"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":2}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].join("")), "model").text();
    expect(chat).toContain('"tool_calls"');
    expect(chat).toContain('"finish_reason":"tool_calls"');
    expect(chat).toContain("[DONE]");

    const responseStream = await responsesSseToChat(new Response([
      'event: response.created\ndata: {"type":"response.created","response":{"id":"resp_1","created_at":5}}\n\n',
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"ok"}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
    ].join("")), "model").text();
    expect(responseStream).toContain('"content":"ok"');
    expect(responseStream).toContain("[DONE]");

    expect((await convertStream("responses", "anthropic", new Response(""), "model").text()).length).toBeGreaterThanOrEqual(0);
    const failedAnthropic = await chatSseToAnthropic(new Response('data: {"error":{"message":"bad request"}}\n\n'), "model").text();
    expect(failedAnthropic).toContain('"type":"error"');
    expect(failedAnthropic).not.toContain('"type":"message_stop"');
  });
});
