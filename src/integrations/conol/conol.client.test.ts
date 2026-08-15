import { afterEach, describe, expect, it } from "bun:test";
import { conolModels, conolResponses, conolValidate, parseConolCredential, conolContent, parseConolModels, conolModelMetadataFromId } from "./conol.client";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const credential = { secret: "account_id=acct-1\nsid=secret-cookie", account_id: "acct-1" };

function stream(parts: string[]) {
  return new Response(new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(new TextEncoder().encode(part)); controller.close(); } }));
}

describe("Conol client", () => {
  it("parses credential without exposing cookie", () => {
    expect(parseConolCredential("account_id=acct-1\nsid=abc")).toEqual({ accountId: "acct-1", cookie: "sid=abc" });
    expect(parseConolCredential({ account_id: "acct-1", secret: "abOpToken.signature" })).toEqual({ accountId: "acct-1", cookie: "__Secure-better-auth.session_token_multi-aboptoken=abOpToken.signature" });
    expect(() => parseConolCredential("sid=abc")).toThrow("account_id");
  });
  it("extracts OpenAI text parts", () => {
    expect(conolContent([{ type: "text", text: "one" }, { type: "image_url", image_url: "x" }, { type: "input_text", text: "two" }])).toBe("one\ntwo");
  });
  it("uses session, model, message and log stream endpoints", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      if (calls.length === 1) return Response.json({ sessionId: "s1", effectiveModel: "other" });
      if (calls.length === 2) return Response.json({ ok: true });
      return stream(['data: {"type":"history_delta","stages":[{"preview":[{"type":"message","content":[{"text":"hi"}]}]}]}\r\n', '\r\n', 'data: {"type":"done"}\n\n']);
    }) as typeof fetch;
    const result = await conolResponses({ messages: [{ role: "user", content: "hello" }], stream: false, timezone: "America/Sao_Paulo" }, "agent-x", credential, "https://conol.test");
    expect(result).toMatchObject({ object: "chat.completion", choices: [{ message: { content: "hi" } }] });
    expect(calls.map((call) => call.url)).toEqual(["https://conol.test/api/sessions", "https://conol.test/api/sessions/s1/model", "https://conol.test/api/sessions/s1/messages?logDeltas=1&acct=acct-1"]);
    expect(new Headers(calls[0].init?.headers).get("cookie")).toBe("sid=secret-cookie");
    expect(new Headers(calls[0].init?.headers).get("x-conol-account")).toBe("acct-1");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ source: { type: "home" }, messages: [{ type: "text", content: "hello" }], timezone: "America/Sao_Paulo" });
  });
  it("deduplicates cumulative reasoning and content in stream", async () => {
    let fetches = 0;
    globalThis.fetch = (async (_input, _init) => {
      const n = ++fetches;
      if (n === 1) return Response.json({ sessionId: "s1", effectiveModel: "m" });
      return stream(['{"type":"history_delta","stages":[{"preview":[{"type":"thinking","content":[{"text":"think"}]},{"type":"message","content":[{"text":"A"}]}]}]}\n', '{"type":"history_delta","stages":[{"preview":[{"type":"thinking","content":[{"text":"think more"}]},{"type":"message","content":[{"text":"AB"}]}]}]}\n', '{"type":"done"}']);
    }) as typeof fetch;
    const response = await conolResponses({ messages: [{ role: "user", content: "x" }], stream: true }, "m", credential);
    const text = await (response as Response).text();
    expect(text).toContain('"content":"A"');
    expect(text).toContain('"content":"B"');
    expect(text).toContain('"reasoning_content":"think"');
    expect(text).toContain('"reasoning_content":" more"');
  });
  it("removes overlapping text when cumulative snapshots shift", async () => {
    let fetches = 0;
    globalThis.fetch = (async (_input, _init) => {
      const n = ++fetches;
      if (n === 1) return Response.json({ sessionId: "s1", effectiveModel: "m" });
      return stream([
        '{"type":"history_delta","stages":[{"preview":[{"type":"message","content":[{"text":"olá, Andressa"}]}]}]}\n',
        '{"type":"history_delta","stages":[{"preview":[{"type":"message","content":[{"text":"Andressa! Tudo bem?"}]}]}]}\n',
        '{"type":"done"}',
      ]);
    }) as typeof fetch;
    const response = await conolResponses({ messages: [{ role: "user", content: "x" }], stream: true }, "m", credential);
    const text = await (response as Response).text();
    expect(text).toContain('"content":"olá, Andressa"');
    expect(text).toContain('"content":"! Tudo bem?"');
    expect(text).not.toContain('"content":"Andressa! Tudo bem?"');
  });
  it("decodes dynamic model IDs back to upstream metadata", () => {
    expect(conolModelMetadataFromId("conol:srv:agent:model:model-a")).toEqual({ agentServerId: "srv", agentName: "agent", agentModel: "model-a" });
    expect(conolModelMetadataFromId("conol:srv:agent:preset:moderate")).toEqual({ agentServerId: "srv", agentName: "agent", modelPreset: "moderate" });
  });
  it("parses servers, capabilities, object models and presets", () => {
    const models = parseConolModels({ servers: [{ id: "srv", capabilities: { agents: [{ name: "agent", models: [{ id: "model-a", display_name: "Model A" }, "model-b"], modelPresets: [{ id: "moderate", displayName: "Moderate" }, "pro"] }] } }] });
    expect(models).toHaveLength(4);
    expect(new Set(models.map((model) => model.id)).size).toBe(4);
    expect(models[0]).toMatchObject({ display_name: "Model A", agentServerId: "srv", agentName: "agent", agentModel: "model-a" });
    expect(models[2]).toMatchObject({ display_name: "Moderate", modelPreset: "moderate" });
  });
  it("fetches dynamic models with account headers and short cache", async () => {
    let calls = 0;
    globalThis.fetch = (async (_input, init) => { calls++; expect(new Headers(init?.headers).get("cookie")).toBe("sid=secret-cookie"); expect(new Headers(init?.headers).get("x-conol-account")).toBe("acct-1"); return Response.json({ servers: [{ id: "srv", capabilities: { agents: [{ name: "a", models: ["m"] }] } }] }); }) as typeof fetch;
    const first = await conolModels(credential, "https://conol.models");
    const second = await conolModels(credential, "https://conol.models");
    expect(first).toEqual(second);
    expect(calls).toBe(1);
  });
  it("rejects invalid capabilities credentials and falls back only for empty structure", async () => {
    globalThis.fetch = (async () => new Response(null, { status: 401 })) as unknown as typeof fetch;
    await expect(conolModels({ secret: "account_id=acct-1\nsid=x" }, "https://conol.invalid")).rejects.toThrow("401");
    globalThis.fetch = (async () => Response.json({ servers: [] })) as unknown as typeof fetch;
    expect((await conolModels({ secret: "account_id=acct-empty\nsid=x" }, "https://conol.empty")).length).toBeGreaterThan(0);
  });
  it("returns manual models and validates", async () => {
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => { expect(String(init?.method)).toBe("GET"); return Response.json({ servers: [] }); }) as typeof fetch;
    expect((await conolModels(credential, "https://conol.test")).length).toBeGreaterThan(0);
    globalThis.fetch = (async () => Response.json({ sessionId: "s", effectiveModel: "m" })) as unknown as typeof fetch;
    await expect(conolValidate(credential, "https://conol.validate")).resolves.toMatchObject({ authenticated: true, status: "ok" });
  });
  it("sends the selected model through the documented model endpoint", async () => {
    const bodies: any[] = [];
    globalThis.fetch = (async (_input, init) => { bodies.push(JSON.parse(String(init?.body ?? "{}"))); if (bodies.length === 1) return Response.json({ sessionId: "s", effectiveModel: "other" }); if (bodies.length === 2) return Response.json({ ok: true }); return stream(['{"type":"done"}']); }) as typeof fetch;
    await conolResponses({ messages: [{ role: "user", content: "hello" }] }, { agentModel: "deepseek/deepseek-v4-flash-0731" }, credential, "https://conol.payload");
    expect(bodies[0]).toMatchObject({ source: { type: "home" }, messages: [{ type: "text", content: "hello" }], timezone: "UTC" });
    expect(bodies[0]).not.toHaveProperty("agentModel");
    expect(bodies[1]).toEqual({ agentModel: "deepseek/deepseek-v4-flash-0731" });
  });
});
