import { useEffect, useState } from "react";
import {
  RiAddLine as AddLine,
  RiDeleteBinLine as DeleteLine,
  RiGitMergeLine as MergeLine,
  RiLoader4Line as LoaderLine,
  RiPencilLine as EditLine,
  RiPlayCircleLine as PlayLine,
  RiRefreshLine as RefreshLine,
} from "@remixicon/react";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Switch } from "../components/ui/switch";
import { modelPools, models as modelsApi } from "../api/client";
import type { ModelPool, ModelWithProvider } from "../types";
import { useToast } from "../components/ui/toast";
import ProviderIcon from "../components/ProviderIcon";
import { CompoundModelEditor } from "../components/model-pools/CompoundModelEditor";
import { emptyCompoundModelDraft, type CompoundModelDraft } from "../components/model-pools/types";
import { invalidateModelPools } from "../lib/query-cache";

export default function ModelPoolsPage() {
  const { success, error: notifyError } = useToast();
  const [pools, setPools] = useState<ModelPool[]>([]);
  const [models, setModels] = useState<ModelWithProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; duration_ms: number; error?: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CompoundModelDraft | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextPools, nextModels] = await Promise.all([modelPools.list(), modelPools.models()]);
      setPools(nextPools);
      setModels(nextModels);
    } catch (cause: any) {
      setError(cause?.message ?? "Could not load compound models");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const closeEditor = () => {
    setDraft(null);
  };
  const beginCreate = () => {
    setDraft(emptyCompoundModelDraft());
  };
  const beginEdit = (pool: ModelPool) => {
    setDraft({
      id: pool.id,
      name: pool.name,
      slug: pool.slug,
      strategy: pool.strategy,
      hide_members: pool.hide_members,
      is_active: pool.is_active,
      max_input_tokens: pool.max_input_tokens,
      max_output_tokens: pool.max_output_tokens,
      members: pool.members.map((member) => ({ id: member.id, fallback: member.fallback })),
    });
  };
  const updateDraft = (update: (current: CompoundModelDraft) => CompoundModelDraft) => setDraft((current) => current ? update(current) : current);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        slug: draft.slug.trim().toLowerCase(),
        strategy: draft.strategy,
        hide_members: draft.hide_members,
        is_active: draft.is_active,
        max_input_tokens: draft.max_input_tokens,
        max_output_tokens: draft.max_output_tokens,
        members: draft.members.map((member, priority) => ({ model_id: member.id, priority, fallback: member.fallback })),
      };
      if (draft.id) await modelPools.update(draft.id, payload);
      else await modelPools.create(payload);
      invalidateModelPools();
      success(draft.id ? "Compound model updated" : "Compound model created", `Public ID: pool/${payload.slug}`);
      closeEditor();
      await reload();
    } catch (cause: any) {
      notifyError("Could not save compound model", cause?.message ?? "Check the settings and try again.");
    } finally {
      setSaving(false);
    }
  };

  const setEnabled = async (pool: ModelPool, enabled: boolean) => {
    setToggling(pool.id);
    try {
      await modelPools.update(pool.id, {
        name: pool.name,
        slug: pool.slug,
        strategy: pool.strategy,
        hide_members: pool.hide_members,
        is_active: enabled,
        max_input_tokens: pool.max_input_tokens,
        max_output_tokens: pool.max_output_tokens,
        members: pool.members.map((member, priority) => ({ model_id: member.id, priority, fallback: member.fallback })),
      });
      invalidateModelPools();
      success(enabled ? "Compound model enabled" : "Compound model disabled", pool.public_id);
      await reload();
    } catch (cause: any) {
      notifyError("Could not change compound model", cause?.message ?? "Check its members and try again.");
    } finally {
      setToggling(null);
    }
  };

  const remove = async (pool: ModelPool) => {
    if (!window.confirm(`Delete compound model “${pool.name}”? This does not delete its provider models.`)) return;
    try {
      await modelPools.remove(pool.id);
      invalidateModelPools();
      success("Compound model deleted");
      await reload();
    } catch (cause: any) {
      notifyError("Could not delete compound model", cause?.message);
    }
  };

  const test = async (pool: ModelPool) => {
    setTesting(pool.id);
    try {
      const result = await modelPools.test(pool.id);
      setTestResult((current) => ({ ...current, [pool.id]: result }));
      if (result.success) success("Compound model test passed", `${result.model} · ${result.duration_ms} ms`);
      else notifyError("Compound model test failed", result.error);
    } catch (cause: any) {
      const result = { success: false, duration_ms: 0, error: cause?.message ?? "Test failed" };
      setTestResult((current) => ({ ...current, [pool.id]: result }));
      notifyError("Compound model test failed", result.error);
    } finally {
      setTesting(null);
    }
  };

  return <div className="w-full space-y-6 p-4 sm:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Compound models</h1>
        <p className="mt-1 text-sm text-muted-foreground">Combine provider models with fallback or random routing.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => void reload()} disabled={loading}><RefreshLine className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
        <Button onClick={beginCreate}><AddLine className="mr-2 size-4" />New compound model</Button>
      </div>
    </header>

    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

    <CompoundModelEditor draft={draft} models={models} pools={pools} saving={saving} onDraftChange={updateDraft} onSave={() => void save()} onClose={closeEditor} />

    {loading && pools.length === 0 ? <div className="flex justify-center py-16"><LoaderLine className="size-5 animate-spin text-muted-foreground" /></div> : pools.length === 0 ? (
      <div className="flex flex-col items-center rounded-xl bg-muted/30 px-6 py-16 text-center"><MergeLine className="mb-4 size-9 text-muted-foreground" /><h2 className="text-lg font-medium">No compound models yet</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">Combine available provider models to create one stable API model with automatic fallback or randomized routing.</p><Button className="mt-5" onClick={beginCreate}><AddLine className="mr-2 size-4" />Create your first compound model</Button></div>
    ) : (
      <div className="grid gap-4 lg:grid-cols-2">
        {pools.map((pool) => {
          const unavailable = pool.members.filter((member) => !member.is_active || !member.provider_is_active);
          const canEnable = unavailable.length === 0;
          return <Card key={pool.id} className={pool.is_active ? "" : "opacity-70"}>
          <CardHeader className="relative flex-row items-start justify-between gap-3 space-y-0 pr-28"><div className="min-w-0"><CardTitle className={`truncate ${pool.is_active ? "" : "text-muted-foreground line-through"}`}>{pool.name}</CardTitle><p className="mt-1 font-mono text-xs text-muted-foreground">{pool.public_id}</p></div><div className="absolute top-4 right-4 flex shrink-0 items-center gap-1"><span title={canEnable || pool.is_active ? undefined : `Enable ${unavailable.map((member) => member.display_name || member.model_id).join(", ")} first`} className="mr-2"><Switch aria-label={pool.is_active ? "Disable compound model" : "Enable compound model"} checked={pool.is_active} disabled={toggling === pool.id || (!pool.is_active && !canEnable)} onCheckedChange={(checked) => void setEnabled(pool, checked)} /></span><Button size="icon-sm" variant="ghost" title="Test compound model" aria-label="Test compound model" disabled={!pool.is_active || testing === pool.id} onClick={() => void test(pool)}>{testing === pool.id ? <LoaderLine className="size-4 animate-spin" /> : <PlayLine className="size-4" />}</Button><Button size="icon-sm" variant="ghost" title="Edit compound model" aria-label="Edit compound model" onClick={() => beginEdit(pool)}><EditLine className="size-4" /></Button><Button size="icon-sm" variant="ghost" title="Delete compound model" aria-label="Delete compound model" onClick={() => void remove(pool)}><DeleteLine className="size-4" /></Button></div></CardHeader>
          <CardContent className="space-y-4">{!pool.is_active && !canEnable && <Alert><AlertDescription>Disabled because {unavailable.map((member) => member.display_name || member.model_id).join(", ")} {unavailable.length === 1 ? "is" : "are"} unavailable. Re-enable {unavailable.length === 1 ? "it" : "them"} to turn this compound model back on.</AlertDescription></Alert>}<div className="flex flex-wrap gap-2"><Badge variant={pool.is_active ? "secondary" : "destructive"}>{pool.is_active ? "Active" : "Disabled"}</Badge><Badge variant="outline">{pool.strategy === "priority" ? "Priority fallback" : "Random"}</Badge>{pool.hide_members && <Badge variant="outline">Members hidden</Badge>}{testResult[pool.id] && <Badge variant={testResult[pool.id].success ? "secondary" : "destructive"}>{testResult[pool.id].success ? `${testResult[pool.id].duration_ms} ms` : "Test failed"}</Badge>}</div><div className="space-y-2">{pool.members.map((member, index) => <div key={member.id} className="flex min-w-0 items-center gap-2 text-sm"><span className="w-5 text-center text-xs tabular-nums text-muted-foreground">{index + 1}</span><ProviderIcon name={member.provider_name} src={member.provider_avatar} sources={member.provider_avatar_sources} className="size-5 shrink-0" /><span className="truncate">{member.display_name || member.model_id}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">{member.provider_name}</span></div>)}</div></CardContent>
        </Card>;
        })}
      </div>
    )}
  </div>;
}
