import type { ModelWithProvider, ReasoningEffort } from "../types";

const NONE_EFFORT: ReasoningEffort = {
  effort: "none",
  display_name: "None",
  upstream_value: "none",
  sort_order: -1,
  is_default: false,
};

/**
 * Reasoning options offered in the chat for a model: the configured effort
 * list plus a synthetic "None" entry that disables thinking whenever the
 * model is reasoning-capable (the backend strips the reasoning fields for
 * "none" when the provider has no disable switch, so it is always safe to
 * offer). Models with the "force" think-tag output fix are excluded: their
 * output contract expects a thinking block, and a disabled thinking stream
 * would have the whole answer re-classified as reasoning.
 */
export function effortOptions(model?: ModelWithProvider | null): ReasoningEffort[] {
  if (!model) return [];
  const configured = model.reasoning_efforts ?? [];
  if (model.capabilities?.reasoning === false) return configured;
  if (model.think_opening_tag_mode === "force") return configured;
  const hasNone = configured.some((item) => item.effort === "none");
  return hasNone ? configured : [NONE_EFFORT, ...configured];
}

/**
 * The default option to restore when no explicit choice is stored: the
 * configured default row, falling back to the first configured effort —
 * never the synthetic "None".
 */
export function defaultEffortOption(options: ReasoningEffort[]): ReasoningEffort | undefined {
  return options.find((option) => option.is_default) ?? options.find((option) => option.effort !== "none");
}
