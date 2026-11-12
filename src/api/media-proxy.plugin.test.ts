import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { mediaProxyPlugin } from "./media-proxy.plugin";
import { keyService } from "../services/key.service";

describe("media-proxy.plugin", () => {
  const app = new Elysia().use(mediaProxyPlugin);

  it("rejects unauthenticated requests to /api/media/models", async () => {
    const res = await app.handle(new Request("http://localhost/api/media/models"));
    expect(res.status).toBe(401);
  });

  it("accepts internal key for /api/media/models", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/media/models", {
        headers: {
          Authorization: `Bearer ${keyService.internalKey()}`,
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("rejects image generation without a valid model", async () => {
    const res = await app.handle(
      new Request("http://localhost/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${keyService.internalKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: "test",
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects text-to-speech without input text", async () => {
    const res = await app.handle(
      new Request("http://localhost/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${keyService.internalKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/tts-1",
          input: "",
        }),
      }),
    );
    // Since provider openai might or might not exist in test DB, it either rejects 404/400
    expect([400, 404]).toContain(res.status);
  });
});
