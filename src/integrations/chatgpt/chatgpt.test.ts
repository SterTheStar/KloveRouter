import { describe, expect, test } from "bun:test";
import { chatgptAuthHeaders, chatgptSessionToken, normalizeChatGptAuth } from "./auth";
import { ConversationIdCache, conversationFingerprint, conversationIdCache } from "./cache";
import { chatgptModels } from "./models";
import { chatgptResponses, chatgptStreamToOpenAI, chatgptTest } from "./client";

const encoder = new TextEncoder();
const upstream = (text: string) => new Response(new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(text)); controller.close(); } }));

describe("ChatGPT auth and fingerprint", () => {
  test("accepts only direct or Bearer tokens", () => {
    expect(normalizeChatGptAuth("raw")).toEqual({ token: "raw" });
    expect(normalizeChatGptAuth("Bearer raw")).toEqual({ token: "raw" });
    expect(normalizeChatGptAuth({ secret: "tok", account_id: "acct" })).toEqual({ token: "tok", accountId: "acct" });
    expect(normalizeChatGptAuth('{"access_token":"tok"}')).toEqual({});
    expect(normalizeChatGptAuth("Cookie: session=tok")).toEqual({});
    expect(normalizeChatGptAuth("# Netscape HTTP Cookie File\nchatgpt.com\tTRUE\t/\tFALSE\t0\tsession\ttok")).toEqual({});
    expect(chatgptSessionToken("Bearer raw")).toBe("raw");
    expect(chatgptAuthHeaders({ secret: "raw", accountId: "acct" })).toEqual({ Accept: "application/json", Authorization: "Bearer raw", "ChatGPT-Account-Id": "acct" });
  });
  test("is deterministic and cache is bounded with TTL", async () => {
    const body = { messages: [{ role: "user", content: "hello" }] };
    expect(await conversationFingerprint(body, "m", "a")).toBe(await conversationFingerprint({ messages: body.messages }, "m", "a"));
    const cache = new ConversationIdCache({ maxEntries: 1, ttlMs: 10 });
    cache.set("a", "1", 0); cache.set("b", "2", 0);
    expect(cache.size).toBe(1); expect(cache.get("a", 1)).toBeUndefined(); expect(cache.get("b", 11)).toBeUndefined();
  });
});

describe("ChatGPT transformations", () => {
  test("converts SSE deltas and completion", async () => {
    const response = chatgptStreamToOpenAI(upstream('data: {"message":{"content":{"parts":["hi"]}}}\n\ndata: {"is_complete":true}\n\n'), "gpt-test");
    const output = await response.text();
    expect(output).toContain('"content":"hi"'); expect(output).toContain('"finish_reason":"stop"'); expect(output).toContain("data: [DONE]");
  });
  test("caches conversation ids from streaming responses", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => upstream('data: {"conversation_id":"stream-c","message":{"content":{"parts":["hello"]}}}\n\ndata: {"is_complete":true}\n\n')) as unknown as typeof fetch;
    const body = { messages: [{ role: "user", content: "stream" }], stream: true };
    try {
      const response = await chatgptResponses(body, "stream-model", { secret: "t" });
      const fingerprint = await conversationFingerprint(body, "stream-model");
      const transformed = chatgptStreamToOpenAI(
        response,
        "stream-model",
        (conversationId) => conversationIdCache.set(fingerprint, conversationId),
      );
      const output = await transformed.text();
      expect(output).toContain('"content":"hello"');
      expect(conversationIdCache.get(fingerprint)).toBe("stream-c");
    } finally { globalThis.fetch = originalFetch; }
  });
  test("handles SSE returned for a non-stream request and caches its conversation", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => upstream('data: {"conversation_id":"sse-c","message":{"content":{"parts":["hello"]}}}\n\ndata: [DONE]\n\n')) as unknown as typeof fetch;
    try {
      const result = await chatgptResponses({ messages: [{ role: "user", content: "hi" }] }, "sse-model", { secret: "t" });
      expect(await result.json()).toMatchObject({ choices: [{ message: { content: "hello" } }] });
    } finally { globalThis.fetch = originalFetch; }
  });
  test("uses only allowed authenticated headers", async () => {
    const originalFetch = globalThis.fetch;
    const seen: Headers[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(init?.headers));
      if (String(input).endsWith("/models")) return Response.json([{ id: "m" }]);
      if (new Headers(init?.headers).get("Accept") === "text/event-stream") return upstream('data: {"message":{"content":{"parts":["ok"]}}}\n\ndata: [DONE]\n\n');
      return Response.json({ conversation_id: "c", message: { content: { parts: ["ok"] } } });
    }) as unknown as typeof fetch;
    try {
      await chatgptResponses({ messages: [{ role: "user", content: "hi" }] }, "m", { secret: "t", account_id: "acct" });
      await chatgptModels({ secret: "t", account_id: "acct" });
      await chatgptTest("m", { secret: "t", account_id: "acct" });
      const allowed = new Set(["authorization", "content-type", "accept", "chatgpt-account-id"]);
      for (const headers of seen) {
        expect([...headers.keys()].every((key) => allowed.has(key))).toBe(true);
        expect(headers.get("authorization")).toBe("Bearer t");
        expect(headers.get("chatgpt-account-id")).toBe("acct");
      }
    } finally { globalThis.fetch = originalFetch; }
  });
});
