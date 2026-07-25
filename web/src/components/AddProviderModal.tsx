import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import AvatarUpload from "./AvatarUpload";
import { providers } from "../api/client";

export default function AddProviderModal({ isOpen, onClose, onSuccess }: { isOpen: boolean; onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState(""); const [baseUrl, setBaseUrl] = useState(""); const [apiKey, setApiKey] = useState(""); const [avatar, setAvatar] = useState<string | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const close = () => { if (loading) return; setName(""); setBaseUrl(""); setApiKey(""); setAvatar(null); setError(null); onClose(); };
  const submit = async () => { if (!name || !baseUrl || !apiKey) return setError("All fields are required."); setLoading(true); setError(null); try { await providers.create({ name, base_url: baseUrl, api_key: apiKey, avatar: avatar || undefined }); onSuccess(); close(); } catch (e: any) { setError(e.message); } finally { setLoading(false); } };
  return <Dialog open={isOpen} onOpenChange={(open) => !open && close()}><DialogContent><DialogHeader><DialogTitle>Add provider</DialogTitle><DialogDescription>Connect an OpenAI-compatible provider.</DialogDescription></DialogHeader><div className="space-y-4"><AvatarUpload value={avatar} name={name} onChange={setAvatar} /><div className="space-y-2"><Label htmlFor="provider-name">Provider name</Label><Input id="provider-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="openai" /></div><div className="space-y-2"><Label htmlFor="provider-url">Base URL</Label><Input id="provider-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" /></div><div className="space-y-2"><Label htmlFor="provider-key">API key</Label><Input id="provider-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." /></div>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}</div><DialogFooter><Button variant="outline" onClick={close} disabled={loading}>Cancel</Button><Button onClick={submit} disabled={loading}>{loading ? "Saving..." : "Save provider"}</Button></DialogFooter></DialogContent></Dialog>;
}
