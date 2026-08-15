import { afterAll, describe, expect, test } from "bun:test";
import { countCompletion, countMessages, countText, disposeTokenCounter, estimateUsage } from "./token-counter";

afterAll(() => disposeTokenCounter());

describe("token counter", () => {
  test("counts Portuguese text deterministically", () => {
    const first = countText("Olá, Andressa! Tudo bem?", { provider: "qwen", model: "qwen-max" });
    const second = countText("Olá, Andressa! Tudo bem?", { provider: "qwen", model: "qwen-max" });
    expect(first).toBeGreaterThan(0);
    expect(first).toBe(second);
  });

  test("counts message roles and textual multimodal parts", () => {
    const count = countMessages([
      { role: "system", content: "Contexto" },
      { role: "user", content: [{ type: "input_text", text: "Pergunta" }, { type: "image_url", image_url: "ignored" }] },
    ], { provider: "conol", model: "conol-default" });
    expect(count).toBeGreaterThan(countText("Contexto\nPergunta", { provider: "conol", model: "conol-default" }));
  });

  test("estimates prompt and completion together", () => {
    const usage = estimateUsage([{ role: "user", content: "Oi" }], "Olá!", { provider: "conol", model: "conol-default" });
    expect(usage.prompt).toBeGreaterThan(0);
    expect(usage.completion).toBe(countCompletion("Olá!", { provider: "conol", model: "conol-default" }));
    expect(usage.total).toBe(usage.prompt + usage.completion);
    expect(usage.estimated).toBe(true);
  });
});
