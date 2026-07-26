import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { models } from "../api/client";
import type { Model } from "../types";
import { useToast } from "./ui/toast";
import { PricingEditor } from "./AddModelModal";
import type { PricingTier } from "../types";

export default function EditModelModal({ isOpen, model, onClose, onSuccess }: { isOpen: boolean; model: Model | null; onClose: () => void; onSuccess: () => void }) {
  const { success, error: notifyError } = useToast();
  const [modelId, setModelId] = useState(""); const [displayName, setDisplayName] = useState(""); const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (model) { setModelId(model.model_id); setDisplayName(model.display_name ?? ""); setPricingTiers(model.pricing_tiers?.length ? model.pricing_tiers : [{ threshold_tokens: 0, input_per_million: 0, output_per_million: 0, cache_read_per_million: 0, cache_write_per_million: 0 }]); setError(null); } }, [model]);
  const updateTier = (index: number, field: keyof PricingTier, value: string) => setPricingTiers((tiers) => tiers.map((tier, i) => i === index ? { ...tier, [field]: Number(value) || 0 } : tier));
  const submit = async () => { if (!model || !modelId.trim()) return setError("Model ID is required."); setLoading(true); try { await models.update(model.id, { model_id: modelId.trim(), display_name: displayName || null, pricing_tiers: pricingTiers }); success("Model updated"); onSuccess(); onClose(); } catch (e: any) { setError(e.message); notifyError("Could not update model", e.message); } finally { setLoading(false); } };
  return <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}><DialogContent className="overflow-visible sm:max-w-3xl"><DialogHeader><DialogTitle>Edit model</DialogTitle><DialogDescription>Update the model identifier and pricing.</DialogDescription></DialogHeader><div className="min-w-0 max-h-[72vh] space-y-5 overflow-y-auto overflow-x-hidden pr-1"><div className="grid min-w-0 gap-4 sm:grid-cols-2"><div className="min-w-0 space-y-2"><Label htmlFor="edit-model-id">Model ID</Label><Input className="h-10 bg-muted/30 dark:bg-muted/30" id="edit-model-id" value={modelId} onChange={(e) => setModelId(e.target.value)} /></div><div className="min-w-0 space-y-2"><Label htmlFor="edit-model-display">Display name</Label><Input className="h-10 bg-muted/30 dark:bg-muted/30" id="edit-model-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div></div><PricingEditor tiers={pricingTiers} updateTier={updateTier} setTiers={setPricingTiers} />{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}</div><DialogFooter><Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button><Button onClick={submit} disabled={loading}>{loading ? "Saving..." : "Save changes"}</Button></DialogFooter></DialogContent></Dialog>;
}
