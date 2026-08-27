import { describe, expect, test } from "bun:test";
import { automaticMaxOutputTokens } from "./model.service";

describe("automatic max output tokens", () => {
  test("uses half of context up to 128k", () => {
    expect(automaticMaxOutputTokens(65_536)).toBe(32_768);
    expect(automaticMaxOutputTokens(128_000)).toBe(64_000);
    expect(automaticMaxOutputTokens(131_072)).toBe(65_536);
  });

  test("uses 128k for larger or unknown contexts", () => {
    expect(automaticMaxOutputTokens(131_073)).toBe(128_000);
    expect(automaticMaxOutputTokens(null)).toBe(128_000);
    expect(automaticMaxOutputTokens(undefined)).toBe(128_000);
  });
});
