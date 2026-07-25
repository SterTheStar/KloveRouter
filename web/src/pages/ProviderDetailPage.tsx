import { useCallback, useEffect, useMemo, useState } from "react";
import { RiArrowLeftLine as ArrowLeft, RiCheckLine as Check, RiCloseLine as CloseLine, RiFileCopyLine as Copy, RiLoader4Line as LoaderCircle, RiLoginBoxLine as LoginIcon, RiLogoutBoxLine as LogoutIcon, RiPencilLine as Pencil, RiRefreshLine as RefreshCw, RiDeleteBinLine as Trash2, RiSearchLine as Search, RiPlayCircleLine as PlayCircleLine } from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import AvatarUpload from "../components/AvatarUpload";
import AddModelModal from "../components/AddModelModal";
import EditModelModal from "../components/EditModelModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { codex, providers, models as modelsApi } from "../api/client";
import type { Model, Provider } from "../types";

export default function ProviderDetailPage({ providerId, onBack }: { providerId: string; onBack: () => void }) {
  const [provider, setProvider] = useState<Provider | null>(null);
  const [list, setList] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Model | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Model | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, "success" | "error">>({});

  const filteredList = useMemo(() => {
    let result = list;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((m) => m.model_id.toLowerCase().includes(q) || (m.display_name?.toLowerCase().includes(q) ?? false));
    }
    if (freeOnly) {
      result = result.filter((m) => m.model_id.toLowerCase().includes("free") || (m.display_name?.toLowerCase().includes("free") ?? false));
    }
    return result;
  }, [list, searchQuery, freeOnly]);
  const [clearOpen, setClearOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connectedAccount, setConnectedAccount] = useState<string | null>(null);
  const [authAction, setAuthAction] = useState<"login" | "logout" | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [current, models] = await Promise.all([providers.get(providerId), modelsApi.listByProvider(providerId)]);
      const account = current.protocol === "codex" ? await codex.status() : null;
      setProvider(current); setList(models); setName(current.name); setBaseUrl(current.base_url); setAvatar(current.avatar); setApiKey("");
      setConnectedAccount(account?.account_id ?? null);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [providerId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try { const updated = await providers.update(providerId, { name, base_url: baseUrl, avatar, ...(apiKey ? { api_key: apiKey } : {}) }); setProvider(updated); setApiKey(""); setSuccess("Provider updated."); }
    catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const sync = async () => {
    setSyncing(true);
    try { const result = await modelsApi.sync(providerId); await load(); setSuccess(result.message); }
    catch (e: any) { setError(e.message); } finally { setSyncing(false); }
  };

  const logoutCodex = async () => {
    setAuthAction("logout"); setError(null);
    try {
      await codex.logout();
      setConnectedAccount(null);
      setSuccess("Codex account disconnected. The provider was kept.");
    } catch (e: any) { setError(e.message); } finally { setAuthAction(null); }
  };

  const reauthCodex = async () => {
    setAuthAction("login"); setError(null);
    try {
      const result = await codex.login();
      window.open(result.auth_url, "klove-codex-login", "popup,width=520,height=720");
      const started = Date.now();
      const poll = window.setInterval(async () => {
        try {
          const status = await codex.status();
          if (status.authenticated) {
            window.clearInterval(poll);
            setConnectedAccount(status.account_id);
            setSuccess("Codex account connected.");
            setAuthAction(null);
          } else if (Date.now() - started > 5 * 60_000) {
            window.clearInterval(poll);
            setAuthAction(null);
            setError("Codex login timed out.");
          }
        } catch { /* keep polling during browser login */ }
      }, 1500);
    } catch (e: any) { setError(e.message); setAuthAction(null); }
  };

  const copy = (value: string) => navigator.clipboard?.writeText(value);
  const testModel = async (id: string) => {
    setTestingId(id);
    try {
      const result = await modelsApi.test(id);
      setTestResult((prev) => ({ ...prev, [id]: result.success ? "success" : "error" }));
    } catch {
      setTestResult((prev) => ({ ...prev, [id]: "error" }));
    }
    setTestingId(null);
  };

  if (loading) return <div className="flex justify-center p-12"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>;
  if (!provider) return <div className="p-6"><Alert variant="destructive"><AlertDescription>Provider not found.</AlertDescription></Alert></div>;

  return (
    <div className="w-full space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="size-4" />Back</Button>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Provider configuration</h1>
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {success && <Alert><Check className="size-4" /><AlertDescription>{success}</AlertDescription></Alert>}

      <Card>
         <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Connection settings</CardTitle><div className="flex flex-wrap justify-end gap-2">{provider.protocol === "codex" && (connectedAccount ? <><Button variant="outline" onClick={reauthCodex} disabled={authAction !== null}>{authAction === "login" ? <LoaderCircle className="size-4 animate-spin" /> : <LoginIcon className="size-4" />}Re-authenticate</Button><Button variant="outline" onClick={logoutCodex} disabled={authAction !== null}>{authAction === "logout" ? <LoaderCircle className="size-4 animate-spin" /> : <LogoutIcon className="size-4" />}Log out</Button></> : <Button variant="outline" onClick={reauthCodex} disabled={authAction !== null}>{authAction === "login" ? <LoaderCircle className="size-4 animate-spin" /> : <LoginIcon className="size-4" />}Connect account</Button>)}<Button variant="outline" onClick={sync} disabled={syncing}>{syncing ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Sync models</Button><Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button></div></CardHeader>
        <CardContent className="space-y-5">
          <AvatarUpload value={avatar} name={name} onChange={setAvatar} />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="provider-name">Provider name</Label><Input id="provider-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="provider-url">Base URL</Label><Input id="provider-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></div>
          </div>
           {provider.protocol === "codex" ? (
             <div className="space-y-2">
               <Label>Connected account</Label>
               <div className="flex min-h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
                 {connectedAccount ?? "No Codex account connected"}
               </div>
             </div>
           ) : (
             <div className="space-y-2"><Label htmlFor="provider-key">API key</Label><Input id="provider-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Leave blank to keep current key" /></div>
           )}
        </CardContent>
      </Card>

      <Card variant="plain" className="overflow-hidden p-0 gap-0">
        <CardHeader className="flex flex-row items-center justify-between py-(--card-spacing)"><CardTitle>Models <span className="text-muted-foreground">({list.length})</span></CardTitle><div className="flex items-center gap-2"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search..." className="h-8 w-48 border-none bg-muted pl-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div><Button variant={freeOnly ? "default" : "secondary"} size="sm" onClick={() => setFreeOnly(!freeOnly)}>Free</Button>{list.length > 0 && <Button variant="destructive" size="sm" onClick={() => setClearOpen(true)}>Delete all</Button>}<Button variant="default" size="sm" onClick={() => setAddOpen(true)}>Add model</Button></div></CardHeader>
        <Separator />
        {filteredList.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">{list.length === 0 ? "No models found. Sync the provider or add one manually." : "No models match your search."}</div> : <Table><TableHeader><TableRow><TableHead>Model ID</TableHead><TableHead>Display name</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead className="w-28">Actions</TableHead></TableRow></TableHeader><TableBody>{filteredList.map((model) => <TableRow key={model.id}><TableCell><div className="group flex items-center gap-1 font-mono text-xs"><span>{provider.name}/{model.model_id}</span><Tooltip><TooltipTrigger render={<Button size="icon" variant="ghost" className="size-6 opacity-0 group-hover:opacity-100" onClick={() => copy(`${provider.name}/${model.model_id}`)} />}><Copy className="size-3" /></TooltipTrigger><TooltipContent>Copy model ID</TooltipContent></Tooltip></div></TableCell><TableCell>{model.display_name || <span className="text-muted-foreground">—</span>}</TableCell><TableCell><Badge variant={model.is_manual ? "outline" : "secondary"}>{model.is_manual ? "Manual" : "Auto-synced"}</Badge></TableCell><TableCell><Switch checked={model.is_active === 1} onCheckedChange={async () => { const updated = await modelsApi.toggle(model.id); setList((items) => items.map((item) => item.id === model.id ? { ...item, is_active: updated.is_active } : item)); }} /></TableCell><TableCell><div className="flex justify-center gap-1">{testResult[model.id] === "success" ? <span className="flex size-7 items-center justify-center"><Check className="block size-5 text-green-500" /></span> : testResult[model.id] === "error" ? <span className="flex size-7 items-center justify-center"><CloseLine className="block size-5 text-destructive" /></span> : <Tooltip><TooltipTrigger render={<Button size="icon" variant="ghost" className="size-7" onClick={() => testModel(model.id)} disabled={testingId === model.id} />}>{testingId === model.id ? <LoaderCircle className="size-5 animate-spin" /> : <PlayCircleLine className="size-5" />}</TooltipTrigger><TooltipContent>Test</TooltipContent></Tooltip>}<Tooltip><TooltipTrigger render={<Button size="icon" variant="ghost" className="size-7" onClick={() => setEditTarget(model)} />}><Pencil className="size-5" /></TooltipTrigger><TooltipContent>Edit</TooltipContent></Tooltip><Tooltip><TooltipTrigger render={<Button size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => setDeleteTarget(model)} />}><Trash2 className="size-5" /></TooltipTrigger><TooltipContent>Delete</TooltipContent></Tooltip></div></TableCell></TableRow>)}</TableBody></Table>}
      </Card>
      <AddModelModal isOpen={addOpen} onClose={() => setAddOpen(false)} onSuccess={load} providerId={providerId} />
      <EditModelModal isOpen={!!editTarget} model={editTarget} onClose={() => setEditTarget(null)} onSuccess={load} />
      <ConfirmDialog open={!!deleteTarget} title="Delete model" message={`Remove ${deleteTarget?.model_id}?`} confirmLabel="Delete" onConfirm={async () => { if (!deleteTarget) return; await modelsApi.remove(deleteTarget.id); setList((items) => items.filter((item) => item.id !== deleteTarget.id)); setDeleteTarget(null); }} onCancel={() => setDeleteTarget(null)} />
      <ConfirmDialog open={clearOpen} title="Delete all models" message={`Remove all ${list.length} models from ${provider.name}?`} confirmLabel="Delete all" onConfirm={async () => { await modelsApi.deleteAll(providerId); setList([]); setClearOpen(false); }} onCancel={() => setClearOpen(false)} />
    </div>
  );
}
