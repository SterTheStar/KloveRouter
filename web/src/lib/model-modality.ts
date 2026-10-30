import type { ModelCapabilities } from "../types";

// Klove only exposes text chat models. Media categories are intentionally not
// produced here so the UI never offers image, speech, or video surfaces.
export type ModelCategory = "chat";
export type CategorizedModel = {
  model_id?: string;
  id?: string;
  display_name?: string | null;
  capabilities?: Partial<ModelCapabilities>;
};

const categoryInfo: Record<ModelCategory, { label: string; shortLabel: string }> = {
  chat: { label: "Chat", shortLabel: "Chat" },
};

export function modelCategories(_model: CategorizedModel): ModelCategory[] {
  return ["chat"];
}

export function modelCategoryLabel(category: ModelCategory) {
  return categoryInfo[category].label;
}

export function modelCategoryBadge(category: ModelCategory) {
  return categoryInfo[category].shortLabel;
}
