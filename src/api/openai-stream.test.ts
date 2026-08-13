import { describe, expect, test } from "bun:test";
import { openAIStreamResponse, type OpenAIStreamStats } from "./openai-stream";

const details = () => ({ cacheRead: 0, cacheWrite: 0 });

describe("openAIStreamResponse", () => {
  test("forwards chunks immediately and measures from the first semantic delta", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let clock = 10;
    let completed: OpenAIStreamStats | undefined;
    const stream = {
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { role: "assistant" } }] };
        clock = 30;
        yield { choices: [{ delta: { content: "hello" } }] };
        await blocked;
        clock = 80;
        yield {
          choices: [],
          usage: { prompt_tokens: 4, completion_tokens: 2 },
        };
      },
    };
    const response = openAIStreamResponse(stream, {
      start: 0,
      tokenDetails: details,
      now: () => clock,
      onComplete: (stats) => {
        completed = stats;
      },
      onError: () => {},
      onCancel: () => {},
    });
    const reader = response.body!.getReader();

    expect(new TextDecoder().decode((await reader.read()).value)).toBe(
      ": connected\n\n",
    );
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      '"role":"assistant"',
    );
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      '"content":"hello"',
    );
    release();
    while (!(await reader.read()).done) {
      /* Drain the stream. */
    }
    expect(completed).toEqual({
      promptTokens: 4,
      completionTokens: 2,
      cacheRead: 0,
      cacheWrite: 0,
      durationMs: 80,
      generationDurationMs: 50,
    });
  });

  test("does not overwrite cache usage with a later partial usage chunk", async () => {
    let completed: OpenAIStreamStats | undefined;
    const stream = {
      async *[Symbol.asyncIterator]() {
        yield {
          choices: [{ delta: { content: "ok" } }],
          usage: { prompt_tokens: 10, completion_tokens: 1, cached_tokens: 8 },
        };
        yield {
          choices: [],
          usage: { prompt_tokens: 10, completion_tokens: 1 },
        };
      },
    };
    const response = openAIStreamResponse(stream, {
      start: 0,
      tokenDetails: (usage) => ({
        cacheRead: Number(usage.cached_tokens ?? 0),
        cacheWrite: 0,
      }),
      onComplete: (stats) => {
        completed = stats;
      },
      onError: () => {},
      onCancel: () => {},
    });

    await response.text();
    expect(completed?.cacheRead).toBe(8);
  });

  test("emits an error and DONE and records a body failure", async () => {
    let recorded = "";
    const stream = {
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: "partial" } }] };
        throw new Error("upstream disconnected");
      },
    };
    const response = openAIStreamResponse(stream, {
      start: 0,
      tokenDetails: details,
      now: () => 10,
      onComplete: () => {},
      onError: (error) => {
        recorded = error.message;
      },
      onCancel: () => {},
    });
    const text = await response.text();

    expect(recorded).toBe("upstream disconnected");
    expect(text).toContain('"message":"upstream disconnected"');
    expect(text).toEndWith("data: [DONE]\n\n");
  });

  test("finishes SSE when the completion callback throws", async () => {
    const stream = {
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: "ok" } }] };
      },
    };
    const response = openAIStreamResponse(stream, {
      start: 0,
      tokenDetails: details,
      onComplete: () => {
        throw new Error("database unavailable");
      },
      onError: () => {
        throw new Error("must not be called");
      },
      onCancel: () => {},
    });
    const text = await response.text();

    expect(text).toEndWith("data: [DONE]\n\n");
    expect(text.match(/data: \[DONE\]/g)?.length).toBe(1);
    expect(text).not.toContain('"error"');
  });

  test("finishes SSE when the error callback throws", async () => {
    const stream = {
      async *[Symbol.asyncIterator](): AsyncGenerator<any> {
        throw new Error("upstream disconnected");
      },
    };
    const response = openAIStreamResponse(stream, {
      start: 0,
      tokenDetails: details,
      onComplete: () => {},
      onError: () => {
        throw new Error("database unavailable");
      },
      onCancel: () => {},
    });
    const text = await response.text();

    expect(text).toContain('"message":"upstream disconnected"');
    expect(text).toEndWith("data: [DONE]\n\n");
    expect(text.match(/data: \[DONE\]/g)?.length).toBe(1);
  });

  test.each([
    ["refusal", { refusal: "I cannot help with that" }],
    [
      "legacy function call",
      { function_call: { name: "lookup", arguments: "{}" } },
    ],
  ])("measures %s as a semantic delta", async (_name, delta) => {
    let clock = 40;
    let completed: OpenAIStreamStats | undefined;
    const stream = {
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta }] };
        clock = 90;
      },
    };
    const response = openAIStreamResponse(stream, {
      start: 0,
      tokenDetails: details,
      now: () => clock,
      onComplete: (stats) => {
        completed = stats;
      },
      onError: () => {},
      onCancel: () => {},
    });

    await response.text();
    expect(completed?.generationDurationMs).toBe(50);
  });

  test("aborts the SDK stream when the client cancels", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sdkController = new AbortController();
    let cancelled = false;
    let cancelStats: OpenAIStreamStats | undefined;
    const stream = {
      controller: sdkController,
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: "partial" } }] };
        await blocked;
      },
    };
    const response = openAIStreamResponse(stream, {
      start: 0,
      tokenDetails: details,
      onComplete: () => {},
      onError: () => {},
      onCancel: (stats) => {
        cancelled = true;
        cancelStats = stats;
      },
    });
    const reader = response.body!.getReader();
    await reader.read();
    // Wait for the first data chunk to be produced so the char counter
    // has run before the cancel stats are computed.
    await reader.read();
    await reader.cancel();

    expect(sdkController.signal.aborted).toBeTrue();
    expect(cancelled).toBeTrue();
    // No usage chunk arrived, so completion is estimated from streamed text.
    expect(cancelStats?.completionTokens).toBe(2);
    release();
  });
});
