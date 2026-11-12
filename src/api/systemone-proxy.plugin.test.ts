import { describe, expect, test, beforeEach } from "bun:test";
import { Elysia } from "elysia";
import { systemOneProxyPlugin } from "./systemone-proxy.plugin";
import { getDb } from "../db/connection";
import { keyService } from "../services/key.service";
import { providerService } from "../services/provider.service";
import { modelService } from "../services/model.service";
import { credentialService } from "../services/credential.service";

describe("systemone-proxy.plugin", () => {
  const app = new Elysia().use(systemOneProxyPlugin);

  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM request_logs; DELETE FROM api_keys; DELETE FROM model_capabilities; DELETE FROM models; DELETE FROM provider_credentials; DELETE FROM providers;");
  });

  test("rejects request without valid API key", async () => {
    const res = await app.handle(
      new Request("http://localhost/v1/systemone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "typesafe/jev-1.13", state: "test", questions: { q: { type: "noul" } } }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("rejects request without state or questions", async () => {
    const key = keyService.create("SystemOne Key");
    const res = await app.handle(
      new Request("http://localhost/v1/systemone", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key.key}`,
        },
        body: JSON.stringify({ model: "typesafe/jev-1.13" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("transparently proxies SystemOne decision request and records in request logs", async () => {
    let capturedBody: any = null;
    let capturedUrl: string = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      if (typeof url === "string" && url.includes("systemone")) {
        capturedUrl = url;
        capturedBody = JSON.parse(init.body);
        return new Response(JSON.stringify({
          model: "jev-1.13",
          answers: {
            is_urgent: { value: true, probability: 0.94 },
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(url, init);
    }) as any;

    try {
      const key = keyService.create("SystemOne Key");
      const provider = providerService.create({
        name: "TypeSafe",
        protocol: "openai",
        base_url: "https://opencode.ai/inference/systemone/v1",
      });
      credentialService.create({ provider_id: provider.id, kind: "api_key", secret: "sk-typesafe", label: "Primary" });
      modelService.create({
        provider_id: provider.id,
        model_id: "jev-1.13",
        model_type: "systemone",
      });

      const userPayload = {
        model: "typesafe/jev-1.13",
        state: "Payment failed three times and server is down",
        questions: {
          is_urgent: {
            type: "noul",
            instructions: "Does this require immediate attention?",
          },
        },
      };

      const res = await app.handle(
        new Request("http://localhost/v1/systemone", {
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
      expect(resJson.answers).toBeDefined();
      expect(resJson.answers.is_urgent.value).toBe(true);

      expect(capturedUrl).toContain("https://opencode.ai/inference/systemone/v1/systemone");
      expect(capturedBody.model).toBe("jev-1.13");
      expect(capturedBody.state).toBe(userPayload.state);
      expect(capturedBody.questions.is_urgent).toBeDefined();

      // Check request logs
      const db = getDb();
      const logs = db.query("SELECT * FROM request_logs WHERE model_name = ?").all("jev-1.13") as any[];
      expect(logs.length).toBe(1);
      expect(logs[0].status).toBe("success");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
