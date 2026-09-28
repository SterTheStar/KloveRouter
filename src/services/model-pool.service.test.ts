process.env.DB_PATH = ":memory:";

import { beforeEach, describe, expect, test } from "bun:test";
import { getDb } from "../db/connection";
import { formatPoolRequestError, modelPoolService, poolEffectiveLimits, poolSlugFromModelId, routeModelPool, validatePoolMemberCompatibility, validatePoolTokenLimits } from "./model-pool.service";

const db = getDb();

function seed() {
  db.exec(`
    DELETE FROM model_pool_members;
    DELETE FROM model_pools;
    DELETE FROM models;
    DELETE FROM providers;
    INSERT INTO providers (id, name, base_url, api_key) VALUES
      ('p1', 'Provider One', 'http://provider-one.test/v1', 'key-one'),
      ('p2', 'Provider Two', 'http://provider-two.test/v1', 'key-two');
    INSERT INTO models (id, provider_id, model_id, display_name, is_active, context_window, max_output_tokens, max_output_tokens_source, think_opening_tag_mode) VALUES
      ('m1', 'p1', 'one', 'One', 1, 32000, 8192, 'api', 'off'),
      ('m2', 'p2', 'two', 'Two', 1, 16000, 4096, 'api', 'off'),
      ('m3', 'p2', 'inactive', 'Inactive', 0, 8000, 2048, 'api', 'off');
    INSERT INTO model_capabilities (model_id, streaming, tools, vision, attachments, non_streaming)
      VALUES ('m1', 1, 1, 1, 1, 1), ('m2', 1, 0, 0, 1, 1), ('m3', 1, 1, 1, 1, 1);
  `);
}

beforeEach(seed);

function input(overrides: Partial<Parameters<typeof modelPoolService.create>[0]> = {}) {
  return {
    name: "Reliable Chat",
    slug: "reliable-chat",
    strategy: "priority" as const,
    hide_members: true,
    is_active: true,
    max_input_tokens: null,
    max_output_tokens: null,
    members: [{ model_id: "m1", priority: 0, fallback: true }, { model_id: "m2", priority: 1, fallback: true }],
    ...overrides,
  };
}

describe("modelPoolService", () => {
  test("includes pool and every attempted member in final error details", () => {
    expect(formatPoolRequestError("Coding team", ["provider/model-a (503): offline", "provider/model-b: timeout"]))
      .toBe('Compound model "Coding team" failed. provider/model-a (503): offline; provider/model-b: timeout');
  });

  test("parses pool public IDs without accepting unrelated namespaces", () => {
    expect(poolSlugFromModelId("pool/reliable-chat")).toBe("reliable-chat");
    expect(poolSlugFromModelId("POOL/Reliable-Chat")).toBe("reliable-chat");
    expect(poolSlugFromModelId("openai/gpt-4")).toBeNull();
  });

  test("creates custom public IDs and persists member priority atomically", () => {
    const pool = modelPoolService.create(input());
    expect(pool.public_id).toBe("pool/reliable-chat");
    expect(pool.members.map((member) => [member.id, member.priority])).toEqual([["m1", 0], ["m2", 1]]);
    expect(modelPoolService.memberModelIdsHiddenFromCatalog()).toEqual(new Set(["m1", "m2"]));
  });

  test("shares only universally supported reasoning options and conservative limits", () => {
    db.exec(`
      INSERT INTO model_reasoning_efforts (id, model_id, effort, display_name, upstream_value, sort_order, is_default)
      VALUES ('e1', 'm1', 'high', 'High', 'high', 0, 1),
             ('e2', 'm2', 'low', 'Low', 'low', 0, 1),
             ('e3', 'm2', 'high', 'High', 'high', 1, 0);
    `);
    const pool = modelPoolService.create(input());
    const publicPool = modelPoolService.apiModels().find((model) => model.id === pool.public_id)!;
    expect(publicPool.context_window).toBe(16000);
    expect(publicPool.reasoning_efforts).toHaveLength(1);
    expect(publicPool.reasoning_efforts[0].effort).toBe("high");
  });

  test("calculates effective pool limits from member minimums and optional stricter overrides", () => {
    const pool = modelPoolService.create(input());
    const hydrated = modelPoolService.findById(pool.id)!;
    const limits = poolEffectiveLimits(hydrated);
    expect(limits.inputLimit).toBe(16000);
    expect(limits.outputLimit).toBe(4096);
    expect(limits.inputLimiterIds).toEqual(["m2"]);
    expect(validatePoolTokenLimits(hydrated, 17000, 5000)).toContain("Limiting model: Two");

    const overridden = modelPoolService.update(pool.id, input({ max_input_tokens: 12000, max_output_tokens: 2048 }))!;
    const overrideLimits = poolEffectiveLimits(overridden);
    expect(overrideLimits.inputLimit).toBe(12000);
    expect(overrideLimits.outputLimit).toBe(2048);
    expect(validatePoolTokenLimits(overridden, 12000, 2049)).toContain("configured maximum for this compound model");
  });

  test("uses null override values as no custom limit", () => {
    const pool = modelPoolService.create(input({ max_input_tokens: null, max_output_tokens: null }));
    const limits = poolEffectiveLimits(pool);
    expect(limits.inputLimit).toBe(16000);
    expect(limits.outputLimit).toBe(4096);
  });

  test("allows unknown member limits when explicit safe pool limits are set", () => {
    db.exec("UPDATE models SET context_window = NULL, max_output_tokens = NULL WHERE id IN ('m1', 'm2')");
    const pool = modelPoolService.create(input({ max_input_tokens: 12000, max_output_tokens: 2048 }));
    const limits = poolEffectiveLimits(pool);
    expect(limits.inputLimit).toBe(12000);
    expect(limits.outputLimit).toBe(2048);
  });

  test("rejects custom token limits above the least capable member", () => {
    expect(() => modelPoolService.create(input({ max_input_tokens: 16001 }))).toThrow("lowest member context window");
    expect(() => modelPoolService.create(input({ max_output_tokens: 4097 }))).toThrow("lowest member output limit");
  });

  test("caps member request output to the effective compound output maximum", async () => {
    const pool = modelPoolService.create(input({ max_output_tokens: 2048 }));
    let forwardedBody: any;
    const response = await routeModelPool(pool.slug, {
      model: pool.public_id,
      messages: [{ role: "user", content: "hello" }],
      max_tokens: 5000,
    }, "Bearer test", undefined, async (_url, init) => {
      forwardedBody = JSON.parse(String(init?.body));
      return Response.json({ id: "completion", choices: [{ message: { role: "assistant", content: "done" } }] });
    });
    expect(response.ok).toBe(true);
    expect(forwardedBody.max_tokens).toBe(2048);
  });

  test("estimates input and reports the model that limits the compound context", () => {
    const pool = modelPoolService.create(input());
    const responseError = validatePoolTokenLimits(pool, 17000, 1000);
    expect(responseError).toContain("input limit of 16000");
    expect(responseError).toContain("Limiting model: Two (Provider Two)");
  });

  test("allows multiple pools, supports random strategy, and does not include inactive models for routing", () => {
    const first = modelPoolService.create(input());
    const second = modelPoolService.create(input({ name: "Second", slug: "second", strategy: "random", hide_members: false }));
    expect(first.id).not.toBe(second.id);
    expect(modelPoolService.findForRouting(first.slug)?.map(({ model }) => model.id)).toEqual(["m1", "m2"]);
    expect(modelPoolService.apiModels().map((model) => model.id)).toEqual(["pool/reliable-chat", "pool/second"]);
  });

  test("enforces unique slugs and at least two distinct members", () => {
    modelPoolService.create(input());
    expect(() => modelPoolService.create(input())).toThrow("already in use");
    expect(() => modelPoolService.create(input({ slug: "one-model", members: [{ model_id: "m1", priority: 0 }] }))).toThrow("at least two");
    expect(() => modelPoolService.create(input({ slug: "duplicates", members: [{ model_id: "m1", priority: 0 }, { model_id: "m1", priority: 1 }] }))).toThrow("once");
  });

  test("requires reported member limits or an explicit pool limit", () => {
    db.exec("UPDATE models SET context_window = NULL, max_output_tokens = NULL WHERE id IN ('m1', 'm2')");
    expect(() => modelPoolService.create(input())).toThrow("context window");
    expect(() => modelPoolService.create(input({ max_input_tokens: 12000, max_output_tokens: 2048 }))).not.toThrow();
  });

  test("updates members and deletes the pool without deleting member models", () => {
    const pool = modelPoolService.create(input());
    const updated = modelPoolService.update(pool.id, input({ name: "Updated", members: [{ model_id: "m2", priority: 0, fallback: true }, { model_id: "m1", priority: 1, fallback: false }] }));
    expect(updated?.name).toBe("Updated");
    expect(updated?.members.map((member) => member.id)).toEqual(["m2", "m1"]);
    expect(updated?.members[1].fallback).toBe(false);
    expect(modelPoolService.delete(pool.id)).toBe(true);
    expect(db.query("SELECT COUNT(*) AS count FROM models").get()).toEqual({ count: 3 });
  });

  test("keeps an enabled pool enabled when saving its members", () => {
    const pool = modelPoolService.create(input({ is_active: false }));
    const updated = modelPoolService.update(pool.id, input({ is_active: true }));
    expect(updated?.is_active).toBe(true);
    expect(modelPoolService.findById(pool.id)?.is_active).toBe(true);
  });

  test("deactivates an underfilled compound model when a member is deleted", () => {
    const pool = modelPoolService.create(input());
    db.query("DELETE FROM model_pool_members WHERE pool_id = ? AND model_id = ?").run(pool.id, "m2");
    expect(modelPoolService.findById(pool.id)?.is_active).toBe(false);
  });
});

describe("model pool routing", () => {
  test("reports compatibility errors only if no member can satisfy request features", () => {
    const pool = modelPoolService.create(input());
    const members = modelPoolService.findForRouting(pool.slug)!.map(({ model }) => model);
    expect(validatePoolMemberCompatibility(members, { stream: true, tools: [{ type: "function" }] })).toBeNull();
    expect(validatePoolMemberCompatibility(members.slice(1), { stream: true, tools: [{ type: "function" }] })).toContain("No active member supports tools");
  });

  test("requires audio and video capable members when those inputs are present", () => {
    const members: any[] = [
      { capabilities: { audio_input: false, video: false, vision: true, tools: true } },
      { capabilities: { audio_input: false, video: false, vision: true, tools: true } },
    ];
    expect(validatePoolMemberCompatibility(members, { messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: "YWJj", format: "wav" } }] }] })).toContain("No active member supports audio input");
    expect(validatePoolMemberCompatibility(members, { messages: [{ role: "user", content: [{ type: "video_url", video_url: { url: "https://example.com/clip.mp4" } }] }] })).toContain("No active member supports video input");
  });

  test("retries with the next priority model after a retryable upstream failure", async () => {
    modelPoolService.create(input());
    const attempted: string[] = [];
    const response = await routeModelPool("reliable-chat", { model: "pool/reliable-chat", messages: [], stream: false }, "Bearer test", undefined, async (_url, init) => {
      const requestBody = JSON.parse(String(init?.body));
      attempted.push(requestBody.model);
      if (attempted.length === 1) return Response.json({ error: { message: "provider down" } }, { status: 503 });
      return Response.json({ id: "ok", choices: [{ message: { role: "assistant", content: "ready" } }] });
    });
    expect(response.ok).toBe(true);
    expect(attempted).toEqual(["providerone/one", "providertwo/two"]);
  });

  test("does not fall through on authentication errors", async () => {
    modelPoolService.create(input());
    let calls = 0;
    const response = await routeModelPool("reliable-chat", { model: "pool/reliable-chat", messages: [] }, "Bearer test", undefined, async () => {
      calls++;
      return Response.json({ error: "unauthorized" }, { status: 401 });
    });
    expect(response.status).toBe(401);
    expect(calls).toBe(1);
  });

  test("does not try the next member when fallback is disabled for the failing member", async () => {
    modelPoolService.create(input({ members: [{ model_id: "m1", priority: 0, fallback: false }, { model_id: "m2", priority: 1, fallback: true }] }));
    let calls = 0;
    const response = await routeModelPool("reliable-chat", { model: "pool/reliable-chat", messages: [] }, "Bearer test", undefined, async () => {
      calls++;
      return Response.json({ error: "provider unavailable" }, { status: 503 });
    });
    expect(response.status).toBe(503);
    expect(calls).toBe(1);
  });

  test("uses the selected model's request validation before returning its response", async () => {
    const pool = modelPoolService.create(input());
    let called = false;
    const response = await routeModelPool(pool.slug, { model: `pool/${pool.slug}`, messages: [], stream: true }, "Bearer test", undefined, async () => {
      called = true;
      return Response.json({ error: "bad request" }, { status: 400 });
    });
    expect(called).toBe(true);
    expect(response.status).toBe(400);
  });
});
