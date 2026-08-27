import { describe, expect, test } from "bun:test";
import {
  fixMissingThinkOpeningTag,
  fixThinkTagAsyncIterable,
  fixThinkTagSseResponse,
} from "./think-tag-fix";

function chunk(index: number, content?: string, extra: any = {}) {
  return {
    id: "chunk",
    object: "chat.completion.chunk",
    choices: [
      {
        index,
        delta: { role: "assistant", ...(content === undefined ? {} : { content }), ...extra },
        finish_reason: null,
      },
    ],
  };
}

async function collect(stream: AsyncIterable<any>) {
  const output = [];
  for await (const item of stream) output.push(item);
  return output;
}

function contentOf(chunks: any[], index = 0) {
  return chunks
    .flatMap((item) => item.choices ?? [])
    .filter((choice) => choice.index === index)
    .map((choice) => choice.delta?.content ?? "")
    .join("");
}

function reasoningOf(chunks: any[], index = 0) {
  return chunks
    .flatMap((item) => item.choices ?? [])
    .filter((choice) => choice.index === index)
    .map((choice) => choice.delta?.reasoning_content ?? "")
    .join("");
}

describe("missing think opening tag fix", () => {
  test("prefixes only content with a closing tag before any opening tag in detect mode", () => {
    const completion = {
      choices: [
        { message: { content: "reasoning</THINK >answer", reasoning_content: "kept" } },
        { message: { content: "<think>reasoning</think>answer" } },
        { message: { content: "plain answer" } },
      ],
      usage: { total_tokens: 3 },
    };

    expect(fixMissingThinkOpeningTag(completion, "detect")).toBe(completion);
    expect(completion).toEqual({
      choices: [
        { message: { content: "reasoning</THINK >answer", reasoning_content: "kept" } },
        { message: { content: "answer", reasoning_content: "<think>reasoning</think>" } },
        { message: { content: "plain answer" } },
      ],
      usage: { total_tokens: 3 },
    });
  });

  test("does nothing when off", () => {
    const completion = { choices: [{ message: { content: "reasoning</think>answer" } }] };
    fixMissingThinkOpeningTag(completion, "off");
    expect(completion.choices[0].message.content).toBe("reasoning</think>answer");
  });

  test("force extracts reasoning up to the closing tag in non-stream", () => {
    const completion = {
      choices: [
        { message: { content: "plain answer" } },
        { message: { content: "<think>tagged</think>answer" } },
        { message: { content: "" } },
        { message: { content: null } },
      ],
    };
    fixMissingThinkOpeningTag(completion, "force");
    expect(completion.choices.map((choice: any) => choice.message.content)).toEqual([
      null,
      "answer",
      "",
      null,
    ]);
    expect(completion.choices.map((choice: any) => choice.message.reasoning_content)).toEqual([
      "plain answer",
      "<think>tagged</think>",
      undefined,
      undefined,
    ]);
  });

  test("detect extracts complete think blocks and keeps surrounding text", () => {
    const completion = {
      choices: [
        { message: { content: "before<think>one</think>middle<think>two</think>after" } },
        { message: { content: "no tags here" } },
        { message: { content: "unclosed <think>block" } },
      ],
    };
    fixMissingThinkOpeningTag(completion, "detect");
    expect((completion.choices[0].message as any).reasoning_content).toBe("<think>one</think><think>two</think>");
    expect(completion.choices[0].message.content).toBe("beforemiddleafter");
    expect((completion.choices[1].message as any).reasoning_content).toBeUndefined();
    expect(completion.choices[1].message.content).toBe("no tags here");
    expect(completion.choices[2].message.content).toBe("unclosed <think>block");
  });

  test("detect preserves existing reasoning_content", () => {
    const completion = {
      choices: [
        { message: { content: "<think>new</think>answer", reasoning_content: "existing" } },
      ],
    };
    fixMissingThinkOpeningTag(completion, "detect");
    expect(completion.choices[0].message.reasoning_content).toBe("existing<think>new</think>");
    expect(completion.choices[0].message.content).toBe("answer");
  });

  test("buffers fragmented tags independently per choice and preserves fields in detect mode", async () => {
    const source = (async function* () {
      yield chunk(0, "reason");
      yield chunk(1, "<thi");
      yield chunk(0, "ing</thi", { reasoning_content: "kept" });
      yield chunk(1, "nk>ok");
      yield chunk(0, "nk>answer");
      yield { ...chunk(0, undefined, { tool_calls: [{ index: 0 }] }), usage: { total_tokens: 9 } };
    })();
    const output = await collect(fixThinkTagAsyncIterable(source, "detect"));

    expect(contentOf(output, 0)).toBe("answer");
    expect(reasoningOf(output, 0)).toBe("kept<think>reasoning</think>");
    expect(contentOf(output, 1)).toBe("<think>ok");
    expect(output.some((item) => item.usage?.total_tokens === 9)).toBe(true);
    expect(output.some((item) => item.choices?.[0]?.delta?.reasoning_content === "kept")).toBe(true);
    expect(output.some((item) => item.choices?.[0]?.delta?.tool_calls)).toBe(true);
  });

  test("flushes original content when the stream ends undecided in detect mode", async () => {
    const output = await collect(
      fixThinkTagAsyncIterable(
        (async function* () {
          yield chunk(0, "plain ");
          yield chunk(0, "answer");
        })(),
        "detect",
      ),
    );
    expect(contentOf(output)).toBe("plain answer");
  });

  test("force emits the first text chunk immediately without waiting for tags", async () => {
    const source = (async function* () {
      yield chunk(0, undefined, { role: "assistant" });
      yield chunk(0, "");
      yield chunk(0, "hello");
      yield chunk(0, " world");
    })();
    const output = await collect(fixThinkTagAsyncIterable(source, "force"));
    const firstText = output.find(
      (item) =>
        typeof item.choices?.[0]?.delta?.reasoning_content === "string" &&
        item.choices[0].delta.reasoning_content.length > 0,
    );

    expect(firstText).toEqual({
      id: "chunk",
      object: "chat.completion.chunk",
      choices: [
        {
          index: 0,
          delta: { role: "assistant", reasoning_content: "<think>" },
          finish_reason: null,
        },
      ],
    });
    expect(reasoningOf(output)).toBe("<think>hello world");
    expect(contentOf(output)).toBe("");
  });

  test("force tracks each choice independently", async () => {
    const source = (async function* () {
      yield chunk(0, "aa");
      yield chunk(1, "bb");
      yield chunk(0, "cc");
    })();
    const output = await collect(fixThinkTagAsyncIterable(source, "force"));

    expect(reasoningOf(output, 0)).toBe("<think>aacc");
    expect(reasoningOf(output, 1)).toBe("<think>bb");
    expect(contentOf(output, 0)).toBe("");
    expect(contentOf(output, 1)).toBe("");
  });

  test("force keeps all content as reasoning when there is no closing tag", async () => {
    const source = (async function* () {
      yield chunk(0, "<thi");
      yield chunk(0, "nk>answer");
    })();
    const output = await collect(fixThinkTagAsyncIterable(source, "force"));
    expect(reasoningOf(output)).toBe("<think>answer");
    expect(contentOf(output)).toBe("");
  });

  test("detect splits reasoning and answer across tags", async () => {
    const source = (async function* () {
      yield chunk(0, "before<think>reas");
      yield chunk(0, "oning</think>after");
    })();
    const output = await collect(fixThinkTagAsyncIterable(source, "detect"));

    expect(contentOf(output)).toBe("beforeafter");
    expect(reasoningOf(output)).toBe("<think>reasoning</think>");
  });

  test("detect emits answer before opening tag as content", async () => {
    const source = (async function* () {
      yield chunk(0, "hello <think>world</think> done");
    })();
    const output = await collect(fixThinkTagAsyncIterable(source, "detect"));
    expect(contentOf(output)).toBe("hello  done");
    expect(reasoningOf(output)).toBe("<think>world</think>");
  });

  test("detect does not extract when no closing tag", async () => {
    const source = (async function* () {
      yield chunk(0, "<think>unclosed");
    })();
    const output = await collect(fixThinkTagAsyncIterable(source, "detect"));
    expect(contentOf(output)).toBe("<think>unclosed");
    expect(reasoningOf(output)).toBe("");
  });

  test("off returns the original stream", async () => {
    const source = (async function* () {
      yield chunk(0, "hello");
    })();
    expect(fixThinkTagAsyncIterable(source, "off")).toBe(source);
  });

  test("SSE wrapper preserves errors, finish reasons, usage, DONE, and headers", async () => {
    const input = [
      `data: ${JSON.stringify(chunk(0, "reason"))}\n\n`,
      `data: ${JSON.stringify(chunk(0, "ing</think>answer"))}\n\n`,
      `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { total_tokens: 4 } })}\n\n`,
      `data: ${JSON.stringify({ error: { message: "late" } })}\n\n`,
      "data: [DONE]\n\n",
    ].join("");
    const response = fixThinkTagSseResponse(
      new Response(input, {
        status: 206,
        headers: { "content-type": "text/event-stream", "x-test": "yes" },
      }),
      "detect",
    );
    const text = await response.text();

    expect(response.status).toBe(206);
    expect(response.headers.get("x-test")).toBe("yes");
    expect(text).toContain('"reasoning_content":"<think>reasoning</think>"');
    expect(text).toContain('"content":"answer"');
    expect(text).toContain('"finish_reason":"stop"');
    expect(text).toContain('"total_tokens":4');
    expect(text).toContain('"message":"late"');
    expect(text).toContain("data: [DONE]");
  });

  test("propagates cancellation to an SSE source", async () => {
    let cancelled: unknown;
    const source = new ReadableStream({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk(0, "pending"))}\n\n`));
      },
      cancel(reason) {
        cancelled = reason;
      },
    });
    const reader = fixThinkTagSseResponse(
      new Response(source, { headers: { "content-type": "text/event-stream" } }),
      "detect",
    ).body!.getReader();
    await reader.cancel("client closed");
    expect(cancelled).toBe("client closed");
  });

  test("SSE wrapper for force emits the first text event immediately", async () => {
    const input = [
      `data: ${JSON.stringify(chunk(0, undefined, { role: "assistant" }))}\n\n`,
      `data: ${JSON.stringify(chunk(0, "hello"))}\n\n`,
      `data: ${JSON.stringify(chunk(0, " world"))}\n\n`,
      "data: [DONE]\n\n",
    ].join("");
    const response = fixThinkTagSseResponse(
      new Response(input, { headers: { "content-type": "text/event-stream" } }),
      "force",
    );
    const text = await response.text();
    expect(text).toContain('"reasoning_content":"hello"');
    expect(text).toContain('"reasoning_content":" world"');
    expect(text).not.toContain('"content":"hello"');
  });

  test("SSE wrapper returns the original response when off", () => {
    const original = new Response("data: [DONE]\n\n", {
      headers: { "content-type": "text/event-stream" },
    });
    expect(fixThinkTagSseResponse(original, "off")).toBe(original);
  });
});
