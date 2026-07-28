import { describe, expect, test } from "bun:test";
import { googleStreamToOpenAI, toGoogleBody } from "./antigravity.transform";

const encoder = new TextEncoder();

function upstream(chunks: string[]) {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  );
}

describe("googleStreamToOpenAI", () => {
  test("forwards a CRLF event before the upstream closes", async () => {
    let releaseUpstream!: () => void;
    const blocked = new Promise<void>((resolve) => {
      releaseUpstream = resolve;
    });
    const source = new Response(
      new ReadableStream({
        async start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: {"response":{"candidates":[{"content":{"parts":[{"text":"hello"}]}}]}}\r\n',
            ),
          );
          controller.enqueue(encoder.encode("\r\n"));
          await blocked;
          controller.close();
        },
      }),
    );
    const reader = googleStreamToOpenAI(
      source,
      "gemini-test",
      "chatcmpl-test",
    ).body!.getReader();
    const first = await reader.read();

    expect(new TextDecoder().decode(first.value)).toContain(
      '"content":"hello"',
    );
    releaseUpstream();
    while (!(await reader.read()).done) {
      /* Drain the remaining stream. */
    }
  });

  test("processes the residual event at EOF", async () => {
    const response = googleStreamToOpenAI(
      upstream([
        'data: {"response":{"candidates":[{"content":{"parts":[{"text":"last"}]}}]}}',
      ]),
      "gemini-test",
      "chatcmpl-test",
    );

    expect(await response.text()).toContain('"content":"last"');
  });

  test("joins multiline SSE data and preserves usage-only events", async () => {
    const response = googleStreamToOpenAI(
      upstream([
        'data: {"response":\n',
        'data: {"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":2,"totalTokenCount":6}}}\n\n',
      ]),
      "gemini-test",
      "chatcmpl-test",
    );

    expect(await response.text()).toContain('"total_tokens":6');
  });

  test("does not emit a duplicate finish chunk", async () => {
    const response = googleStreamToOpenAI(
      upstream([
        'data: {"response":{"candidates":[{"finishReason":"STOP"}]}}\n\n',
      ]),
      "gemini-test",
      "chatcmpl-test",
    );
    const text = await response.text();

    expect(text.match(/"finish_reason":"stop"/g)?.length).toBe(1);
  });
});

describe("toGoogleBody", () => {
  test("converts OpenAI image_url data parts to Gemini inline data", async () => {
    const transformed = await toGoogleBody({
      model: "gemini-test",
      messages: [{ role: "user", content: [
        { type: "text", text: "What is this?" },
        { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } },
      ] }],
    }, "project");

    expect(transformed.request.contents[0].parts).toEqual([
      { text: "What is this?" },
      { inlineData: { mimeType: "image/png", data: "aGVsbG8=" } },
    ]);
  });

  test("explicit effort beats model suffix and none disables thoughts", async () => {
    const body = {
      model: "gemini-3.6-flash-high",
      messages: [{ role: "user", content: "hello" }],
      max_output_tokens: 123,
    } as any;
    Object.defineProperty(body, "__klove_reasoning", {
      value: { effort: "none", upstreamValue: "disabled", explicit: true },
    });
    const transformed = await toGoogleBody(body, "project");
    expect(transformed.request.generationConfig.maxOutputTokens).toBe(123);
    expect(transformed.request.generationConfig.thinkingConfig).toEqual({
      includeThoughts: false,
      thinkingBudget: 0,
    });
  });
});
