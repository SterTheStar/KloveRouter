import { describe, expect, test } from "bun:test";
import { cleanQwenStream, extractQwenContent } from "./qwen.client";

describe("extractQwenContent", () => {
  test("removes details and their contents", () => {
    expect(
      extractQwenContent("<details><summary>Thinking</summary>plan</details>answer"),
    ).toEqual({ content: "answer" });
  });

  test("preserves normal content outside details", () => {
    expect(extractQwenContent("answer\n\nHowu\n\nJuly 28, 2026")).toEqual({
      content: "answer\n\nHowu\n\nJuly 28, 2026",
    });
  });

  test("preserves normal text in streamed chunks", async () => {
    const response = cleanQwenStream(new Response(
      'data: {"choices":[{"delta":{"content":"answer\\n\\nHowu\\n\\nJuly 28, 2026"}}]}\n\ndata: [DONE]\n\n',
      { headers: { "Content-Type": "text/event-stream" } },
    ));
    const text = await response.text();
    expect(text).toContain('"content":"answer\\n\\nHowu\\n\\nJuly 28, 2026"');
    expect(text).toContain("Howu");
  });

  test("removes details split across streamed chunks", async () => {
    const response = cleanQwenStream(new Response(
      'data: {"choices":[{"delta":{"content":"answer <det"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"ails>hidden</details>\\n\\nHowu"}}]}\n\n' +
      'data: [DONE]\n\n',
      { headers: { "Content-Type": "text/event-stream" } },
    ));
    const text = await response.text();
    expect(text).toContain('"content":"answer "');
    expect(text).toContain("Howu");
  });

  test("removes the exact Qwen metadata block while preserving the answer", async () => {
    const response = cleanQwenStream(new Response(
      'data: {"choices":[{"delta":{"content":"Qwen3.7\\n\\n2026-07-29"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"\\n\\n<details>\\n<summary></summary>\\n\\n```\\nResponse ID: 538fd60e-d905-4f09-94ae-78f8d715bb67\\nRequest ID: 6d8c206d-4517-464d-8025-3e7b6dd31639\\n```\\n</details>"}}]}\n\n' +
      'data: [DONE]\n\n',
      { headers: { "Content-Type": "text/event-stream" } },
    ));
    const text = await response.text();
    expect(text).toContain("Qwen3.7");
    expect(text).not.toContain("<details>");
    expect(text).not.toContain("Response ID");
    expect(text).not.toContain("Request ID");
  });
});
