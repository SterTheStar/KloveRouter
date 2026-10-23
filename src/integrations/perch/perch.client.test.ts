import { afterEach, describe, expect, it } from "bun:test";
import {
  PerchError,
  buildPerchPayload,
  mapPerchUsage,
  perchModels,
  perchResponses,
  perchUsage,
  perchValidate,
  resolvePerchModel,
  toOpenAIToolCalls,
} from "./perch.client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

let appCounter = 0;

function session(overrides: Record<string, unknown> = {}) {
  const appUrl = `https://app.perch.test-${++appCounter}`;
  return {
    appUrl,
    session: {
      version: 1,
      appUrl,
      accessToken: `access-token-${appCounter}`,
      refreshToken: `refresh-token-${appCounter}`,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      userId: `user-${appCounter}`,
      ...overrides,
    },
  };
}

function credential(value: Record<string, unknown>) {
  return { id: "validation", secret: JSON.stringify(value) };
}

function sse(parts: unknown[]) {
  return new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const part of parts)
          controller.enqueue(
            encoder.encode(
              typeof part === "string"
                ? part
                : `data: ${JSON.stringify(part)}\n\n`,
            ),
          );
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

function ticketResponse(runId: string) {
  return Response.json({
    ok: true,
    ticket: `ticket-${runId}`,
    runId,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
  });
}

describe("Perch client", () => {
  it("resolves built-in and upstream model ids", () => {
    expect(resolvePerchModel("deepseek-v4.1-flash")).toEqual({
      exposed: "deepseek-v4.1-flash",
      optionId: "openrouter-deepseek-deepseek-v4-1-flash",
    });
    expect(resolvePerchModel("perch-default")).toEqual({
      exposed: "perch-default",
      optionId: null,
    });
    expect(
      resolvePerchModel("openrouter-some-vendor-some-model"),
    ).toEqual({
      exposed: "openrouter-some-vendor-some-model",
      optionId: "openrouter-some-vendor-some-model",
    });
    expect(() => resolvePerchModel("not-a-perch-model")).toThrow(PerchError);
  });

  it("maps OpenAI chat requests onto the Perch model-call body", () => {
    const payload: any = buildPerchPayload(
      {
        messages: [
          { role: "developer", content: "be brief" },
          { role: "user", content: "hi" },
        ],
        tools: [{ type: "function", function: { name: "lookup" } }],
        tool_choice: "auto",
        max_completion_tokens: 64,
        temperature: 0.2,
        response_format: { type: "json_object" },
        reasoning_effort: "high",
      },
      "openrouter-vendor-model",
      "run-1",
    );
    expect(payload).toMatchObject({
      runId: "run-1",
      lane: "chat",
      clientSurface: "cli",
      manualModelOptionId: "openrouter-vendor-model",
      effort: { level: "high", orchestration: false },
    });
    expect(payload.request).toMatchObject({
      messages: [
        { role: "system", content: "be brief" },
        { role: "user", content: "hi" },
      ],
      maxOutputTokens: 64,
      temperature: 0.2,
      toolChoice: "auto",
      responseFormat: { type: "json_object" },
    });
  });

  it("maps usage and tool calls to OpenAI shapes", () => {
    expect(
      mapPerchUsage({
        inputTokens: 10,
        outputTokens: 4,
        totalTokens: 14,
        cacheReadInputTokens: 6,
      }),
    ).toEqual({
      prompt_tokens: 10,
      completion_tokens: 4,
      total_tokens: 14,
      prompt_tokens_details: { cached_tokens: 6 },
    });
    expect(
      toOpenAIToolCalls([{ id: "call_1", name: "lookup", arguments: { q: 1 } }]),
    ).toEqual([
      {
        index: 0,
        id: "call_1",
        type: "function",
        function: { name: "lookup", arguments: '{"q":1}' },
      },
    ]);
  });

  it("exposes the built-in Perch catalog", () => {
    const models = perchModels();
    expect(models.some((model) => model.id === "perch-default")).toBe(true);
    expect(models.some((model) => model.id === "qwen3.8-max")).toBe(true);
    expect(models[0]).toMatchObject({
      object: "model",
      owned_by: "perch",
      capabilities: { reasoning: true, tools: true, streaming: true },
    });
  });

  it("fetches a ticket then calls the model with the OpenAI translation", async () => {
    const { appUrl, session: value } = session();
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init });
      if (String(input).endsWith("/turn-ticket")) return ticketResponse("run-ok");
      return Response.json({
        ok: true,
        text: "Olá!",
        usage: {
          inputTokens: 12,
          outputTokens: 3,
          cacheReadInputTokens: 5,
        },
        finishReason: "stop",
      });
    }) as typeof fetch;

    const result: any = await perchResponses(
      {
        messages: [{ role: "user", content: "oi" }],
        max_tokens: 32,
        reasoning_effort: "medium",
      },
      "perch-default",
      credential(value),
      appUrl,
    );

    expect(calls.map((call) => call.url)).toEqual([
      `${appUrl}/api/perch-terminal/turn-ticket`,
      `${appUrl}/api/perch-terminal/model-call`,
    ]);
    expect(new Headers(calls[0].init?.headers).get("authorization")).toBe(
      `Bearer ${value.accessToken}`,
    );
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      surface: "cli",
      profile: "standard",
    });
    expect(new Headers(calls[1].init?.headers).get("x-perch-turn-ticket")).toBe(
      "ticket-run-ok",
    );
    expect(JSON.parse(String(calls[1].init?.body))).toMatchObject({
      runId: "run-ok",
      lane: "chat",
      clientSurface: "cli",
      effort: { level: "medium", orchestration: false },
      request: { messages: [{ role: "user", content: "oi" }], maxOutputTokens: 32 },
    });
    expect(result).toMatchObject({
      object: "chat.completion",
      model: "perch-default",
      choices: [
        {
          message: { role: "assistant", content: "Olá!" },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 3,
        total_tokens: 15,
        prompt_tokens_details: { cached_tokens: 5 },
      },
    });
  });

  it("translates Perch SSE events into OpenAI stream chunks", async () => {
    const { appUrl, session: value } = session();
    globalThis.fetch = (async (input) => {
      if (String(input).endsWith("/turn-ticket"))
        return ticketResponse("run-stream");
      return sse([
        { type: "reasoning_delta", text: "thinking" },
        { type: "answer_delta", text: "Hel" },
        { type: "answer_delta", text: "lo" },
        {
          type: "done",
          finishReason: "stop",
          usage: { inputTokens: 2, outputTokens: 2 },
          toolCalls: [],
        },
      ]);
    }) as typeof fetch;

    const response = (await perchResponses(
      {
        messages: [{ role: "user", content: "hi" }],
        stream: true,
        stream_options: { include_usage: true },
      },
      "perch-default",
      credential(value),
      appUrl,
    )) as Response;
    const text = await response.text();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain('"reasoning_content":"thinking"');
    expect(text).toContain('"content":"Hel"');
    expect(text).toContain('"content":"lo"');
    expect(text).toContain('"finish_reason":"stop"');
    expect(text).toContain('"prompt_tokens":2');
    expect(text).toContain("data: [DONE]");
  });

  it("refreshes an expired Supabase session and retries with the new token", async () => {
    const { appUrl, session: value } = session({
      expiresAt: Math.floor(Date.now() / 1000) - 60,
      accessToken: "expired-access",
    });
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/cli-auth/config"))
        return Response.json({
          ok: true,
          supabaseUrl: "https://supabase.perch.test",
          supabaseAnonKey: "anon-key",
        });
      if (url.includes("/auth/v1/token"))
        return Response.json({
          access_token: "fresh-access",
          refresh_token: "fresh-refresh",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: "user-refreshed", email: "user@example.com" },
        });
      if (url.endsWith("/turn-ticket")) return ticketResponse("run-refresh");
      return Response.json({ ok: true, text: "ok" });
    }) as typeof fetch;

    const result: any = await perchResponses(
      { messages: [{ role: "user", content: "hi" }] },
      "perch-default",
      credential(value),
      appUrl,
    );

    const refreshCall = calls.find((call) => call.url.includes("/auth/v1/token"));
    expect(refreshCall).toBeDefined();
    expect(JSON.parse(String(refreshCall?.init?.body))).toEqual({
      refresh_token: value.refreshToken,
    });
    const ticketCall = calls.find((call) => call.url.endsWith("/turn-ticket"));
    expect(new Headers(ticketCall?.init?.headers).get("authorization")).toBe(
      "Bearer fresh-access",
    );
    expect(result.choices[0].message.content).toBe("ok");
  });

  it("retries once with a fresh ticket after perch_surface_required", async () => {
    const { appUrl, session: value } = session();
    let tickets = 0;
    let modelCalls = 0;
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.endsWith("/turn-ticket")) {
        tickets += 1;
        return ticketResponse(`run-${tickets}`);
      }
      modelCalls += 1;
      if (modelCalls === 1)
        return Response.json(
          { error: "Surface required", errorCode: "perch_surface_required" },
          { status: 403 },
        );
      return Response.json({ ok: true, text: "after retry" });
    }) as typeof fetch;

    const result: any = await perchResponses(
      { messages: [{ role: "user", content: "hi" }] },
      "perch-default",
      credential(value),
      appUrl,
    );

    expect(tickets).toBe(2);
    expect(modelCalls).toBe(2);
    expect(result.choices[0].message.content).toBe("after retry");
  });

  it("validates sessions through the CLI context endpoint", async () => {
    const { appUrl, session: value } = session({ email: "me@example.com" });
    globalThis.fetch = (async (input) => {
      expect(String(input)).toBe(`${appUrl}/api/perch-terminal/cli-context`);
      return Response.json({
        ok: true,
        session: {
          userId: "user-1",
          workspaceId: "workspace-1",
          planCode: "pro",
        },
      });
    }) as typeof fetch;

    await expect(
      perchValidate(credential(value), appUrl),
    ).resolves.toEqual({
      authenticated: true,
      status: "ok",
      user_id: "user-1",
      workspace_id: "workspace-1",
      plan_code: "pro",
      email: "me@example.com",
    });
  });

  it("reads account usage from the chat host with the CLI token", async () => {
    const { appUrl, session: value } = session();
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (!url.endsWith("/api/perchai/account"))
        throw new Error(`Unexpected URL: ${url}`);
      return Response.json({
        ok: true,
        profile: { id: "user-usage", email: "usage@example.com", name: "Usage" },
        session: { planCode: "pilot", planName: "Pilot" },
        usageMeter: {
          dailyPt: 2,
          weeklyPt: 3,
          dailyUsd: 0.0015,
          weeklyUsd: 0.0025,
          monthlyUsd: 0.0035,
          dailyTokens: 4430,
          weeklyTokens: 6430,
          monthlyTokens: 8430,
          dailyCalls: 34,
          weeklyCalls: 44,
          monthlyCalls: 54,
          monthlyManualPt: 1,
          roostRolling: {
            enabled: true,
            window5hUsd: 0.0015,
            window5hCapUsd: 2.5,
            window5hNextFreedAt: "2026-10-23T15:43:14.853Z",
            window7dUsd: 0.0015,
            window7dCapUsd: 7.5,
            window7dNextFreedAt: "2026-10-30T10:43:14.853Z",
          },
        },
        creditBalancePt: 0,
        creditsEnabled: true,
        billingSubscription: null,
      });
    }) as typeof fetch;

    const usage = await perchUsage(credential(value), appUrl);

    expect(calls[0]?.url).toBe(
      `${appUrl.replace("://app.", "://chat.")}/api/perchai/account`,
    );
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe(
      `Bearer ${value.accessToken}`,
    );
    expect(usage.source).toBe("perch");
    expect(usage.profile?.email).toBe("usage@example.com");
    expect(usage.plan?.code).toBe("pilot");
    expect(usage.usage.daily).toEqual({
      points: 2,
      usd: 0.0015,
      tokens: 4430,
      calls: 34,
    });
    expect(usage.usage.monthly.manual_points).toBe(1);
    expect(usage.usage.rolling?.cap_5h_usd).toBe(2.5);
    expect(usage.credits).toEqual({ balance_points: 0, enabled: true });
  });

  it("falls back to local usage when the account endpoint is unavailable", async () => {
    const { appUrl, session: value } = session();
    globalThis.fetch = (async () => {
      throw new Error("usage network down");
    }) as unknown as typeof fetch;

    const usage = await perchUsage(credential(value), appUrl);

    expect(usage.source).toBe("local");
    expect(usage.warning).toContain("usage network down");
    expect(usage.usage.daily.tokens).toBeNull();
    expect(usage.credits.enabled).toBeNull();
  });
});
