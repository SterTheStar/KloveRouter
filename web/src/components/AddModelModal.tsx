import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { models } from "../api/client";
import { useToast } from "./ui/toast";

export default function AddModelModal({ isOpen, onClose, onSuccess, providerId }: { isOpen: boolean; onClose: () => void; onSuccess: () => void; providerId: string }) {
  const { success, error: notifyError } = useToast();
  const [modelId, setModelId] = useState(""); const [displayName, setDisplayName] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const close = () => { if (loading) return; setModelId(""); setDisplayName(""); setError(null); onClose(); };
  const submit = async () => { if (!modelId) return setError("Model ID is required."); setLoading(true); try { await models.create(providerId, { model_id: modelId, display_name: displayName || undefined }); success("Model added"); onSuccess(); close(); } catch (e: any) { setError(e.message); notifyError("Could not add model", e.message); } finally { setLoading(false); } };
  return <Dialog open={isOpen} onOpenChange={(open) => !open && close()}><DialogContent><DialogHeader><DialogTitle>Add model</DialogTitle><DialogDescription>Add a model manually to this provider.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="model-id">Model ID</Label><Input id="model-id" value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="gpt-4o" /></div><div className="space-y-2"><Label htmlFor="model-display">Display name</Label><Input id="model-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="GPT-4o" /></div>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}</div><DialogFooter><Button variant="outline" onClick={close} disabled={loading}>Cancel</Button><Button onClick={submit} disabled={loading}>{loading ? "Saving..." : "Save model"}</Button></DialogFooter></DialogContent></Dialog>;
}
