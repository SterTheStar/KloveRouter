import { describe, expect, test } from "bun:test";
import { isOpenCodeProvider } from "./provider-appearance";
import { OPENCODE_SESSION_RE, OPENCODE_USER_AGENT, coerceOpencodeSessionId, mintOpencodeSessionId, upstreamProviderHeaders } from "./provider-headers";
import { validateCustomHeaders } from "./provider.service";
import { createOpenAIClient } from "../clients/openai";
import { createAnthropicMessage } from "../clients/anthropic";
import { mock } from "bun:test";

describe("provider custom headers", () => {
  test("validates header maps and forbids protocol and transport overrides", () => {
    expect(validateCustomHeaders({ "X-Team": "research" })).toEqual({ "X-Team": "research" });
    expect(() => validateCustomHeaders({ Authorization: "Bearer override" })).toThrow("managed by Klove");
    expect(() => validateCustomHeaders({ "Bad Header": "x" })).toThrow("Invalid custom header name");
    expect(() => validateCustomHeaders({ "X-Test": "a\r\nb" })).toThrow("single-line");
  });

  test("merges custom headers with protocol headers and generates a session ID for OpenCode", () => {
    const headers = upstreamProviderHeaders(
      { name: "OpenCode Zen", base_url: "https://opencode.ai/zen/v1", custom_headers: { "X-Team": "core", Accept: "custom" } },
      { Authorization: "Bearer token", Accept: "application/json" },
      "session-123",
    );
    expect(headers.Authorization).toBe("Bearer token");
    expect(headers.Accept).toBe("application/json");
    expect(headers["X-Team"]).toBe("core");
    expect(headers["x-opencode-session"]).toBeTruthy();
  });

  test("explicit incoming session ID overrides a generated OpenCode session ID", () => {
    const valid = "ses_abcdef123456AbCdEfGhIjKlMn";
    const headers = upstreamProviderHeaders({ name: "OpenCode Zen" }, {}, undefined, valid);
    expect(headers["x-opencode-session"]).toBe(valid);
    expect(headers["X-Session-ID"]).toBe(valid);
  });

  test("coerces non-conforming session IDs into the ses_ shape deterministically", () => {
    expect(mintOpencodeSessionId()).toMatch(OPENCODE_SESSION_RE);
    const coerced = coerceOpencodeSessionId("incoming-session");
    expect(coerced).toMatch(OPENCODE_SESSION_RE);
    expect(coerceOpencodeSessionId("incoming-session")).toBe(coerced);
    expect(coerceOpencodeSessionId("ses_abcdef123456AbCdEfGhIjKlMn")).toBe("ses_abcdef123456AbCdEfGhIjKlMn");
    const headers = upstreamProviderHeaders({ name: "OpenCode Zen" }, {}, undefined, "incoming-session");
    expect(headers["x-opencode-session"]).toMatch(OPENCODE_SESSION_RE);
  });

  test("sends X-Session-ID with the same value as x-opencode-session for OpenCode only", () => {
    const open = upstreamProviderHeaders({ name: "OpenCode Zen" }, {}, "session-123");
    expect(open["X-Session-ID"]).toBe(open["x-opencode-session"]);
    const plain = upstreamProviderHeaders({ name: "Other", base_url: "https://example.com/v1" }, {});
    expect(plain["x-opencode-session"]).toBeUndefined();
    expect(plain["X-Session-ID"]).toBeUndefined();
  });

  test("rejects manual X-Session-ID overrides like x-opencode-session", () => {
    expect(() => validateCustomHeaders({ "X-Session-ID": "manual" })).toThrow("managed by Klove");
  });

  test("generates a ses_-shaped OpenCode session ID by default", () => {
    const headers = upstreamProviderHeaders({ name: "OpenCode Zen Go" });
    expect(headers["x-opencode-session"]).toMatch(OPENCODE_SESSION_RE);
    expect(headers["X-Session-ID"]).toBe(headers["x-opencode-session"]);
  });

  test("sends the OpenCode User-Agent for OpenCode providers unless customized", () => {
    const headers = upstreamProviderHeaders({ name: "OpenCode Zen" }, {});
    expect(headers["User-Agent"]).toBe(OPENCODE_USER_AGENT);
    const custom = upstreamProviderHeaders(
      { name: "OpenCode Zen", custom_headers: { "User-Agent": "my-client/1.0" } },
      {},
    );
    expect(custom["User-Agent"]).toBe("my-client/1.0");
    const plain = upstreamProviderHeaders({ name: "Other", base_url: "https://example.com/v1" }, {});
    expect(plain["User-Agent"]).toBeUndefined();
  });

  test("reuses a session ID for repeated requests in the same provider conversation", () => {
    const one = upstreamProviderHeaders({ name: "OpenCode Zen" }, {}, "stable-provider-conversation");
    const two = upstreamProviderHeaders({ name: "OpenCode Zen" }, {}, "stable-provider-conversation");
    expect(one["x-opencode-session"]).toBe(two["x-opencode-session"]);
  });

  test("recognizes Zen and Zen Go presets", () => {
    expect(isOpenCodeProvider("opencode")).toBe(true);
    expect(isOpenCodeProvider("opencode-zen-go")).toBe(true);
    expect(isOpenCodeProvider("OpenCode Zen")).toBe(true);
    expect(isOpenCodeProvider("other-provider")).toBe(false);
  });

  test("adds x-opencode-session to OpenAI SDK default headers", () => {
    const client = createOpenAIClient({
      name: "OpenCode Zen",
      base_url: "https://opencode.ai/zen/v1",
      api_key: "test-key",
      custom_headers: { "X-Test": "yes" },
    } as any);
    const headers = (client as any)._options.defaultHeaders as Record<string, string>;
    expect(headers["x-opencode-session"]).toMatch(OPENCODE_SESSION_RE);
    expect(headers["User-Agent"]).toBe(OPENCODE_USER_AGENT);
    expect(headers["X-Test"]).toBe("yes");
  });

  test("sends custom headers and OpenCode session header in Anthropic client requests", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(() => Promise.resolve(new Response(JSON.stringify({ content: [], usage: {} }))));
    globalThis.fetch = fetchMock as any;
    try {
      await createAnthropicMessage({ name: "OpenCode Zen", base_url: "https://opencode.ai/zen/v1", api_key: "secret", custom_headers: { "X-Workspace": "team" } } as any, { model: "m", messages: [], max_tokens: 5 });
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers["X-Workspace"]).toBe("team");
      expect(headers["x-opencode-session"]).toMatch(OPENCODE_SESSION_RE);
      expect(headers["x-api-key"]).toBe("secret");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

});
