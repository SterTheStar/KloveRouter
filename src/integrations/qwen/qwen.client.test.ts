import { describe, expect, test } from "bun:test";
import { cleanQwenStream, extractQwenContent } from "./qwen.client";

describe("extractQwenContent", () => {
  test("preserves details as reasoning content", () => {
    expect(
      extractQwenContent("<details><summary>Thinking</summary>plan</details>answer"),
    ).toEqual({ content: "answer", reasoningContent: "Thinkingplan" });
  });

  test("removes the Howu footer from completed content", () => {
    expect(extractQwenContent("answer\n\nHowu\n\nJuly 28, 2026")).toEqual({
      content: "answer",
    });
  });

  test("removes the Howu footer from streamed chunks", async () => {
    const response = cleanQwenStream(new Response(
      'data: {"choices":[{"delta":{"content":"answer\\n\\nHowu\\n\\nJuly 28, 2026"}}]}\n\ndata: [DONE]\n\n',
      { headers: { "Content-Type": "text/event-stream" } },
    ));
    const text = await response.text();
    expect(text).toContain('"content":"answer"');
    expect(text).not.toContain("Howu");
  });
});
