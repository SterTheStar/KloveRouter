import { describe, expect, it } from "bun:test";
import { faviconUrl, isValidAvatar, providerAvatarSources, resolveProviderAvatar } from "./provider-appearance";

describe("provider appearance", () => {
  it("uses custom avatar before protocol and favicon fallbacks", () => {
    expect(resolveProviderAvatar("https://cdn.example/icon.png", "codex", "https://api.example.com")).toBe("https://cdn.example/icon.png");
  });

  it("uses one favicon format for generic providers", () => {
    expect(faviconUrl("https://api.example.co.uk/v1")).toBe("https://www.google.com/s2/favicons?domain=api.example.co.uk&sz=64");
    expect(resolveProviderAvatar(null, "openai", "https://api.example.co.uk/v1")).toBe(faviconUrl("https://api.example.co.uk/v1"));
  });

  it("keeps fallback sources ordered and deduplicated", () => {
    const favicon = faviconUrl("https://openai.com/v1")!;
    expect(providerAvatarSources(null, "codex", "https://openai.com/v1")).toEqual([
      "https://openai.com/favicon.ico",
      favicon,
    ]);
    expect(providerAvatarSources("https://openai.com/favicon.ico", "codex", "https://openai.com/v1")).toEqual([
      "https://openai.com/favicon.ico",
      favicon,
    ]);
  });

  it("validates supported avatar values", () => {
    expect(isValidAvatar("https://example.com/icon.png")).toBe(true);
    expect(isValidAvatar("javascript:alert(1)")).toBe(false);
    expect(isValidAvatar("not a URL")).toBe(false);
  });
});
