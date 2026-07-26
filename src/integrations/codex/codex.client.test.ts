import { describe, expect, test } from "bun:test";
import { codexStreamToOpenAI } from "./codex.client";

const encoder = new TextEncoder();

function upstream(chunks: string[]) {
  return new Response(new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  }));
}

describe("codexStreamToOpenAI", () => {
  test("forwards a delta before the upstream stream completes", async () => {
    let releaseUpstream!: () => void;
    const blocked = new Promise<void>((resolve) => { releaseUpstream = resolve; });
    const source = new Response(new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"first"}\n\n'));
        await blocked;
        controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"second"}\n\n'));
        controller.close();
      },
    }));
    const response = codexStreamToOpenAI(source, "gpt-test");
    const reader = response.body!.getReader();
    const first = await reader.read();

    expect(new TextDecoder().decode(first.value)).toContain('"content":"first"');
    releaseUpstream();
    while (!(await reader.read()).done) { /* Drain the remaining stream. */ }
  });

  test("parses CRLF events split across transport chunks", async () => {
    let releaseUpstream!: () => void;
    const blocked = new Promise<void>((resolve) => { releaseUpstream = resolve; });
    const source = new Response(new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"hello"}\r\n'));
        controller.enqueue(encoder.encode("\r\n"));
        await blocked;
        controller.close();
      },
    }));
    const reader = codexStreamToOpenAI(source, "gpt-test").body!.getReader();
    const first = await reader.read();

    expect(new TextDecoder().decode(first.value)).toContain('"content":"hello"');
    releaseUpstream();
    while (!(await reader.read()).done) { /* Drain the remaining stream. */ }
  });

  test("processes a final event without a trailing separator", async () => {
    const response = codexStreamToOpenAI(upstream([
      'data: {"type":"response.output_text.delta","delta":"last"}',
    ]), "gpt-test");

    expect(await response.text()).toContain('"content":"last"');
  });
});
