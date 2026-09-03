import type { ModelWithProvider, ReasoningEffort } from "../types";

/**
 * Reasoning options offered in the chat for a model: exactly what is
 * configured for it. No synthetic entries — a model without a configured
 * list shows no picker instead of a "None" option that providers without
 * a disable switch cannot honor (models that think by default keep
 * thinking regardless).
 */
export function effortOptions(model?: ModelWithProvider | null): ReasoningEffort[] {
  return model?.reasoning_efforts ?? [];
}

/** The default option to restore when no explicit choice is stored. */
export function defaultEffortOption(options: ReasoningEffort[]): ReasoningEffort | undefined {
  return options.find((option) => option.is_default) ?? options[0];
}
