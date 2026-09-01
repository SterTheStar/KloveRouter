import { describe, expect, test } from "bun:test";
import type { Model } from "./model.service";
import {
  normalizeReasoningEffort,
  parseReasoningEffort,
  resolveReasoningEffort,
} from "./reasoning";

const model = {
  model_id: "test-model",
  capabilities: { reasoning: true },
  reasoning_efforts: [
    {
      effort: "none",
      display_name: "None",
      upstream_value: "disabled",
      sort_order: 0,
      is_default: false,
    },
    {
      effort: "medium",
      display_name: "Medium",
      upstream_value: "normal-upstream",
      sort_order: 1,
      is_default: true,
    },
    {
      effort: "xhigh",
      display_name: "Extra high",
      upstream_value: "maximum-upstream",
      sort_order: 2,
      is_default: false,
    },
  ],
} as Model;

describe("reasoning effort", () => {
  test("normalizes aliases case-insensitively", () => {
    expect(normalizeReasoningEffort("OFF")).toBe("none");
    expect(normalizeReasoningEffort(false)).toBe("none");
    expect(normalizeReasoningEffort("Min")).toBe("minimal");
    expect(normalizeReasoningEffort("DEFAULT")).toBe("default");
    expect(normalizeReasoningEffort("max")).toBe("xhigh");
  });

  test("accepts equivalent fields and rejects conflicts", () => {
    expect(
      parseReasoningEffort({ reasoning: { effort: "normal" }, effort: "MEDIUM" }),
    ).toEqual({ explicit: true, effort: "medium" });
    expect(() =>
      parseReasoningEffort({ reasoning_effort: "low", effort: "high" }),
    ).toThrow("Conflicting reasoning efforts");
    expect(() => parseReasoningEffort({ effort: null })).toThrow(
      "must be a string",
    );
  });

  test("applies default and persisted upstream values", () => {
    expect(resolveReasoningEffort({}, model).upstreamValue).toBe(
      "normal-upstream",
    );
    expect(resolveReasoningEffort({ effort: "max" }, model).upstreamValue).toBe(
      "maximum-upstream",
    );
  });

  test("rejects unsupported and non-reasoning requests", () => {
    expect(() => resolveReasoningEffort({ effort: "low" }, model)).toThrow(
      "not configured",
    );
    expect(() =>
      resolveReasoningEffort(
        { effort: "medium" },
        { ...model, capabilities: { ...model.capabilities, reasoning: false } },
      ),
    ).toThrow("does not support reasoning");
  });

  test("passes normalized explicit effort through without a configured list", () => {
    expect(
      resolveReasoningEffort(
        { reasoning_effort: "MAX" },
        { ...model, capabilities: { ...model.capabilities, reasoning: null }, reasoning_efforts: [] },
      ),
    ).toEqual({ explicit: true, effort: "xhigh", upstreamValue: "xhigh" });
  });

  test("resolves the default alias to the model's default line", () => {
    const lowDefaultModel = {
      ...model,
      reasoning_efforts: [
        { effort: "low", display_name: "Low", upstream_value: "low-upstream", sort_order: 0, is_default: true },
        { effort: "high", display_name: "High", upstream_value: "high-upstream", sort_order: 1, is_default: false },
      ],
    } as Model;
    expect(resolveReasoningEffort({ effort: "default" }, lowDefaultModel)).toEqual({
      explicit: true,
      effort: "low",
      upstreamValue: "low-upstream",
    });
  });

  test("maps the default alias to medium without a configured list", () => {
    expect(
      resolveReasoningEffort(
        { effort: "default" },
        { ...model, capabilities: { ...model.capabilities, reasoning: null }, reasoning_efforts: [] },
      ),
    ).toEqual({ explicit: true, effort: "medium", upstreamValue: "medium" });
  });
});
