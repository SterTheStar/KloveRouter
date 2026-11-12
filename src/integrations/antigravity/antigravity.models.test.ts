import { describe, expect, it } from "bun:test";
import {
  parseAntigravityModelEffort,
  cleanAntigravityDisplayName,
  groupAntigravityModels,
  resolveAntigravityUpstreamModel,
  isBlockedAntigravityModel,
} from "./antigravity.models";
import { resolveModelMetadata } from "../../services/model-metadata";

describe("Antigravity Models Consolidation & Reasoning Variations", () => {
  it("parseAntigravityModelEffort parses effort suffixes accurately", () => {
    expect(parseAntigravityModelEffort("claude-opus-5-5-high")).toEqual({
      baseId: "claude-opus-5-5",
      effort: "high",
      rawSuffix: "high",
      upstreamModel: "claude-opus-5-5-high",
    });

    expect(parseAntigravityModelEffort("claude-sonnet-5-5-low")).toEqual({
      baseId: "claude-sonnet-5-5",
      effort: "low",
      rawSuffix: "low",
      upstreamModel: "claude-sonnet-5-5-low",
    });

    expect(parseAntigravityModelEffort("gemini-3.8-flash-medium")).toEqual({
      baseId: "gemini-3.8-flash",
      effort: "medium",
      rawSuffix: "medium",
      upstreamModel: "gemini-3.8-flash-medium",
    });

    expect(parseAntigravityModelEffort("gemini-4-carbon-disabled")).toEqual({
      baseId: "gemini-4-carbon",
      effort: "none",
      rawSuffix: "disabled",
      upstreamModel: "gemini-4-carbon-disabled",
    });

    expect(parseAntigravityModelEffort("gpt-oss-120b-medium")).toEqual({
      baseId: "gpt-oss-120b",
      effort: "medium",
      rawSuffix: "medium",
      upstreamModel: "gpt-oss-120b-medium",
    });

    expect(parseAntigravityModelEffort("gemini-4-hydrogen-xhigh")).toEqual({
      baseId: "gemini-4-hydrogen",
      effort: "xhigh",
      rawSuffix: "xhigh",
      upstreamModel: "gemini-4-hydrogen-xhigh",
    });

    expect(parseAntigravityModelEffort("gemini-3-flash")).toBeNull();
    expect(parseAntigravityModelEffort("gemini-2.5-pro")).toBeNull();
    expect(parseAntigravityModelEffort("gemini-3.1-flash-lite")).toBeNull();
  });

  it("cleanAntigravityDisplayName strips effort suffixes and fixes anomalous Gemini 2.5 labels", () => {
    expect(cleanAntigravityDisplayName("Claude Opus 5.5 (High)")).toBe(
      "Claude Opus 5.5",
    );
    expect(cleanAntigravityDisplayName("Claude Sonnet 5.5 (Low)")).toBe(
      "Claude Sonnet 5.5",
    );
    expect(cleanAntigravityDisplayName("Gemini 3.8 Flash (Medium)")).toBe(
      "Gemini 3.8 Flash",
    );
    expect(cleanAntigravityDisplayName("Gemini 4 Argon (High)")).toBe(
      "Gemini 4 Argon",
    );
    expect(cleanAntigravityDisplayName("GPT-OSS 120B (Medium)")).toBe(
      "GPT-OSS 120B",
    );
    expect(cleanAntigravityDisplayName("Gemini 4 Hydrogen (XHigh)")).toBe(
      "Gemini 4 Hydrogen",
    );
    expect(cleanAntigravityDisplayName("Gemini 3 Flash")).toBe("Gemini 3 Flash");

    // Overrides for Gemini 2.5 mislabeled by upstream as "Gemini 3.5 Flash Lite"
    expect(
      cleanAntigravityDisplayName("Gemini 3.5 Flash Lite", "gemini-2.5-flash"),
    ).toBe("Gemini 2.5 Flash");
    expect(
      cleanAntigravityDisplayName("Gemini 3.5 Flash Lite", "gemini-2.5-flash-lite"),
    ).toBe("Gemini 2.5 Flash Lite");
    expect(
      cleanAntigravityDisplayName("Gemini 3.5 Flash Lite", "gemini-2.5-flash-thinking"),
    ).toBe("Gemini 2.5 Flash Thinking");
    // Normal 3.5 flash lite remains untouched
    expect(
      cleanAntigravityDisplayName("Gemini 3.5 Flash Lite", "gemini-3.5-flash-lite"),
    ).toBe("Gemini 3.5 Flash Lite");
  });

  it("groupAntigravityModels consolidates split effort models into base models with reasoning_efforts", () => {
    const rawList = [
      {
        id: "claude-opus-5-5-high",
        display_name: "Claude Opus 5.5 (High)",
      },
      {
        id: "claude-opus-5-5-low",
        display_name: "Claude Opus 5.5 (Low)",
      },
      {
        id: "claude-opus-5-5-medium",
        display_name: "Claude Opus 5.5 (Medium)",
      },
      {
        id: "claude-sonnet-5-5-high",
        display_name: "Claude Sonnet 5.5 (High)",
      },
      {
        id: "claude-sonnet-5-5-low",
        display_name: "Claude Sonnet 5.5 (Low)",
      },
      {
        id: "claude-sonnet-5-5-medium",
        display_name: "Claude Sonnet 5.5 (Medium)",
      },
      {
        id: "gemini-3.8-flash-high",
        display_name: "Gemini 3.8 Flash (High)",
      },
      {
        id: "gemini-3.8-flash-low",
        display_name: "Gemini 3.8 Flash (Low)",
      },
      {
        id: "gemini-3.8-flash-medium",
        display_name: "Gemini 3.8 Flash (Medium)",
      },
      {
        id: "gemini-4-argon-high",
        display_name: "Gemini 4 Argon (High)",
      },
      {
        id: "gemini-4-argon-low",
        display_name: "Gemini 4 Argon (Low)",
      },
      {
        id: "gemini-4-argon-medium",
        display_name: "Gemini 4 Argon (Medium)",
      },
      {
        id: "gemini-4-carbon-disabled",
        display_name: "Gemini 4 Carbon",
      },
      {
        id: "gpt-oss-120b-medium",
        display_name: "GPT-OSS 120B (Medium)",
      },
      {
        id: "gemini-3-flash",
        display_name: "Gemini 3 Flash",
      },
      {
        id: "gemini-2.5-pro",
        display_name: "Gemini 2.5 Pro",
      },
      {
        id: "gemini-2.5-flash",
        display_name: "Gemini 3.5 Flash Lite",
      },
      {
        id: "gemini-2.5-flash-lite",
        display_name: "Gemini 3.5 Flash Lite",
      },
      {
        id: "gemini-2.5-flash-thinking",
        display_name: "Gemini 3.5 Flash Lite",
      },
    ];

    const grouped = groupAntigravityModels(rawList);

    // Expect unifications (19 items consolidated down to 11 distinct models)
    expect(grouped.length).toBe(11);

    // Verify Claude Opus 5.5
    const opus = grouped.find((m) => m.id === "claude-opus-5-5");
    expect(opus).toBeDefined();
    expect(opus?.display_name).toBe("Claude Opus 5.5");
    expect(opus?.capabilities?.reasoning).toBe(true);
    expect(opus?.reasoning_efforts).toHaveLength(3);
    expect(opus?.reasoning_efforts?.map((e) => e.effort)).toEqual([
      "low",
      "medium",
      "high",
    ]);
    expect(opus?.reasoning_efforts?.find((e) => e.effort === "medium")?.is_default).toBe(
      true,
    );

    // Verify Claude Sonnet 5.5
    const sonnet = grouped.find((m) => m.id === "claude-sonnet-5-5");
    expect(sonnet).toBeDefined();
    expect(sonnet?.display_name).toBe("Claude Sonnet 5.5");
    expect(sonnet?.capabilities?.reasoning).toBe(true);
    expect(sonnet?.reasoning_efforts?.map((e) => e.effort)).toEqual([
      "low",
      "medium",
      "high",
    ]);

    // Verify Gemini 3.8 Flash
    const flash38 = grouped.find((m) => m.id === "gemini-3.8-flash");
    expect(flash38).toBeDefined();
    expect(flash38?.display_name).toBe("Gemini 3.8 Flash");
    expect(flash38?.capabilities?.reasoning).toBe(true);

    // Verify Gemini 4 Carbon
    const carbon = grouped.find((m) => m.id === "gemini-4-carbon");
    expect(carbon).toBeDefined();
    expect(carbon?.capabilities?.reasoning).toBe(false);

    // Verify GPT-OSS 120B
    const gptOss = grouped.find((m) => m.id === "gpt-oss-120b");
    expect(gptOss).toBeDefined();
    expect(gptOss?.display_name).toBe("GPT-OSS 120B");
    expect(gptOss?.reasoning_efforts).toEqual([
      {
        effort: "medium",
        display_name: "Medium",
        upstream_value: "medium",
        sort_order: 2,
        is_default: true,
      },
    ]);

    // Verify standalone models are preserved without changes
    const gemini3 = grouped.find((m) => m.id === "gemini-3-flash");
    expect(gemini3).toBeDefined();
    expect(gemini3?.display_name).toBe("Gemini 3 Flash");
    expect(gemini3?.reasoning_efforts).toBeUndefined();

    // Verify anomalous Gemini 2.5 Flash models are corrected
    const g25Flash = grouped.find((m) => m.id === "gemini-2.5-flash");
    expect(g25Flash?.display_name).toBe("Gemini 2.5 Flash");

    const g25Lite = grouped.find((m) => m.id === "gemini-2.5-flash-lite");
    expect(g25Lite?.display_name).toBe("Gemini 2.5 Flash Lite");

    const g25Thinking = grouped.find((m) => m.id === "gemini-2.5-flash-thinking");
    expect(g25Thinking?.display_name).toBe("Gemini 2.5 Flash Thinking");
  });

  it("resolveAntigravityUpstreamModel maps base models and efforts to upstream IDs", () => {
    // Claude Sonnet 5.5
    expect(resolveAntigravityUpstreamModel("claude-sonnet-5-5", "high")).toBe(
      "claude-sonnet-5-5-high",
    );
    expect(resolveAntigravityUpstreamModel("claude-sonnet-5-5", "low")).toBe(
      "claude-sonnet-5-5-low",
    );
    expect(resolveAntigravityUpstreamModel("claude-sonnet-5-5", "medium")).toBe(
      "claude-sonnet-5-5-medium",
    );
    expect(resolveAntigravityUpstreamModel("claude-sonnet-5-5")).toBe(
      "claude-sonnet-5-5-medium",
    );

    // Gemini 3.8 Flash
    expect(resolveAntigravityUpstreamModel("gemini-3.8-flash", "high")).toBe(
      "gemini-3.8-flash-high",
    );
    expect(resolveAntigravityUpstreamModel("gemini-3.8-flash", "low")).toBe(
      "gemini-3.8-flash-low",
    );
    expect(resolveAntigravityUpstreamModel("gemini-3.8-flash")).toBe(
      "gemini-3.8-flash-medium",
    );

    // Fixed-suffix models
    expect(resolveAntigravityUpstreamModel("gemini-4-carbon")).toBe(
      "gemini-4-carbon-disabled",
    );
    expect(resolveAntigravityUpstreamModel("gpt-oss-120b")).toBe(
      "gpt-oss-120b-medium",
    );

    // Models that already have upstream suffix are preserved
    expect(resolveAntigravityUpstreamModel("claude-sonnet-5-5-high")).toBe(
      "claude-sonnet-5-5-high",
    );
    expect(resolveAntigravityUpstreamModel("gemini-3.8-flash-low")).toBe(
      "gemini-3.8-flash-low",
    );

    // Gemini 4 Hydrogen
    expect(resolveAntigravityUpstreamModel("gemini-4-hydrogen", "low")).toBe(
      "gemini-4-hydrogen-low",
    );
    expect(resolveAntigravityUpstreamModel("gemini-4-hydrogen", "medium")).toBe(
      "gemini-4-hydrogen-medium",
    );
    expect(resolveAntigravityUpstreamModel("gemini-4-hydrogen", "high")).toBe(
      "gemini-4-hydrogen-high",
    );
    expect(resolveAntigravityUpstreamModel("gemini-4-hydrogen", "xhigh")).toBe(
      "gemini-4-hydrogen-xhigh",
    );
    expect(resolveAntigravityUpstreamModel("gemini-4-hydrogen", "max")).toBe(
      "gemini-4-hydrogen-xhigh",
    );
    expect(resolveAntigravityUpstreamModel("gemini-4-hydrogen")).toBe(
      "gemini-4-hydrogen-high",
    );
    expect(resolveAntigravityUpstreamModel("gemini-4-hydrogen-xhigh")).toBe(
      "gemini-4-hydrogen-xhigh",
    );

    // Standalone models
    expect(resolveAntigravityUpstreamModel("gemini-3-flash")).toBe(
      "gemini-3-flash",
    );
    expect(resolveAntigravityUpstreamModel("gemini-2.5-pro")).toBe(
      "gemini-2.5-pro",
    );
  });

  it("groupAntigravityModels integrates cleanly with resolveModelMetadata", async () => {
    const rawList = [
      {
        id: "claude-sonnet-5-5-high",
        display_name: "Claude Sonnet 5.5 (High)",
      },
      {
        id: "claude-sonnet-5-5-medium",
        display_name: "Claude Sonnet 5.5 (Medium)",
      },
      {
        id: "claude-sonnet-5-5-low",
        display_name: "Claude Sonnet 5.5 (Low)",
      },
    ];

    const grouped = groupAntigravityModels(rawList);
    expect(grouped).toHaveLength(1);
    const sonnet = grouped[0];

    const resolved = await resolveModelMetadata(
      "antigravity",
      sonnet.id,
      sonnet,
    );

    expect(resolved.capabilities?.reasoning).toBe(true);
    expect(resolved.reasoning_efforts).toBeDefined();
    expect(resolved.reasoning_efforts).toHaveLength(3);
    expect(
      resolved.reasoning_efforts?.find((e) => e.effort === "medium")?.is_default,
    ).toBe(true);
  });

  it("groupAntigravityModels consolidates Gemini 4 Hydrogen variants with all efforts and high as default", async () => {
    // Case 1: Separate effort variants
    const rawVariants = [
      { id: "gemini-4-hydrogen-high", display_name: "Gemini 4 Hydrogen (High)" },
      { id: "gemini-4-hydrogen-low", display_name: "Gemini 4 Hydrogen (Low)" },
      { id: "gemini-4-hydrogen-medium", display_name: "Gemini 4 Hydrogen (Medium)" },
      { id: "gemini-4-hydrogen-xhigh", display_name: "Gemini 4 Hydrogen (XHigh)" },
    ];

    const grouped1 = groupAntigravityModels(rawVariants);
    expect(grouped1).toHaveLength(1);
    const hydrogen1 = grouped1[0];
    expect(hydrogen1.id).toBe("gemini-4-hydrogen");
    expect(hydrogen1.display_name).toBe("Gemini 4 Hydrogen");
    expect(hydrogen1.capabilities?.reasoning).toBe(true);
    expect(hydrogen1.default_reasoning_effort).toBe("high");
    expect(hydrogen1.reasoning_efforts).toHaveLength(4);
    expect(hydrogen1.reasoning_efforts?.map((e) => e.effort)).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    expect(hydrogen1.reasoning_efforts?.find((e) => e.effort === "high")?.is_default).toBe(true);
    expect(hydrogen1.reasoning_efforts?.find((e) => e.effort === "xhigh")?.display_name).toBe("XHigh");

    // Case 2: Base model and XHigh variant appearing together
    const rawMixed = [
      { id: "gemini-4-hydrogen", display_name: "Gemini 4 Hydrogen" },
      { id: "gemini-4-hydrogen-xhigh", display_name: "Gemini 4 Hydrogen (XHigh)" },
    ];

    const grouped2 = groupAntigravityModels(rawMixed);
    expect(grouped2).toHaveLength(1);
    const hydrogen2 = grouped2[0];
    expect(hydrogen2.id).toBe("gemini-4-hydrogen");
    expect(hydrogen2.display_name).toBe("Gemini 4 Hydrogen");
    expect(hydrogen2.capabilities?.reasoning).toBe(true);
    expect(hydrogen2.reasoning_efforts).toHaveLength(4);
    expect(hydrogen2.reasoning_efforts?.map((e) => e.effort)).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    expect(hydrogen2.reasoning_efforts?.find((e) => e.effort === "high")?.is_default).toBe(true);

    // Metadata resolution
    const resolved = await resolveModelMetadata("antigravity", hydrogen2.id, hydrogen2);
    expect(resolved.capabilities?.reasoning).toBe(true);
    expect(resolved.reasoning_efforts).toHaveLength(4);
    expect(resolved.reasoning_efforts?.find((e) => e.effort === "high")?.is_default).toBe(true);
    expect(resolved.reasoning_efforts?.find((e) => e.effort === "xhigh")?.display_name).toBe("XHigh");
  });
});
