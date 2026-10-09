import { describe, expect, it } from "bun:test";
import {
  MAX_AVATAR_BYTES,
  avatarCandidates,
  avatarHash,
  avatarMediaUrl,
  avatarResponseHeaders,
  faviconUrl,
  isValidAvatar,
  parseDataAvatar,
  publicAvatar,
} from "./avatar.service";

const png = "data:image/png;base64,AAECAw==";

describe("avatar data URLs", () => {
  it("parses supported data URLs and hashes decoded bytes", () => {
    expect(parseDataAvatar(png)?.mimeType).toBe("image/png");
    expect([...parseDataAvatar(png)!.bytes]).toEqual([0, 1, 2, 3]);
    expect(avatarHash(png)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects malformed base64 that the old validator accepted", () => {
    expect(parseDataAvatar("data:image/png;base64,AA!!")).toBeNull();
    expect(isValidAvatar("data:image/png;base64,AA!!")).toBe(false);
  });

  it("enforces the 25 MB limit on decoded bytes, not base64 length", () => {
    const decodedLimit = Buffer.alloc(MAX_AVATAR_BYTES, 1).toString("base64");
    expect(isValidAvatar(`data:image/png;base64,${decodedLimit}`)).toBe(true);
    const tooBig = Buffer.alloc(MAX_AVATAR_BYTES + 1, 1).toString("base64");
    expect(isValidAvatar(`data:image/png;base64,${tooBig}`)).toBe(false);
  });

  it("creates a versioned media URL with an encoded owner id", () => {
    expect(avatarMediaUrl("provider/1", png)).toBe(`/api/media/avatars/provider%2F1/${avatarHash(png)}`);
  });

  it("sets immutable cache, ETag and nosniff headers", () => {
    const headers = avatarResponseHeaders("image/png", "abc");
    expect(headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(headers.get("etag")).toBe('"abc"');
    expect(headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("avatar validation", () => {
  it("accepts empty values and http(s) URLs only", () => {
    expect(isValidAvatar(null)).toBe(true);
    expect(isValidAvatar("")).toBe(true);
    expect(isValidAvatar("https://example.com/icon.png")).toBe(true);
    expect(isValidAvatar("javascript:alert(1)")).toBe(false);
    expect(isValidAvatar("not a URL")).toBe(false);
  });
});

describe("avatar resolution", () => {
  const favicon = faviconUrl("https://openai.com/v1")!;

  it("uses the custom avatar before brand and favicon fallbacks", () => {
    expect(
      avatarCandidates({ avatar: "https://cdn.example/icon.png", protocol: "codex", baseUrl: "https://api.example.com" })[0],
    ).toBe("https://cdn.example/icon.png");
  });

  it("uses the same favicon format for generic providers", () => {
    expect(faviconUrl("https://api.example.co.uk/v1")).toBe(
      "https://www.google.com/s2/favicons?domain=api.example.co.uk&sz=64",
    );
    expect(avatarCandidates({ avatar: null, protocol: "openai", baseUrl: "https://api.example.co.uk/v1" })).toEqual([
      faviconUrl("https://api.example.co.uk/v1")!,
    ]);
  });

  it("orders and deduplicates candidates", () => {
    expect(avatarCandidates({ avatar: null, protocol: "codex", baseUrl: "https://openai.com/v1" })).toEqual([
      "https://openai.com/favicon.ico",
      favicon,
    ]);
    expect(
      avatarCandidates({ avatar: "https://openai.com/favicon.ico", protocol: "codex", baseUrl: "https://openai.com/v1" }),
    ).toEqual(["https://openai.com/favicon.ico", favicon]);
  });

  it("never exposes raw data URLs in public output", () => {
    const pub = publicAvatar({ id: "p1", avatar: png, protocol: "openai", baseUrl: "https://api.example.com" });
    expect(pub.avatar).toBe(avatarMediaUrl("p1", png));
    expect(pub.sources.some((source) => source.startsWith("data:"))).toBe(false);
    expect(pub.sources).toContain(faviconUrl("https://api.example.com")!);
  });

  it("returns no avatar when nothing can be resolved", () => {
    expect(publicAvatar({ id: "p", avatar: null, protocol: "openai", baseUrl: "not a url" })).toEqual({
      avatar: null,
      sources: [],
    });
  });
});
