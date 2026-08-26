import { describe, expect, test } from "bun:test";
import type { ChatMessage, ChatStats } from "../../web/src/types";
import { resolveChatModel } from "../../web/src/lib/chat-model";

const validModels = new Set(["provider/session", "provider/recent", "provider/older", "provider/global"]);

function assistant(model: string | null): ChatMessage {
  const stats: ChatStats = {
    model,
    prompt_tokens: 1,
    completion_tokens: 1,
    total_tokens: 2,
    duration_ms: 1,
    tps: 1,
  };
  return { id: crypto.randomUUID(), role: "assistant", content: "", stats };
}

describe("resolveChatModel", () => {
  test("prefers a valid session model", () => {
    expect(resolveChatModel(
      "provider/session",
      [assistant("provider/recent")],
      "provider/global",
      validModels,
    )).toBe("provider/session");
  });

  test("uses the most recent valid assistant stats model", () => {
    expect(resolveChatModel(
      "",
      [assistant("provider/older"), assistant("missing/model"), assistant("provider/recent")],
      "provider/global",
      validModels,
    )).toBe("provider/recent");
  });

  test("skips an invalid recent stats model", () => {
    expect(resolveChatModel(
      "missing/session",
      [assistant("provider/older"), assistant("missing/model")],
      "provider/global",
      validModels,
    )).toBe("provider/older");
  });

  test("falls back to a valid global model for an empty chat", () => {
    expect(resolveChatModel("", [], "provider/global", validModels)).toBe("provider/global");
  });

  test("returns null when no valid model exists", () => {
    expect(resolveChatModel("missing/session", [assistant("missing/model")], "missing/global", validModels)).toBeNull();
  });
});
