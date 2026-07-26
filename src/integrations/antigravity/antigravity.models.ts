const BLOCKED_EXACT = new Set([
  "chat_20706",
  "chat_23310",
  "tab_flash_lite_preview",
  "tab_jump_flash_lite_preview",
  "tab_flash_lite_previewtab_jump_flash_lite_preview",
]);

export function isBlockedAntigravityModel(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase().replace(/^models\//, "");
  return BLOCKED_EXACT.has(normalized) || normalized.includes("gemini-3.6-flash-tiered");
}

export function filterAntigravityModels<T extends { id: string }>(models: T[]): T[] {
  return models.filter((model) => !isBlockedAntigravityModel(model.id));
}
