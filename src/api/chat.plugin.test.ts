import { describe, expect, test } from "bun:test";
import { startTitleGeneration } from "./chat.plugin";

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
