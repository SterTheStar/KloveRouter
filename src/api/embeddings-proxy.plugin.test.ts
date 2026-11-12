import { describe, expect, test, beforeEach } from "bun:test";
import { Elysia } from "elysia";
import { embeddingsProxyPlugin } from "./embeddings-proxy.plugin";
import { getDb } from "../db/connection";
import { keyService } from "../services/key.service";
import { providerService } from "../services/provider.service";
import { modelService } from "../services/model.service";
import { credentialService } from "../services/credential.service";

describe("embeddings-proxy.plugin", () => {
  const app = new Elysia().use(embeddingsProxyPlugin);

  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM request_logs; DELETE FROM api_keys; DELETE FROM model_capabilities; DELETE FROM models; DELETE FROM provider_credentials; DELETE FROM providers;");
  });

  test("rejects request without valid API key", async () => {
    const res = await app.handle(
      new Request("http://localhost/v1/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "openai/text-embedding-3-small", input: "test" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("rejects request when model or input is missing", async () => {
    const key = keyService.create("Test Embeddings Key");
    const res = await app.handle(
      new Request("http://localhost/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.key}`,
        },
        body: JSON.stringify({ model: "" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("rejects request if model is an image generation model", async () => {
    const key = keyService.create("Test Embeddings Key");
    const provider = providerService.create({
      name: "OpenAI",
      protocol: "openai",
      base_url: "https://api.openai.com",
    });
    credentialService.create({ provider_id: provider.id, kind: "api_key", secret: "sk-test", label: "Primary" });
    modelService.create({
      provider_id: provider.id,
      model_id: "dall-e-3",
      model_type: "image",
      capabilities: { image_generation: true },
    });

    const res = await app.handle(
      new Request("http://localhost/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.key}`,
        },
        body: JSON.stringify({ model: "openai/dall-e-3", input: "hello" }),
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.error.message).toContain("cannot be used for text embeddings");
  });
});
