import { describe, expect, test } from "bun:test";
import { parseModelName } from "./openai";

describe("parseModelName", () => {
  test("accepts nested model paths", () => {
    expect(parseModelName("provider/org/model")).toEqual({ providerName: "provider", modelId: "org/model" });
  });

  test.each(["", "provider", "/model", "provider/", "provider//model", " provider/model", "provider/model ", "provider/model\n"])("rejects %j", (value) => {
    expect(parseModelName(value)).toBeNull();
  });
});
