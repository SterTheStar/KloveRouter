/**
 * Helper to identify free models and free tiers across protocols and catalogs.
 */

export function isFreeModel(model: { id?: string; model_id?: string; is_free?: boolean }): boolean {
  if (model.is_free === true) return true;
  const id = (model.model_id || model.id || "").trim();
  if (!id) return false;
  return /(?:^|[:/_.-])free(?:$|[:/_.-]|\b)/i.test(id);
}
