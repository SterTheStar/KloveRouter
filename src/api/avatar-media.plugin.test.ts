import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { avatarMediaPlugin } from "./avatar-media.plugin";
import { isValidAvatar } from "../services/avatar.service";

describe("avatarMediaPlugin preset avatars", () => {
  const app = new Elysia().use(avatarMediaPlugin);

  it("serves an existing preset icon with correct content type and caching headers", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/media/avatars/presets/anthropic.png"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("public");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("etag")).toBeTruthy();

    const body = await res.arrayBuffer();
    expect(body.byteLength).toBeGreaterThan(0);
  });

  it("returns 304 when If-None-Match matches the ETag", async () => {
    const initial = await app.handle(
      new Request("http://localhost/api/media/avatars/presets/deepseek.ico"),
    );
    expect(initial.status).toBe(200);
    const etag = initial.headers.get("etag");
    expect(etag).toBeTruthy();

    const cached = await app.handle(
      new Request("http://localhost/api/media/avatars/presets/deepseek.ico", {
        headers: { "if-none-match": etag! },
      }),
    );
    expect(cached.status).toBe(304);
  });

  it("returns 404 for an unknown preset", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/media/avatars/presets/does-not-exist.png"),
    );
    expect(res.status).toBe(404);
  });

  it("prevents directory traversal attempts", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/media/avatars/presets/../../package.json"),
    );
    expect(res.status).toBe(404);
  });

  it("allows relative /api/media/avatars/ URLs in isValidAvatar", () => {
    expect(isValidAvatar("/api/media/avatars/presets/anthropic.png")).toBe(true);
    expect(isValidAvatar("/api/media/avatars/p1/abcdef")).toBe(true);
  });
});
