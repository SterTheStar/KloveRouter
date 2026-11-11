import { describe, expect, test } from "bun:test";
import {
  codexModels,
  codexRequestBody,
  codexResponses,
  codexStreamToOpenAI,
  resolveCodexSessionId,
  responseCallId,
  stableUuid,
} from "./codex.client";

const encoder = new TextEncoder();

function upstream(chunks: string[]) {
  return new Response(
    new ReadableStream({
      async start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
  );
}

describe("codexStreamToOpenAI", () => {
  test("forwards a delta before the upstream stream completes", async () => {
    let releaseUpstream!: () => void;
    const blocked = new Promise<void>((resolve) => {
      releaseUpstream = resolve;
    });
    const source = new Response(
      new ReadableStream({
        async start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: {"type":"response.output_text.delta","delta":"first"}\n\n',
            ),
          );
          await blocked;
          controller.enqueue(
            encoder.encode(
              'data: {"type":"response.output_text.delta","delta":"second"}\n\n',
            ),
          );
          controller.close();
        },
      }),
    );
    const response = codexStreamToOpenAI(source, "gpt-test");
    const reader = response.body!.getReader();
    const first = await reader.read();

    expect(new TextDecoder().decode(first.value)).toContain(
      '"content":"first"',
    );
    releaseUpstream();
    while (!(await reader.read()).done) {
      /* Drain the remaining stream. */
    }
  });

  test("parses CRLF events split across transport chunks", async () => {
    let releaseUpstream!: () => void;
    const blocked = new Promise<void>((resolve) => {
      releaseUpstream = resolve;
    });
    const source = new Response(
      new ReadableStream({
        async start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: {"type":"response.output_text.delta","delta":"hello"}\r\n',
            ),
          );
          controller.enqueue(encoder.encode("\r\n"));
          await blocked;
          controller.close();
        },
      }),
    );
    const reader = codexStreamToOpenAI(source, "gpt-test").body!.getReader();
    const first = await reader.read();

    expect(new TextDecoder().decode(first.value)).toContain(
      '"content":"hello"',
    );
    releaseUpstream();
    while (!(await reader.read()).done) {
      /* Drain the remaining stream. */
    }
  });

  test("does not enqueue or close after the client cancels", async () => {
    let releaseUpstream!: () => void;
    const blocked = new Promise<void>((resolve) => {
      releaseUpstream = resolve;
    });
    const source = new Response(
      new ReadableStream({
        async start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
            ),
          );
          await blocked;
          controller.close();
        },
      }),
    );
    const reader = codexStreamToOpenAI(source, "gpt-test").body!.getReader();

    await reader.read();
    await reader.cancel();
    releaseUpstream();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  test("processes a final event without a trailing separator", async () => {
    const response = codexStreamToOpenAI(
      upstream(['data: {"type":"response.output_text.delta","delta":"last"}']),
      "gpt-test",
    );

    expect(await response.text()).toContain('"content":"last"');
  });
});

describe("codexModels", () => {
  test("uses the selected SQLite credential instead of the legacy session", async () => {
    const originalFetch = globalThis.fetch;
    let authorization = "";
    let accountId = "";
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const headers = new Headers(init?.headers);
      authorization = headers.get("authorization") ?? "";
      accountId = headers.get("chatgpt-account-id") ?? "";
      return Response.json({
        models: [{ slug: "gpt-test", display_name: "GPT Test" }],
      });
    }) as typeof fetch;

    try {
      const models = await codexModels({
        access_token: "sqlite-token",
        account_id: "sqlite-account",
      });
      expect(authorization).toBe("Bearer sqlite-token");
      expect(accountId).toBe("sqlite-account");
      expect(models[0]?.id).toBe("gpt-test");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("codexRequestBody", () => {
  test("omits empty or disabled reasoning and does not send output token limits", () => {
    expect(
      codexRequestBody({ messages: [], max_tokens: 20 }, "gpt-test"),
    ).not.toHaveProperty("max_output_tokens");
    expect(
      codexRequestBody({ messages: [], max_tokens: 20 }, "gpt-test"),
    ).not.toHaveProperty("reasoning");
    const disabled = { messages: [] } as any;
    Object.defineProperty(disabled, "__saturn_reasoning", {
      value: { effort: "none", upstreamValue: "none" },
    });
    expect(codexRequestBody(disabled, "gpt-test")).not.toHaveProperty(
      "reasoning",
    );
  });
});

describe("Codex prompt caching stability", () => {
  test("responseCallId preserves fc_ prefixes and deterministically hashes call_ IDs", () => {
    expect(responseCallId("fc_existing123")).toBe("fc_existing123");

    const first = responseCallId("call_abc999");
    const second = responseCallId("call_abc999");
    expect(first).toBe(second);
    expect(first.startsWith("fc_")).toBe(true);

    const different = responseCallId("call_xyz111");
    expect(different).not.toBe(first);
  });

  test("codexRequestBody produces deterministic tool call inputs across multiple requests", () => {
    const messages = [
      { role: "system", content: "You are a coding assistant." },
      { role: "user", content: "Read a file" },
      {
        role: "assistant",
        tool_calls: [
          {
            id: "call_read_1",
            type: "function",
            function: { name: "readFile", arguments: '{"path":"a.ts"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_read_1", content: "file content" },
    ];

    const body1 = codexRequestBody({ messages }, "gpt-test");
    const body2 = codexRequestBody({ messages }, "gpt-test");

    expect(body1.input).toEqual(body2.input);
    const toolCall1 = body1.input.find((i: any) => i.type === "function_call");
    const toolOutput1 = body1.input.find(
      (i: any) => i.type === "function_call_output",
    );
    expect(toolCall1.id).toBe(toolOutput1.call_id);
    expect(toolCall1.id.startsWith("fc_")).toBe(true);
  });

  test("resolveCodexSessionId maintains session affinity across conversation turns", () => {
    const turn1 = {
      messages: [
        { role: "system", content: "You are an assistant." },
        { role: "user", content: "Hello, start a conversation" },
      ],
    };
    const turn2 = {
      messages: [
        { role: "system", content: "You are an assistant." },
        { role: "user", content: "Hello, start a conversation" },
        { role: "assistant", content: "Hi there!" },
        { role: "user", content: "Follow-up question" },
      ],
    };

    const sessionTurn1 = resolveCodexSessionId(turn1);
    const sessionTurn2 = resolveCodexSessionId(turn2);
    expect(sessionTurn1).toBe(sessionTurn2);

    const differentConversation = {
      messages: [
        { role: "system", content: "You are an assistant." },
        { role: "user", content: "Completely different topic" },
      ],
    };
    expect(resolveCodexSessionId(differentConversation)).not.toBe(sessionTurn1);
  });

  test("resolveCodexSessionId respects explicit session identifiers and formats them as valid UUIDs", () => {
    const validUuid = "12345678-1234-4234-a234-123456789abc";
    expect(resolveCodexSessionId({}, validUuid)).toBe(validUuid);

    const namedSession = resolveCodexSessionId({}, "my-custom-session-slug");
    expect(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        namedSession,
      ),
    ).toBe(true);
    expect(resolveCodexSessionId({}, "my-custom-session-slug")).toBe(
      namedSession,
    );
  });

  test("codexResponses passes the resolved session_id header", async () => {
    const originalFetch = globalThis.fetch;
    let sentSessionId = "";
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const headers = new Headers(init?.headers);
      sentSessionId = headers.get("session_id") ?? "";
      return new Response("data: [DONE]\n\n", {
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as typeof fetch;

    try {
      await codexResponses(
        {
          messages: [{ role: "user", content: "Hi" }],
        },
        "gpt-test",
        { access_token: "test-token", account_id: "test-account" },
        "019add38-07f3-7e93-ae71-3e0095eb0315",
      );
      expect(sentSessionId).toBe("019add38-07f3-7e93-ae71-3e0095eb0315");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
