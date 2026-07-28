import { describe, expect, test } from "bun:test";
import { filterLastToolMessage } from "./rtk.messages";

describe("filterLastToolMessage", () => {
  test("filters only the absolute last text tool message", async () => {
    const messages = [
      { role: "tool", content: "old" },
      { role: "assistant", content: "answer" },
      { role: "tool", content: "latest" },
    ];
    const result = await filterLastToolMessage(messages, async (value) => `[${value}]`);
    expect(result[0].content).toBe("old");
    expect(result[2].content).toBe("[latest]");
    expect(messages[2].content).toBe("latest");
  });

  test("skips when the absolute last message is not a tool", async () => {
    const messages = [
      { role: "tool", content: "output" },
      { role: "assistant", content: "answer" },
    ];
    let calls = 0;
    const result = await filterLastToolMessage(messages, async (value) => {
      calls += 1;
      return value;
    });
    expect(result).toBe(messages);
    expect(calls).toBe(0);
  });

  test("filters text parts in structured tool content", async () => {
    const messages = [{
      role: "tool",
      content: [
        { type: "text", text: "large output" },
        { type: "image_url", image_url: { url: "data:image/png;base64,x" } },
      ],
    }];
    const result = await filterLastToolMessage(messages, async () => "small");
    expect(result[0].content[0].text).toBe("small");
    expect(result[0].content[1]).toEqual(messages[0].content[1]);
  });

  test("returns the original array when filtering does not change content", async () => {
    const messages = [{ role: "tool", content: "same" }];
    const result = await filterLastToolMessage(messages, async (value) => value);
    expect(result).toBe(messages);
  });
});
