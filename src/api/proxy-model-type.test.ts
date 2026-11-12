import { describe, expect, test, beforeEach } from "bun:test";
import { Elysia } from "elysia";
import { proxyPlugin } from "./proxy.plugin";
import { getDb } from "../db/connection";
import { keyService } from "../services/key.service";
import { providerService } from "../services/provider.service";
import { modelService } from "../services/model.service";

describe("Proxy Model Type Routing & Validation", () => {
  const app = new Elysia().use(proxyPlugin);

  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM request_logs; DELETE FROM api_keys; DELETE FROM model_capabilities; DELETE FROM models; DELETE FROM provider_credentials; DELETE FROM providers;");
  });

  test("/v1/models includes model_type, modalities, and architecture", async () => {
    const key = keyService.create("Test Key");
    const provider = providerService.create({
      name: "OpenAI",
      protocol: "openai",
      base_url: "https://api.openai.com",
    });

    modelService.create({
      provider_id: provider.id,
      model_id: "gpt-4o",
      model_type: "chat",
      input_modalities: ["text", "image"],
      output_modalities: ["text"],
    });

    const res = await app.handle(
      new Request("http://localhost/v1/models", {
        headers: { Authorization: `Bearer ${key.key}` },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.object).toBe("list");
    const item = body.data.find((m: any) => m.id === "openai/gpt-4o");
    expect(item).toBeDefined();
    expect(item.model_type).toBe("chat");
    expect(item.input_modalities).toContain("image");
    expect(item.architecture.modality).toBe("text+image->text");
  });

  test("/v1/chat/completions rejects image generation models", async () => {
    const key = keyService.create("Test Key");
    const provider = providerService.create({
      name: "OpenAI",
      protocol: "openai",
      base_url: "https://api.openai.com",
    });

    modelService.create({
      provider_id: provider.id,
      model_id: "dall-e-3",
      model_type: "image",
      capabilities: { image_generation: true },
    });

    const res = await app.handle(
      new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.key}`,
        },
        body: JSON.stringify({
          model: "openai/dall-e-3",
          messages: [{ role: "user", content: "hello" }],
        }),
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.message).toContain("cannot be used with chat completions");
  });

  test("/v1/chat/completions rejects embedding models", async () => {
    const key = keyService.create("Test Key");
    const provider = providerService.create({
      name: "OpenAI",
      protocol: "openai",
      base_url: "https://api.openai.com",
    });

    modelService.create({
      provider_id: provider.id,
      model_id: "text-embedding-3-small",
      model_type: "embedding",
    });

    const res = await app.handle(
      new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.key}`,
        },
        body: JSON.stringify({
          model: "openai/text-embedding-3-small",
          messages: [{ role: "user", content: "hello" }],
        }),
      }),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.message).toContain("cannot be used with chat completions");
  });
});
