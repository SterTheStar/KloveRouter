import { describe, expect, test } from "bun:test";
import { chatgptAuthHeaders, chatgptRequestHeaders, chatgptSessionToken, normalizeChatGptAuth } from "./auth";
import { ConversationIdCache, conversationFingerprint, conversationIdCache } from "./cache";
import { chatgptModels } from "./models";
import { chatgptResponses, chatgptStreamToOpenAI, chatgptTest } from "./client";
import { chatGptRequestBody } from "./transform";
import { parseChatGptCookies } from "./cookies";
import { browserLikeHeaders, randomSessionId, stableDeviceId, FIREFOX_USER_AGENT } from "./browser-headers";

const encoder = new TextEncoder();
const upstream = (text: string) => new Response(new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(text)); controller.close(); } }));

describe("ChatGPT cookies", () => {
  test("parses allowed Netscape cookies and orders next-auth chunks numerically", () => {
    const input = "# Netscape HTTP Cookie File\n#HttpOnly_.chatgpt.com\tTRUE\t/\tTRUE\t0\t__Secure-next-auth.session-token.10\tten\nchatgpt.com\tTRUE\t/\tTRUE\t0\t__Secure-next-auth.session-token.2\ttwo\nopenai.com\tTRUE\t/\tFALSE\t0\tother\tok";
    expect(parseChatGptCookies(input)).toBe("__Secure-next-auth.session-token.2=two; __Secure-next-auth.session-token.10=ten; other=ok");
  });
  test("rejects third-party domains", () => {
    expect(() => parseChatGptCookies("evil.com\\tTRUE\\t/\\tFALSE\\t0\\tsession\\tx")).toThrow();
  });
});

describe("ChatGPT browser-like headers", () => {
  test("device ID is stable per credential seed", async () => {
    expect(await stableDeviceId("same")).toBe(await stableDeviceId("same"));
    expect(await stableDeviceId("seed")).not.toBe(await stableDeviceId("other"));
  });
  test("session IDs are unique per call", () => {
    expect(randomSessionId()).not.toBe(randomSessionId());
  });
  test("browser-like headers include Firefox UA and Sec-Fetch", () => {
    const headers = browserLikeHeaders({ deviceId: "d", sessionId: "s" });
    expect(headers["User-Agent"]).toBe(FIREFOX_USER_AGENT);
    expect(headers["Sec-Fetch-Dest"]).toBe("empty");
    expect(headers["Sec-Fetch-Mode"]).toBe("cors");
    expect(headers["Sec-Fetch-Site"]).toBe("same-origin");
    expect(headers["Accept-Encoding"]).toBe("gzip, deflate, br");
    expect(headers["Origin"]).toBe("https://chatgpt.com");
    expect(headers["oai-device-id"]).toBe("d");
    expect(headers["oai-session-id"]).toBe("s");
    expect(headers["oai-language"]).toBe("en-US");
  });
  test("chatgptRequestHeaders merges auth and browser headers", async () => {
    const h = await chatgptRequestHeaders({ secret: "tok", account_id: "acct" });
    expect(h["Authorization"]).toBe("Bearer tok");
    expect(h["ChatGPT-Account-Id"]).toBe("acct");
    expect(h["User-Agent"]).toBe(FIREFOX_USER_AGENT);
    expect(h["oai-device-id"]).toMatch(/^[a-f0-9]{32}$/);
    expect(h["oai-session-id"]).toMatch(/^[a-f0-9-]+$/);
  });
});

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
  test("preserves OpenAI image URLs and data URLs as image parts", () => {
    const body = chatGptRequestBody({ messages: [{ role: "user", content: [
      { type: "input_text", text: "describe" },
      { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=", detail: "high" } },
      { type: "image_url", image_url: { url: "https://example.com/image.png" } },
    ] }] }, "vision-model");
    expect(body.messages[0].content).toEqual({ content_type: "multimodal_text", parts: [
      "describe",
      { content_type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=", detail: "high" } },
      { content_type: "image_url", image_url: { url: "https://example.com/image.png" } },
    ] });
  });
  test("converts fragmented cumulative and OpenAI SSE deltas", async () => {
    const response = chatgptStreamToOpenAI(upstream('data: {"message":{"content":{"parts":["h"]}}}\n\ndata: {"message":{"content":{"parts":["hello"]}}}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\ndata: {"is_complete":true}\n\n'), "gpt-test");
    const output = await response.text();
    expect(output).toContain('"content":"h"'); expect(output).toContain('"content":"ello"'); expect(output).toContain('"content":" world"');
    expect(output).toContain('"finish_reason":"stop"'); expect(output).toContain("data: [DONE]");
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
  test("uses cookie authentication and the configured base URL", async () => {
    const originalFetch = globalThis.fetch;
    const seen: { url: string; headers: Headers }[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), headers: new Headers(init?.headers) });
      if (new Headers(init?.headers).get("Accept") === "text/event-stream")
        return upstream('data: {"message":{"content":{"parts":["ok"]}}}\n\ndata: [DONE]\n\n');
      return Response.json({ id: "cookie-model" });
    }) as unknown as typeof fetch;
    try {
      await chatgptTest("cookie-model", { cookieHeader: "session=secret" }, "https://example.test/backend-api");
      expect(seen[0]?.url).toBe("https://example.test/backend-api/conversation");
      expect(seen[0]?.headers.get("cookie")).toBe("session=secret");
      expect(seen[0]?.headers.get("authorization")).toBeNull();
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
      const allowed = new Set([
        "authorization",
        "content-type",
        "accept",
        "chatgpt-account-id",
        "user-agent",
        "accept-language",
        "accept-encoding",
        "cache-control",
        "pragma",
        "origin",
        "referer",
        "sec-fetch-dest",
        "sec-fetch-mode",
        "sec-fetch-site",
        "oai-language",
        "oai-device-id",
        "oai-client-version",
        "oai-client-build-number",
        "oai-session-id",
      ]);
      for (const headers of seen) {
        expect([...headers.keys()].every((key) => allowed.has(key))).toBe(true);
        expect(headers.get("authorization")).toBe("Bearer t");
        expect(headers.get("chatgpt-account-id")).toBe("acct");
        expect(headers.get("user-agent")).toBe(FIREFOX_USER_AGENT);
        expect(headers.get("sec-fetch-site")).toBe("same-origin");
        expect(headers.get("accept-encoding")).toBe("gzip, deflate, br");
        expect(headers.get("oai-device-id")).toMatch(/^[a-f0-9]{32}$/);
      }
    } finally { globalThis.fetch = originalFetch; }
  });
});
