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

describe("missing think opening tag fix", () => {
  test("prefixes only content with a closing tag before any opening tag", () => {
    const completion = {
      choices: [
        { message: { content: "reasoning</THINK >answer", reasoning_content: "kept" } },
        { message: { content: "<think>reasoning</think>answer" } },
        { message: { content: "plain answer" } },
      ],
      usage: { total_tokens: 3 },
    };

    expect(fixMissingThinkOpeningTag(completion)).toBe(completion);
    expect(completion).toEqual({
      choices: [
        { message: { content: "<think>reasoning</THINK >answer", reasoning_content: "kept" } },
        { message: { content: "<think>reasoning</think>answer" } },
        { message: { content: "plain answer" } },
      ],
      usage: { total_tokens: 3 },
    });
  });

  test("does nothing when disabled", () => {
    const completion = { choices: [{ message: { content: "reasoning</think>answer" } }] };
    fixMissingThinkOpeningTag(completion, false);
    expect(completion.choices[0].message.content).toBe("reasoning</think>answer");
  });

  test("buffers fragmented tags independently per choice and preserves fields", async () => {
    const source = (async function* () {
      yield chunk(0, "reason");
      yield chunk(1, "<thi");
      yield chunk(0, "ing</thi", { reasoning_content: "kept" });
      yield chunk(1, "nk>ok");
      yield chunk(0, "nk>answer");
      yield { ...chunk(0, undefined, { tool_calls: [{ index: 0 }] }), usage: { total_tokens: 9 } };
    })();
    const output = await collect(fixThinkTagAsyncIterable(source));

    expect(contentOf(output, 0)).toBe("<think>reasoning</think>answer");
    expect(contentOf(output, 1)).toBe("<think>ok");
    expect(output.some((item) => item.usage?.total_tokens === 9)).toBe(true);
    expect(output.some((item) => item.choices?.[0]?.delta?.reasoning_content === "kept")).toBe(true);
    expect(output.some((item) => item.choices?.[0]?.delta?.tool_calls)).toBe(true);
  });

  test("flushes original content when the stream ends undecided", async () => {
    const output = await collect(
      fixThinkTagAsyncIterable(
        (async function* () {
          yield chunk(0, "plain ");
          yield chunk(0, "answer");
        })(),
      ),
    );
    expect(contentOf(output)).toBe("plain answer");
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
    );
    const text = await response.text();

    expect(response.status).toBe(206);
    expect(response.headers.get("x-test")).toBe("yes");
    expect(text).toContain('"content":"<think>reason"');
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
    ).body!.getReader();
    await reader.cancel("client closed");
    expect(cancelled).toBe("client closed");
  });
});
