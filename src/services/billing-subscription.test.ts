process.env.DB_PATH = ":memory:";

import { describe, expect, test, beforeEach } from "bun:test";
import { getDb } from "../db/connection";
import { defaultBillingTypeForProvider, providerService } from "./provider.service";
import { modelService } from "./model.service";
import { usageService } from "./usage.service";
import { requestLogService } from "./request-log.service";

describe("Subscription & Pay-As-You-Go Billing Support", () => {
  const db = getDb();

  beforeEach(() => {
    db.exec(`
      DELETE FROM request_logs;
      DELETE FROM usage_log;
      DELETE FROM model_pricing_tiers;
      DELETE FROM models;
      DELETE FROM providers;
    `);
  });

  test("defaultBillingTypeForProvider detects subscription, free, and pay-as-you-go", () => {
    expect(defaultBillingTypeForProvider("antigravity")).toBe("subscription");
    expect(defaultBillingTypeForProvider("codex")).toBe("subscription");
    expect(defaultBillingTypeForProvider("perch")).toBe("subscription");
    expect(defaultBillingTypeForProvider("chatgpt")).toBe("subscription");
    expect(defaultBillingTypeForProvider("deepai")).toBe("subscription");
    expect(defaultBillingTypeForProvider("openai", "PerchAI Proxy")).toBe("subscription");
    expect(defaultBillingTypeForProvider("openai", "Deepcode Enterprise")).toBe("subscription");
    expect(defaultBillingTypeForProvider("openai", "My Custom Provider", "https://api.deepcode.ai/v1")).toBe("subscription");
    expect(defaultBillingTypeForProvider("openfree")).toBe("free");
    expect(defaultBillingTypeForProvider("openai")).toBe("pay_as_you_go");
    expect(defaultBillingTypeForProvider("anthropic")).toBe("pay_as_you_go");
  });

  test("provider creation assigns default billing_type or custom override", () => {
    const p1 = providerService.create({
      name: "PerchAI Provider",
      base_url: "https://api.perch.com",
      protocol: "perch",
    });
    expect(p1.billing_type).toBe("subscription");

    const p2 = providerService.create({
      name: "Direct OpenAI",
      base_url: "https://api.openai.com/v1",
      api_key: "sk-test",
      protocol: "openai",
    });
    expect(p2.billing_type).toBe("pay_as_you_go");

    // Custom override to subscription
    const p3 = providerService.create({
      name: "Deepcode Custom Endpoint",
      base_url: "https://api.custom.com/v1",
      api_key: "sk-deepcode",
      protocol: "openai",
      billing_type: "subscription",
    });
    expect(p3.billing_type).toBe("subscription");

    // Can update billing_type at any time
    const updated = providerService.update(p2.id, { billing_type: "subscription" });
    expect(updated?.billing_type).toBe("subscription");
  });

  test("usageService records $0 cost for subscription providers and calculates cost for pay-as-you-go", () => {
    // 1. Subscription provider (e.g. Antigravity)
    const subProvider = providerService.create({
      name: "Antigravity Internal",
      base_url: "https://daily-cloudcode-pa.googleapis.com",
      protocol: "antigravity",
    });
    const subModel = modelService.create({
      provider_id: subProvider.id,
      model_id: "claude-3-5-sonnet-20241022",
      display_name: "Claude 3.5 Sonnet",
      use_litellm_pricing: true, // Even if litellm pricing was checked, subscription must not incur direct dollar costs
    });

    // 2. Pay-as-you-go provider (e.g. Anthropic direct API)
    const paygProvider = providerService.create({
      name: "Anthropic Direct",
      base_url: "https://api.anthropic.com",
      api_key: "sk-ant-test",
      protocol: "anthropic",
      billing_type: "pay_as_you_go",
    });
    const paygModel = modelService.create({
      provider_id: paygProvider.id,
      model_id: "claude-3-5-sonnet",
      display_name: "Claude 3.5 Sonnet PAYG",
      pricing_tiers: [
        {
          threshold_tokens: 0,
          input_per_million: 3.0,
          output_per_million: 15.0,
          cache_read_per_million: 0.3,
          cache_write_per_million: 3.75,
        },
      ],
    });

    // Record request for Subscription provider
    const subLog = usageService.record(
      subProvider.id,
      subModel.id,
      subModel.model_id,
      1000,
      500,
      1200,
      1200,
    );
    expect(subLog.billing_type).toBe("subscription");
    expect(subLog.estimated_cost_usd).toBe(0);

    // Record request for Pay-As-You-Go provider
    const paygLog = usageService.record(
      paygProvider.id,
      paygModel.id,
      paygModel.model_id,
      1000,
      500,
      1500,
      1500,
    );
    expect(paygLog.billing_type).toBe("pay_as_you_go");
    // 1000 * $3/M + 500 * $15/M = 0.003 + 0.0075 = 0.0105
    expect(paygLog.estimated_cost_usd).toBeCloseTo(0.0105, 5);

    // Check stats overview
    const overview = usageService.getOverview(30);
    expect(overview.total_requests).toBe(2);
    expect(overview.requests_subscription).toBe(1);
    expect(overview.requests_pay_as_you_go).toBe(1);
    expect(overview.total_tokens).toBe(3000);
    expect(overview.tokens_subscription).toBe(1500);
    expect(overview.tokens_pay_as_you_go).toBe(1500);
    expect(overview.estimated_cost_usd).toBeCloseTo(0.0105, 5);

    // Check byProvider
    const byProvider = usageService.getByProvider(30);
    const subProvStats = byProvider.find((p) => p.provider_id === subProvider.id);
    const paygProvStats = byProvider.find((p) => p.provider_id === paygProvider.id);
    expect(subProvStats?.billing_type).toBe("subscription");
    expect(subProvStats?.estimated_cost_usd).toBe(0);
    expect(subProvStats?.tokens_subscription).toBe(1500);
    expect(paygProvStats?.billing_type).toBe("pay_as_you_go");
    expect(paygProvStats?.estimated_cost_usd).toBeCloseTo(0.0105, 5);
    expect(paygProvStats?.tokens_pay_as_you_go).toBe(1500);

    // Check byModel
    const byModel = usageService.getByModel(30);
    const subModelStats = byModel.find((m) => m.model_id === subModel.id);
    expect(subModelStats?.effective_billing_type).toBe("subscription");
    expect(subModelStats?.estimated_cost_usd).toBe(0);
    expect(subModelStats?.tokens_subscription).toBe(1500);
  });

  test("model-level billing_type override customizes individual models under a provider", () => {
    const provider = providerService.create({
      name: "Hybrid Platform",
      base_url: "https://api.hybrid.com",
      protocol: "openai",
      billing_type: "subscription",
    });

    // Model 1: inherits subscription
    const mInherit = modelService.create({
      provider_id: provider.id,
      model_id: "m-included",
      billing_type: "inherit",
    });
    expect(mInherit.effective_billing_type).toBe("subscription");

    // Model 2: overridden to pay_as_you_go with custom rate
    const mPayg = modelService.create({
      provider_id: provider.id,
      model_id: "m-paid-premium",
      billing_type: "pay_as_you_go",
      pricing_tiers: [
        {
          threshold_tokens: 0,
          input_per_million: 10,
          output_per_million: 30,
          cache_read_per_million: 0,
          cache_write_per_million: 0,
        },
      ],
    });
    expect(mPayg.billing_type).toBe("pay_as_you_go");
    expect(mPayg.effective_billing_type).toBe("pay_as_you_go");

    // Model 3: overridden to free
    const mFree = modelService.create({
      provider_id: provider.id,
      model_id: "m-free",
      billing_type: "free",
    });
    expect(mFree.billing_type).toBe("free");
    expect(mFree.effective_billing_type).toBe("free");

    // Record request on mPayg
    const logPayg = usageService.record(provider.id, mPayg.id, mPayg.model_id, 1000, 1000, 500);
    expect(logPayg.billing_type).toBe("pay_as_you_go");
    expect(logPayg.estimated_cost_usd).toBeCloseTo(0.04, 4);

    // Record request on mInherit
    const logSub = usageService.record(provider.id, mInherit.id, mInherit.model_id, 1000, 1000, 500);
    expect(logSub.billing_type).toBe("subscription");
    expect(logSub.estimated_cost_usd).toBe(0);
  });

  test("requestLogService assigns billing_type and prevents fake cost on subscription requests", () => {
    const provider = providerService.create({
      name: "Perch Custom",
      base_url: "https://api.perch.com",
      protocol: "perch",
    });
    const model = modelService.create({
      provider_id: provider.id,
      model_id: "gpt-4o",
      use_litellm_pricing: true,
    });

    const reqId = requestLogService.start({
      providerId: provider.id,
      providerName: provider.name,
      modelName: model.model_id,
    });

    const pendingLog = requestLogService.get(reqId);
    expect(pendingLog?.billing_type).toBe("subscription");

    requestLogService.complete(reqId, {
      promptTokens: 2000,
      completionTokens: 1000,
      durationMs: 800,
    });

    const logged = requestLogService.get(reqId);
    expect(logged?.billing_type).toBe("subscription");
    expect(logged?.estimated_cost_usd).toBe(0);

    // Test filtering by billing_type
    const filteredSub = requestLogService.list({ billing_type: "subscription" });
    expect(filteredSub.data.some((l) => l.id === reqId)).toBe(true);

    const filteredPayg = requestLogService.list({ billing_type: "pay_as_you_go" });
    expect(filteredPayg.data.some((l) => l.id === reqId)).toBe(false);
  });
});
