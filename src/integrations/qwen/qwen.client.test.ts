import { describe, expect, test } from "bun:test";
import { extractQwenContent } from "./qwen.client";

describe("extractQwenContent", () => {
  test("preserves details as reasoning content", () => {
    expect(
      extractQwenContent("<details><summary>Thinking</summary>plan</details>answer"),
    ).toEqual({ content: "answer", reasoningContent: "Thinkingplan" });
  });
});
