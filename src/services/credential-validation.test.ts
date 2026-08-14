import { describe, expect, test } from "bun:test";
import { CredentialValidationError, validateCredential } from "./credential-validation";

describe("credential validation", () => {
  test("requires matching kind and secret for token providers", () => {
    expect(() => validateCredential("chatgpt", "api_key", "token")).toThrow(CredentialValidationError);
    expect(() => validateCredential("chatgpt", "chatgpt", " ")).toThrow("requires a non-empty secret");
    expect(validateCredential("chatgpt", "chatgpt", "token").valid).toBe(true);
  });

  test("allows OAuth credentials without tokens", () => {
    expect(validateCredential("codex", "codex", undefined, { allowIncompleteOAuth: true }).valid).toBe(true);
    expect(validateCredential("antigravity", "antigravity", undefined, { allowIncompleteOAuth: true }).valid).toBe(true);
    expect(() => validateCredential("codex", "codex")).toThrow("access_token");
    expect(() => validateCredential("antigravity", "antigravity", undefined, { accessToken: "a" })).toThrow("refresh_token");
  });
});
