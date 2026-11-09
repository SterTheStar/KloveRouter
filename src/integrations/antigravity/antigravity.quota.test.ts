import { describe, expect, it } from "bun:test";
import { buildHubUserAgent } from "./antigravity.headers";
import {
  populateSyntheticArgonModels,
  type AntigravityQuotaGroup,
} from "./antigravity.client";

describe("Antigravity Quota & Usage Limits", () => {
  it("buildHubUserAgent generates expected format with aidev_client and hub identity", () => {
    const ua = buildHubUserAgent("2.26.0");
    expect(ua).toContain("antigravity/hub/2.26.0");
    expect(ua).toContain("(aidev_client; os_type=");
    expect(ua).toContain("arch=");
  });

  it("populateSyntheticArgonModels synthesizes gemini-4-argon-high when argon quota group exists", () => {
    const models: any[] = [
      {
        model_id: "gemini-2.5-flash",
        display_name: "Gemini 2.5 Flash",
        group_id: "gemini",
        remaining_fraction: 0.95,
        used_percent: 5,
        reset_at: "2026-11-09T18:00:00Z",
        reset_in: "6h 0m",
      },
    ];

    const quotaGroups: AntigravityQuotaGroup[] = [
      {
        id: "argon",
        group_name: "Gemini 4 Argon",
        description: "Weekly Argon limits",
        available: true,
        buckets: [
          {
            bucket_id: "gemini-4-argon-weekly",
            label: "Gemini 4 Argon Weekly",
            window: "weekly",
            remaining_fraction: 0.8,
            remaining_amount: null,
            used_percent: 20,
            disabled: false,
            unlimited: false,
            reset_at: "2026-11-15T00:00:00Z",
            reset_in: "5d 6h",
          },
        ],
      },
    ];

    populateSyntheticArgonModels(models, quotaGroups);

    const argonModel = models.find((m) => m.model_id === "gemini-4-argon-high");
    expect(argonModel).toBeDefined();
    expect(argonModel?.display_name).toBe("Gemini 4 Argon (High)");
    expect(argonModel?.group_id).toBe("argon");
    expect(argonModel?.remaining_fraction).toBe(0.8);
    expect(argonModel?.used_percent).toBe(20);
    expect(argonModel?.reset_at).toBe("2026-11-15T00:00:00Z");
  });

  it("populateSyntheticArgonModels does not duplicate if argon model already present", () => {
    const models: any[] = [
      {
        model_id: "gemini-4-argon",
        display_name: "Gemini 4 Argon",
        group_id: "argon",
        remaining_fraction: 1,
        used_percent: 0,
        reset_at: null,
        reset_in: null,
      },
    ];

    const quotaGroups: AntigravityQuotaGroup[] = [
      {
        id: "argon",
        group_name: "Gemini 4 Argon",
        description: null,
        available: true,
        buckets: [
          {
            bucket_id: "gemini-4-argon-weekly",
            label: "Gemini 4 Argon",
            window: "weekly",
            remaining_fraction: 0.5,
            remaining_amount: null,
            used_percent: 50,
            disabled: false,
            unlimited: false,
            reset_at: null,
            reset_in: null,
          },
        ],
      },
    ];

    populateSyntheticArgonModels(models, quotaGroups);
    expect(models.length).toBe(1);
    expect(models[0].model_id).toBe("gemini-4-argon");
  });
});
