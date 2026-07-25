import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { models } from "../api/client";
import type { Model } from "../types";

export default function EditModelModal({ isOpen, model, onClose, onSuccess }: { isOpen: boolean; model: Model | null; onClose: () => void; onSuccess: () => void }) {
  const [modelId, setModelId] = useState(""); const [displayName, setDisplayName] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (model) { setModelId(model.model_id); setDisplayName(model.display_name ?? ""); setError(null); } }, [model]);
  const submit = async () => { if (!model || !modelId.trim()) return setError("Model ID is required."); setLoading(true); try { await models.update(model.id, { model_id: modelId.trim(), display_name: displayName || null }); onSuccess(); onClose(); } catch (e: any) { setError(e.message); } finally { setLoading(false); } };
  return <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>Edit model</DialogTitle><DialogDescription>Update the model identifier and display name.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="edit-model-id">Model ID</Label><Input id="edit-model-id" value={modelId} onChange={(e) => setModelId(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="edit-model-display">Display name</Label><Input id="edit-model-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}</div><DialogFooter><Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button><Button onClick={submit} disabled={loading}>{loading ? "Saving..." : "Save changes"}</Button></DialogFooter></DialogContent></Dialog>;
}
