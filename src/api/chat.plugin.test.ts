import { describe, expect, test } from "bun:test";
import { startTitleGeneration, withUsageStreamOptions } from "./chat.plugin";
import { chatGenerationService } from "../services/chat-generation.service";

describe("withUsageStreamOptions", () => {
  test("preserves caller stream options and enables usage reporting", () => {
    expect(withUsageStreamOptions({
      model: "model-a",
      stream: false,
      stream_options: { include_usage: false, custom: true },
    })).toEqual({
      model: "model-a",
      stream: true,
      stream_options: { include_usage: true, custom: true },
    });
  });
});

describe("chatGenerationService", () => {
  test("tracks active generation and supports explicit stop", () => {
    const controller = new AbortController();
    chatGenerationService.start("chat-a", "message-a", controller);
    expect(chatGenerationService.isActive("chat-a", "message-a")).toBe(true);
    expect(chatGenerationService.activeMessageIds("chat-a")).toEqual(["message-a"]);
    expect(chatGenerationService.stop("chat-a", "message-a")).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    chatGenerationService.finish("chat-a", "message-a");
    expect(chatGenerationService.isActive("chat-a", "message-a")).toBe(false);
  });
});

describe("startTitleGeneration", () => {
  test("does not wait for title generation before returning", async () => {
    let release!: (title: string) => void;
    const generated = new Promise<string>((resolve) => {
      release = resolve;
    });
    const titles: string[] = [];

    startTitleGeneration(() => generated, (title) => titles.push(title));
    expect(titles).toEqual([]);

    release("A useful title");
    await generated;
    await Promise.resolve();
    expect(titles).toEqual(["A useful title"]);
  });

  test("does not surface rejected title generation as an unhandled error", async () => {
    const rejection = Promise.reject(new Error("title failed"));
    startTitleGeneration(() => rejection, () => {
      throw new Error("should not be called");
    });
    await rejection.catch(() => undefined);
    await Promise.resolve();
  });
});
