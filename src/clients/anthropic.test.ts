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
