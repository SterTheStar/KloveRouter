import { describe, expect, test } from "bun:test";
import { proxyErrorBody, proxyErrorStatus } from "./proxy.plugin";

describe("proxy error normalization", () => {
  test("preserves upstream status, body details, and safe fields", () => {
    const error = Object.assign(new Error("invalid request"), {
      status: 400,
      body: {
        error: {
          message: "invalid request",
          type: "invalid_request_error",
          code: "bad_input",
        },
        request_id: "req-1",
        api_key: "do-not-leak",
      },
    });

    expect(proxyErrorStatus(error)).toBe(400);
    expect(proxyErrorBody(error)).toEqual({
      error: {
        message: "invalid request",
        type: "invalid_request_error",
        code: "bad_input",
        error: {
          message: "invalid request",
          type: "invalid_request_error",
          code: "bad_input",
        },
        request_id: "req-1",
        api_key: "[redacted]",
      },
    });
  });

  test("keeps quota errors as 429 and uses a safe fallback", () => {
    expect(proxyErrorStatus(new Error("provider quota exceeded"))).toBe(429);
    expect(proxyErrorStatus(new Error("network unavailable"))).toBe(502);
    expect(proxyErrorBody(new Error("network unavailable"))).toEqual({
      error: {
        message: "network unavailable",
        type: "server_error",
        code: null,
      },
    });
  });
});
