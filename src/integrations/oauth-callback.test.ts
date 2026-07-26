import { describe, expect, test } from "bun:test";
import { parseManualOAuthCallback } from "./oauth-callback";

describe("parseManualOAuthCallback", () => {
  test("accepts provider callback URLs", () => {
    expect(
      parseManualOAuthCallback(
        "http://localhost:1455/auth/callback?code=codex-code&state=codex-state",
        "codex",
      ),
    ).toEqual({ code: "codex-code", state: "codex-state" });
    expect(
      parseManualOAuthCallback(
        "http://localhost:1455/antigravity/callback?code=google-code&state=google-state",
        "antigravity",
      ),
    ).toEqual({ code: "google-code", state: "google-state" });
  });

  test("rejects the wrong host, port, and provider path", () => {
    expect(() =>
      parseManualOAuthCallback(
        "https://example.com/auth/callback?code=x&state=y",
        "codex",
      ),
    ).toThrow();
    expect(() =>
      parseManualOAuthCallback(
        "http://localhost:3000/auth/callback?code=x&state=y",
        "codex",
      ),
    ).toThrow();
    expect(() =>
      parseManualOAuthCallback(
        "http://localhost:1455/antigravity/callback?code=x&state=y",
        "codex",
      ),
    ).toThrow();
  });

  test("rejects denied and incomplete callbacks", () => {
    expect(() =>
      parseManualOAuthCallback(
        "http://localhost:1455/auth/callback?error=access_denied&state=y",
        "codex",
      ),
    ).toThrow("OAuth authorization was denied");
    expect(() =>
      parseManualOAuthCallback(
        "http://localhost:1455/auth/callback?state=y",
        "codex",
      ),
    ).toThrow("missing the OAuth code or state");
  });
});
