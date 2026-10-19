import { describe, expect, test } from "bun:test";
import {
  googleStreamToOpenAI,
  sanitizeAntigravityPayload,
  toGoogleBody,
} from "./antigravity.transform";

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

    const text = await response.text();
    expect(text).toContain('"total_tokens":6');
    expect(text).toContain('"cached_tokens":0');
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

  test("converts audio content parts to Gemini inline data", async () => {
    const transformed = await toGoogleBody({
      model: "gemini-test",
      messages: [{ role: "user", content: [
        { type: "input_audio", input_audio: { data: "YWJj", format: "wav" } },
      ] }],
    }, "project");
    expect(transformed.request.contents[0].parts).toEqual([
      { inlineData: { mimeType: "audio/wav", data: "YWJj" } },
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
      thinkingLevel: "low",
    });
  });

  test("none on Gemini Pro clamps to the lowest thinking level instead of budget 0", async () => {
    const body = {
      model: "gemini-3-pro-agent",
      messages: [{ role: "user", content: "hello" }],
    } as any;
    Object.defineProperty(body, "__klove_reasoning", {
      value: { effort: "none", upstreamValue: "none", explicit: true },
    });
    const transformed = await toGoogleBody(body, "project");
    expect(transformed.request.generationConfig.thinkingConfig).toEqual({
      includeThoughts: false,
      thinkingLevel: "low",
    });
  });

  test("none on level-based Gemini 3 Flash uses thinkingLevel instead of budget 0", async () => {
    const body = {
      model: "gemini-3-flash-agent",
      messages: [{ role: "user", content: "hello" }],
    } as any;
    Object.defineProperty(body, "__klove_reasoning", {
      value: { effort: "none", upstreamValue: "none", explicit: true },
    });
    const transformed = await toGoogleBody(body, "project");
    expect(transformed.request.generationConfig.thinkingConfig).toEqual({
      includeThoughts: false,
      thinkingLevel: "low",
    });
  });

  test("none on Gemini 2.5 Pro clamps to the minimum thinking budget", async () => {
    const body = {
      model: "gemini-2.5-pro",
      messages: [{ role: "user", content: "hello" }],
    } as any;
    Object.defineProperty(body, "__klove_reasoning", {
      value: { effort: "none", upstreamValue: "none", explicit: true },
    });
    const transformed = await toGoogleBody(body, "project");
    expect(transformed.request.generationConfig.thinkingConfig).toEqual({
      includeThoughts: false,
      thinkingBudget: 128,
    });
  });

  test("flash variants with preview in the name still disable with budget 0", async () => {
    const body = {
      model: "gemini-2.5-flash-preview",
      messages: [{ role: "user", content: "hello" }],
    } as any;
    Object.defineProperty(body, "__klove_reasoning", {
      value: { effort: "none", upstreamValue: "none", explicit: true },
    });
    const transformed = await toGoogleBody(body, "project");
    expect(transformed.request.generationConfig.thinkingConfig).toEqual({
      includeThoughts: false,
      thinkingBudget: 0,
    });
  });

  test("sanitizes harness-specific system prompt markers like the masking sidecar", async () => {
    const transformed = await toGoogleBody({
      model: "gemini-test",
      messages: [
        {
          role: "system",
          content: [
            "<system-conventions>",
            "RFC 2119: MUST, REQUIRED, SHOULD, RECOMMENDED, MAY, OPTIONAL.",
            "</system-conventions>",
            "<system-directive>Oh My Pi coding harness</system-directive>",
            "<critical>omp Live</critical>",
          ].join("\n"),
        },
        { role: "user", content: "hello" },
      ],
    }, "project");

    const text = transformed.request.systemInstruction.parts
      .map((part: any) => part.text ?? "")
      .join("\n");

    expect(text).toContain("<guidelines>");
    expect(text).toContain("Requirement terminology: MUST means mandatory");
    expect(text).toContain("<instructions>");
    expect(text).toContain("<important>");
    expect(text).toContain("AI coding assistant");
    expect(text).toContain("coding assistant live");
    expect(text).not.toContain("system-conventions");
    expect(text).not.toContain("RFC 2119");
    expect(text).not.toContain("used_claude");
    expect(text).not.toContain("Oh My Pi");
    expect((transformed as any).requestType).toBeUndefined();
  });

  test("replaces standalone RFC 2119 clauses without a wrapper", async () => {
    const transformed = await toGoogleBody({
      model: "gemini-test",
      messages: [
        {
          role: "system",
          content: "RFC 2119: MUST and SHOULD are normative terms.",
        },
        { role: "user", content: "hello" },
      ],
    }, "project");

    const text = transformed.request.systemInstruction.parts[0].text;
    expect(text).toBe(
      "Requirement terminology: MUST means mandatory, SHOULD means recommended, and MAY means optional.",
    );
  });

  test("drops telemetry keys recursively", () => {
    expect(
      sanitizeAntigravityPayload({
        used_claude: { nested: true },
        nested: { used_claude_conservative: true, keep: "value" },
      } as Record<string, unknown>),
    ).toEqual({ nested: { keep: "value" } });
  });
});
