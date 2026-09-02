import { describe, expect, test } from "bun:test";
import { createSseSplitter, extractSseData, extractSseEvents, splitSseEvents } from "./sse";

describe("sse helpers", () => {
  test("splits events across LF and CRLF boundaries", () => {
    expect(splitSseEvents("data: a\n\ndata: b\n\n")).toEqual(["data: a", "data: b"]);
    expect(splitSseEvents("data: a\r\n\r\ndata: b\r\n\r\n")).toEqual([
      "data: a",
      "data: b",
    ]);
    expect(splitSseEvents("data: a\r\rdata: b\r\r")).toEqual(["data: a", "data: b"]);
  });

  test("keeps incomplete trailing events in the buffer", () => {
    const split = createSseSplitter();
    expect(split("data: hel")).toEqual([]);
    expect(split("lo\n\ndata: wor")).toEqual(["data: hello"]);
    expect(split("ld\n\n")).toEqual(["data: world"]);
  });

  test("extracts multiline data payloads and skips comments", () => {
    expect(extractSseData("data: first\ndata: second")).toBe("first\nsecond");
    expect(extractSseData(": keep-alive\ndata: payload")).toBe("payload");
    expect(extractSseData(": only a comment")).toBe("");
  });

  test("extractSseEvents returns data and other fields", () => {
    expect(extractSseEvents("event: stats\ndata: {\"a\":1}\n\n")).toEqual([
      { data: '{"a":1}', rest: { event: "stats" } },
    ]);
  });
});
