import { describe, expect, test, beforeEach } from "bun:test";
import { Elysia } from "elysia";
import { mediaProxyPlugin } from "./media-proxy.plugin";
import { getDb } from "../db/connection";
import { keyService } from "../services/key.service";
import { providerService } from "../services/provider.service";
import { modelService } from "../services/model.service";
import { credentialService } from "../services/credential.service";

describe("Media Request Pure Pass-Through & Request Logging", () => {
  const app = new Elysia().use(mediaProxyPlugin);

  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM request_logs; DELETE FROM api_keys; DELETE FROM model_capabilities; DELETE FROM models; DELETE FROM provider_credentials; DELETE FROM providers;");
  });

  test("transparently passes through video request payload and logs the request", async () => {
    let capturedBody: any = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      if (typeof url === "string" && (url.includes("/videos") || url.includes("agnes"))) {
        capturedBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ video_id: "upstream_vid_999", status: "queued" }), {
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

      const userPayload = {
        model: "agnes/agnes-video-2.5-flash",
        prompt: "a cat jumping over a fence",
        mode: "text",
        size: "720P",
        aspect_ratio: "16:9",
        seconds: "5",
        custom_param: "preserved_intact",
      };

      const res = await app.handle(
        new Request("http://localhost/v1/videos", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key.key}`,
          },
          body: JSON.stringify(userPayload),
        }),
      );

      expect(res.status).toBe(200);
      expect(capturedBody).toBeDefined();
      expect(capturedBody.model).toBe("agnes-video-2.5-flash");
      expect(capturedBody.mode).toBe("text");
      expect(capturedBody.size).toBe("720P");
      expect(capturedBody.aspect_ratio).toBe("16:9");
      expect(capturedBody.seconds).toBe("5");
      expect(capturedBody.custom_param).toBe("preserved_intact");

      // Verify request logs captured the job
      const db = getDb();
      const logs = db.query("SELECT * FROM request_logs WHERE model_name = ?").all("agnes-video-2.5-flash") as any[];
      expect(logs.length).toBe(1);
      expect(logs[0].status).toBe("success");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("transparently passes through image generation payload and records in request logs", async () => {
    let capturedBody: any = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      if (typeof url === "string" && url.includes("/images/generations")) {
        capturedBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ created: 12345678, data: [{ url: "https://example.com/img.png" }] }), {
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
        model_id: "agnes-image-2.0-flash",
        model_type: "image",
        capabilities: { image_generation: true },
      });

      const userPayload = {
        model: "agnes/agnes-image-2.0-flash",
        prompt: "A beautiful studio photo",
        size: "1024x768",
        extra_body: { response_format: "url" },
      };

      const res = await app.handle(
        new Request("http://localhost/v1/images/generations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key.key}`,
          },
          body: JSON.stringify(userPayload),
        }),
      );

      expect(res.status).toBe(200);
      const resJson = (await res.json()) as any;
      expect(resJson.data).toBeDefined();
      expect(resJson.data[0].url).toBe("https://example.com/img.png");

      expect(capturedBody.model).toBe("agnes-image-2.0-flash");
      expect(capturedBody.prompt).toBe("A beautiful studio photo");
      expect(capturedBody.size).toBe("1024x768");
      expect(capturedBody.extra_body.response_format).toBe("url");

      // Verify request logs captured the generation
      const db = getDb();
      const logs = db.query("SELECT * FROM request_logs WHERE model_name = ?").all("agnes-image-2.0-flash") as any[];
      expect(logs.length).toBe(1);
      expect(logs[0].status).toBe("success");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
