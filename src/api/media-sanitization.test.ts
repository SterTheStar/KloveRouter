import { describe, expect, test, beforeEach } from "bun:test";
import { Elysia } from "elysia";
import { mediaProxyPlugin } from "./media-proxy.plugin";
import { getDb } from "../db/connection";
import { keyService } from "../services/key.service";
import { providerService } from "../services/provider.service";
import { modelService } from "../services/model.service";
import { credentialService } from "../services/credential.service";

describe("Media Request Sanitization & Defaults", () => {
  const app = new Elysia().use(mediaProxyPlugin);

  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM request_logs; DELETE FROM api_keys; DELETE FROM model_capabilities; DELETE FROM models; DELETE FROM provider_credentials; DELETE FROM providers;");
  });

  test("auto-injects mode: 'text' for Agnes video generation when omitted", async () => {
    let capturedBody: any = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      if (typeof url === "string" && url.includes("/videos")) {
        capturedBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ id: "upstream_vid_123", status: "queued" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(url, init);
    }) as any;

    try {
      const key = keyService.create("Media Key");
      const provider = providerService.create({
        name: "Agnes",
        protocol: "openai",
        base_url: "https://apihub.agnes-ai.com/v1",
      });
      credentialService.create({ provider_id: provider.id, kind: "api_key", secret: "sk-agnes", label: "Primary" });
      modelService.create({
        provider_id: provider.id,
        model_id: "agnes-video-2.5-flash",
        model_type: "video",
        capabilities: { video_generation: true },
      });

      const res = await app.handle(
        new Request("http://localhost/v1/videos", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key.key}`,
          },
          body: JSON.stringify({
            model: "agnes/agnes-video-2.5-flash",
            prompt: "a cat jumping over a fence",
          }),
        }),
      );

      expect(res.status).toBe(200);
      expect(capturedBody).toBeDefined();
      expect(capturedBody.mode).toBe("text");
      expect(capturedBody.size).toBe("720P");
      expect(capturedBody.aspect_ratio).toBe("16:9");
      expect(capturedBody.model).toBe("agnes-video-2.5-flash");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("strips 'quality' and 'style' for non-dall-e-3 image models", async () => {
    let capturedBody: any = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      if (typeof url === "string" && url.includes("/images/generations")) {
        capturedBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ data: [{ url: "https://example.com/img.png" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(url, init);
    }) as any;

    try {
      const key = keyService.create("Media Key");
      const provider = providerService.create({
        name: "Agnes",
        protocol: "openai",
        base_url: "https://apihub.agnes-ai.com/v1",
      });
      credentialService.create({ provider_id: provider.id, kind: "api_key", secret: "sk-agnes", label: "Primary" });
      modelService.create({
        provider_id: provider.id,
        model_id: "agnes-image-2.5-flash",
        model_type: "image",
        capabilities: { image_generation: true },
      });

      const res = await app.handle(
        new Request("http://localhost/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key.key}`,
          },
          body: JSON.stringify({
            model: "agnes/agnes-image-2.5-flash",
            prompt: "a majestic golden retriever",
            quality: "standard",
            style: "vivid",
          }),
        }),
      );

      expect(res.status).toBe(200);
      expect(capturedBody).toBeDefined();
      expect(capturedBody.quality).toBeUndefined();
      expect(capturedBody.style).toBeUndefined();
      expect(capturedBody.model).toBe("agnes-image-2.5-flash");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("preserves 'quality' and 'style' for dall-e-3 models", async () => {
    let capturedBody: any = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      if (typeof url === "string" && url.includes("/images/generations")) {
        capturedBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ data: [{ url: "https://example.com/dalle.png" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(url, init);
    }) as any;

    try {
      const key = keyService.create("Media Key");
      const provider = providerService.create({
        name: "OpenAI",
        protocol: "openai",
        base_url: "https://api.openai.com",
      });
      credentialService.create({ provider_id: provider.id, kind: "api_key", secret: "sk-openai", label: "Primary" });
      modelService.create({
        provider_id: provider.id,
        model_id: "dall-e-3",
        model_type: "image",
        capabilities: { image_generation: true },
      });

      const res = await app.handle(
        new Request("http://localhost/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key.key}`,
          },
          body: JSON.stringify({
            model: "openai/dall-e-3",
            prompt: "cyberpunk city",
            quality: "hd",
            style: "vivid",
          }),
        }),
      );

      expect(res.status).toBe(200);
      expect(capturedBody).toBeDefined();
      expect(capturedBody.quality).toBe("hd");
      expect(capturedBody.style).toBe("vivid");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
