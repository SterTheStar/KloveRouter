import type { ModelPoolStrategy } from "../../types";

export type CompoundModelDraft = {
  id?: string;
  name: string;
  slug: string;
  strategy: ModelPoolStrategy;
  hide_members: boolean;
  is_active: boolean;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
  members: Array<{ id: string; fallback: boolean }>;
};

export const emptyCompoundModelDraft = (): CompoundModelDraft => ({
  name: "",
  slug: "",
  strategy: "priority",
  hide_members: false,
  is_active: true,
  max_input_tokens: null,
  max_output_tokens: null,
  members: [],
});
