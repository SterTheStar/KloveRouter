import { useCallback, useEffect, useState } from "react";
import { RiFileCopyLine as Copy, RiKey2Line as KeyRound, RiLoader4Line as LoaderCircle, RiAddLine as Plus, RiDeleteBinLine as Trash2, RiEyeLine as Eye, RiEyeOffLine as EyeOff } from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiKeys } from "../api/client";
import ConfirmDialog from "../components/ConfirmDialog";
import { useToast } from "../components/ui/toast";
import type { ApiKey, ApiKeyWithSecret } from "../types";

export default function ApiKeysPage() {
  const { success, error: notifyError } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [secret, setSecret] = useState<ApiKeyWithSecret | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ApiKey | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [loadingSecret, setLoadingSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setLoading(true); setKeys(await apiKeys.list()); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const generated = await apiKeys.create(name.trim());
      setSecret(generated);
      setName("");
      setCreateOpen(false);
      await load();
      success("API key generated", "You can reveal or copy it later from the API keys page.");
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not generate API key", e.message);
    } finally { setSaving(false); }
  };

  const copy = async (value: string) => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard access is unavailable.");
      await navigator.clipboard.writeText(value);
      success("Copied to clipboard");
    } catch (e: any) { notifyError("Could not copy", e.message); }
  };

  const copyKey = async (key: ApiKey) => {
    const existing = revealed[key.id];
    if (existing !== undefined) {
      await copy(existing);
      return;
    }
    setLoadingSecret(key.id);
    try {
      const result = await apiKeys.secret(key.id);
      setRevealed((items) => ({ ...items, [key.id]: result.secret }));
      await copy(result.secret);
    } catch (e: any) { notifyError("Could not copy API key", e.message); }
    finally { setLoadingSecret(null); }
  };

  const remove = async () => {
    if (!removeTarget) return;
    try {
      await apiKeys.remove(removeTarget.id);
      setKeys((items) => items.filter((item) => item.id !== removeTarget.id));
      setRemoveTarget(null);
      success("API key revoked");
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not revoke API key", e.message);
    }
  };

  const toggleVisibility = async (key: ApiKey) => {
    if (revealed[key.id] !== undefined) {
      setRevealed((items) => { const next = { ...items }; delete next[key.id]; return next; });
      return;
    }
    setLoadingSecret(key.id);
    try {
      const result = await apiKeys.secret(key.id);
      setRevealed((items) => ({ ...items, [key.id]: result.secret }));
    } catch (e: any) { notifyError("Could not reveal API key", e.message); }
    finally { setLoadingSecret(null); }
  };

  if (loading) return <div className="flex justify-center p-12"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>;

  return <div className="w-full space-y-6 p-6">
    <div className="flex items-center justify-between gap-4"><h1 className="font-heading text-2xl font-semibold tracking-tight">API keys</h1><Button onClick={() => setCreateOpen(true)}><Plus className="size-4" />Generate key</Button></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {keys.length === 0 ? <div className="rounded-xl border border-dashed p-12 text-center"><KeyRound className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-3 font-heading text-lg font-medium">No API keys</h2><p className="mt-1 text-sm text-muted-foreground">Generate a key to use the Klove proxy.</p><Button className="mt-5" onClick={() => setCreateOpen(true)}>Generate your first key</Button></div> : <Card className="overflow-hidden p-0 gap-0"><CardHeader className="flex flex-row items-center justify-between py-(--card-spacing)"><CardTitle>Active keys ({keys.length})</CardTitle></CardHeader><Separator /><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>API key</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="w-28">Actions</TableHead></TableRow></TableHeader><TableBody>{keys.map((key) => { const value = revealed[key.id]; return <TableRow key={key.id}><TableCell className="font-medium">{key.name}</TableCell><TableCell><div className="relative max-w-sm"><Input value={value ?? key.prefix} readOnly className="h-8 pr-20 font-mono text-xs" /><div className="absolute right-0 top-0 flex"><Button variant="ghost" size="icon" className="size-8" onClick={() => toggleVisibility(key)} disabled={loadingSecret === key.id} title={value === undefined ? "Reveal API key" : "Hide API key"}>{value === undefined ? <Eye className="size-4" /> : <EyeOff className="size-4" />}</Button><Button variant="ghost" size="icon" className="size-8" onClick={() => copyKey(key)} disabled={loadingSecret === key.id} title="Copy API key"><Copy className="size-4" /></Button></div></div></TableCell><TableCell><Badge variant={key.is_active ? "secondary" : "outline"}>{key.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell className="text-sm text-muted-foreground">{new Date(key.created_at).toLocaleDateString()}</TableCell><TableCell><Tooltip><TooltipTrigger render={<Button size="icon" variant="ghost" className="text-destructive" onClick={() => setRemoveTarget(key)} />}><Trash2 className="size-4" /></TooltipTrigger><TooltipContent>Revoke key</TooltipContent></Tooltip></TableCell></TableRow>; })}</TableBody></Table></Card>}

    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Generate API key</DialogTitle><DialogDescription>Give this key a name so you can identify it later.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="api-key-name">Name</Label><Input id="api-key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My application" onKeyDown={(e) => e.key === "Enter" && create()} /></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button><Button onClick={create} disabled={saving || !name.trim()}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}Generate</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={secret !== null} onOpenChange={(open) => !open && setSecret(null)}><DialogContent><DialogHeader><DialogTitle>API key generated</DialogTitle><DialogDescription>Copy it now or manage this key later from the API keys page.</DialogDescription></DialogHeader>{secret && <div className="space-y-2"><Label htmlFor="generated-api-key">API key</Label><div className="flex gap-2"><Input id="generated-api-key" value={secret.raw_key} readOnly className="font-mono" /><Button variant="outline" size="icon" onClick={() => copy(secret.raw_key)} title="Copy API key"><Copy className="size-4" /></Button></div><p className="text-xs text-muted-foreground">{secret.warning}</p></div>}<DialogFooter><Button onClick={() => setSecret(null)}>Done</Button></DialogFooter></DialogContent></Dialog>
    <ConfirmDialog open={!!removeTarget} title="Revoke API key" message={`Revoke ${removeTarget?.name}?`} confirmLabel="Revoke" onConfirm={remove} onCancel={() => setRemoveTarget(null)} />
  </div>;
}
