import { describe, expect, it } from "bun:test";
import { splitAnthropicMessages } from "./anthropic";

describe("splitAnthropicMessages", () => {
  it("keeps system and developer instructions in Anthropic system", () => {
    const result = splitAnthropicMessages([
      { role: "developer", content: "Caveman" },
      { role: "system", content: "Custom skill" },
      { role: "user", content: "Hello" },
    ]);

    expect(result.system).toBe("Caveman\nCustom skill");
    expect(result.messages).toEqual([{ role: "user", content: "Hello" }]);
  });
});

it("converts OpenAI image parts to Anthropic image blocks", () => {
  const result = splitAnthropicMessages([
    { role: "user", content: [
      { type: "text", text: "describe" },
      { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } },
    ] },
  ]);

  expect(result.messages[0].content).toEqual([
    { type: "text", text: "describe" },
    { type: "image", source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" } },
  ]);
});
