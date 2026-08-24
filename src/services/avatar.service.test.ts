import { describe, expect, it } from "bun:test";
import {
  avatarHash,
  avatarMediaUrl,
  avatarResponseHeaders,
  parseDataAvatar,
} from "./avatar.service";

describe("avatar media", () => {
  const data = "data:image/png;base64,AAECAw==";

  it("parses supported data URLs and hashes bytes", () => {
    expect(parseDataAvatar(data)?.mimeType).toBe("image/png");
    expect([...parseDataAvatar(data)!.bytes]).toEqual([0, 1, 2, 3]);
    expect(avatarHash(data)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("creates versioned media URL", () => {
    expect(avatarMediaUrl("provider/1", data)).toBe(
      `/api/media/avatars/provider%2F1/${avatarHash(data)}`,
    );
  });

  it("sets immutable cache, ETag and nosniff headers", () => {
    const headers = avatarResponseHeaders("image/png", "abc");
    expect(headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(headers.get("etag")).toBe('"abc"');
    expect(headers.get("x-content-type-options")).toBe("nosniff");
  });
});
