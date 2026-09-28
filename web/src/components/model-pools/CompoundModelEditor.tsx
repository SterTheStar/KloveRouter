import type { ReactNode } from "react";
import {
  RiGitMergeLine as MergeLine,
  RiLoader4Line as LoaderLine,
  RiShuffleLine as ShuffleLine,
} from "@remixicon/react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { Switch } from "../ui/switch";
import { Tabs, type Tab } from "../ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import type { ModelPool, ModelWithProvider } from "../../types";
import type { CompoundModelDraft } from "./types";
import { ModelPicker } from "./ModelPicker";

const editorTabs: Tab[] = [
  { id: "general", label: "General" },
  { id: "members", label: "Members" },
  { id: "limits", label: "Token limits" },
];

const minKnown = (values: Array<number | null | undefined>) => {
  const known = values.filter((value): value is number => value != null);
  return known.length ? Math.min(...known) : null;
};

const slugify = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

export function CompoundModelEditor({
  draft,
  models,
  pools,
  tab,
  saving,
  onDraftChange,
  onTabChange,
  onToggleMember,
  onMoveMember,
  onSave,
  onClose,
}: {
  draft: CompoundModelDraft | null;
  models: ModelWithProvider[];
  pools: ModelPool[];
  tab: string;
  saving: boolean;
  onDraftChange: (update: (current: CompoundModelDraft) => CompoundModelDraft) => void;
  onTabChange: (tab: string) => void;
  onToggleMember: (id: string) => void;
  onMoveMember: (index: number, offset: -1 | 1) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const selectedModels = draft ? draft.members.flatMap(({ id }) => {
    const model = models.find((item) => item.id === id);
    if (model) return [model];
    const fromPool = pools.flatMap((pool) => pool.members).find((item) => item.id === id);
    return fromPool ? [fromPool] : [];
  }) : [];
  const memberInputLimit = minKnown(selectedModels.map((model) => model.context_window));
  const memberOutputLimit = minKnown(selectedModels.map((model) => model.max_output_tokens));
  const inputLimiters = selectedModels.filter((model) => memberInputLimit != null && model.context_window === memberInputLimit);
  const outputLimiters = selectedModels.filter((model) => memberOutputLimit != null && model.max_output_tokens === memberOutputLimit);
  const inputLimitError = draft?.max_input_tokens != null && memberInputLimit != null && draft.max_input_tokens > memberInputLimit
    ? `Cannot exceed the lowest member context window (${memberInputLimit.toLocaleString()}).`
    : null;
  const outputLimitError = draft?.max_output_tokens != null && memberOutputLimit != null && draft.max_output_tokens > memberOutputLimit
    ? `Cannot exceed the lowest member output maximum (${memberOutputLimit.toLocaleString()}).`
    : null;
  const update = (patch: Partial<CompoundModelDraft>) => onDraftChange((current) => ({ ...current, ...patch }));
  const canContinue = tab === "general"
    ? Boolean(draft?.name.trim() && draft?.slug.trim())
    : tab === "members" ? Boolean(draft && draft.members.length >= 2) : true;
  const index = editorTabs.findIndex((item) => item.id === tab);
  const goNext = () => onTabChange(editorTabs[Math.min(editorTabs.length - 1, index + 1)].id);

  return <Dialog open={draft !== null} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    {draft && <DialogContent className="flex h-[min(42rem,calc(100dvh-2rem))] w-[min(68rem,calc(100vw-1rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:w-[min(68rem,calc(100vw-3rem))] sm:max-w-6xl" showCloseButton={!saving}>
      <DialogHeader className="min-h-20 shrink-0 border-b px-5 py-4 pr-12 sm:px-7 sm:py-5">
        <DialogTitle>{draft.id ? "Edit compound model" : "Create compound model"}</DialogTitle>
        <DialogDescription>Configure its public identity, providers, routing behavior, and token limits.</DialogDescription>
      </DialogHeader>
      <Tabs tabs={editorTabs.map((item) => ({ ...item, id: `${item.id}-tab` }))} active={`${tab}-tab`} onChange={(id) => onTabChange(id.replace(/-tab$/, ""))} ariaLabel="Compound model settings" className="min-h-11 shrink-0 overflow-x-auto px-2 sm:px-6" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
        {tab === "general" && <section id="panel-general" role="tabpanel" aria-labelledby="general-tab" className="w-full space-y-7">
          <section className="space-y-4">
            <SectionHeading title="Identity" description="Name this model and choose the stable ID clients will request." />
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2"><div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><Label htmlFor="pool-name">Display name</Label><p className="text-right text-xs leading-relaxed text-muted-foreground">Shown in model catalogs and the chat model selector.</p></div><Input id="pool-name" value={draft.name} maxLength={120} placeholder="Reliable coding model" onChange={(event) => update({ name: event.target.value, ...(!draft.id ? { slug: slugify(event.target.value) } : {}) })} /></div>
              <div className="space-y-2"><div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><Label htmlFor="pool-slug">Public ID</Label><p className="text-right text-xs leading-relaxed text-muted-foreground">Stable across API clients and the chat model selector.</p></div><div className="flex items-center gap-2"><span className="shrink-0 text-sm text-muted-foreground">pool/</span><Input id="pool-slug" value={draft.slug} maxLength={80} placeholder="reliable-coding" onChange={(event) => update({ slug: slugify(event.target.value) })} /></div></div>
            </div>
          </section>

          <Separator />

          <section className="space-y-4">
            <SectionHeading title="Routing strategy" description="Choose which selected member receives each request." />
            <div role="group" aria-label="Routing strategy" className="grid gap-3 sm:grid-cols-2">
              <StrategyOption selected={draft.strategy === "priority"} onClick={() => update({ strategy: "priority" })} icon={<MergeLine className="size-4" />} title="Priority with fallback" description="Try members in the order shown. Move to the next when a provider is unavailable or returns a retryable error." />
              <StrategyOption selected={draft.strategy === "random"} onClick={() => update({ strategy: "random" })} icon={<ShuffleLine className="size-4" />} title="Random member" description="Choose a member at random for each request. Retryable failures continue through the remaining members." />
            </div>
          </section>

          <Separator />

          <section className="space-y-1">
            <SectionHeading title="Availability" description="Control how this compound model appears and accepts requests." />
            <SettingRow title="Enabled" description="Available in model catalogs and ready to receive requests." checked={draft.is_active} onCheckedChange={(checked) => update({ is_active: checked })} />
            <SettingRow title="Hide member models" description="Remove these members from catalogs and the chat selector while this compound model is active." checked={draft.hide_members} onCheckedChange={(checked) => update({ hide_members: checked })} />
          </section>
        </section>}

        {tab === "members" && <div id="panel-members" role="tabpanel" aria-labelledby="members-tab" className="w-full"><ModelPicker models={models} pools={pools} selected={draft.members} hideMembers={draft.hide_members} onToggle={onToggleMember} onMove={onMoveMember} onFallbackChange={(id, fallback) => onDraftChange((current) => ({ ...current, members: current.members.map((member) => member.id === id ? { ...member, fallback } : member) }))} /></div>}

        {tab === "limits" && <section id="panel-limits" role="tabpanel" aria-labelledby="limits-tab" className="w-full space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-base font-semibold">Token limits</h2><p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">Use the tightest member limit automatically, or set a lower cap for this public model.</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs tabular-nums text-muted-foreground">{draft.members.length} {draft.members.length === 1 ? "member" : "members"}</span></div>
          <div className="grid gap-4 md:grid-cols-2">
            <TokenLimitField id="pool-max-input" title="Context window" description="Maximum input tokens available to the prompt." value={draft.max_input_tokens} memberLimit={memberInputLimit} memberLimitLabel="Lowest member context window" limiters={inputLimiters.map((model) => `${model.display_name || model.model_id} (${model.provider_name})`)} error={inputLimitError} onChange={(value) => update({ max_input_tokens: value })} />
            <TokenLimitField id="pool-max-output" title="Maximum output" description="Maximum generated response tokens." value={draft.max_output_tokens} memberLimit={memberOutputLimit} memberLimitLabel="Lowest member output limit" limiters={outputLimiters.map((model) => `${model.display_name || model.model_id} (${model.provider_name})`)} error={outputLimitError} onChange={(value) => update({ max_output_tokens: value })} />
          </div>
          <div className="rounded-lg border bg-card px-4 py-3"><p className="text-xs leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">How limits apply:</span> empty fields use the lowest known member limit. Requests exceeding the input limit are rejected; requested output is capped before forwarding.</p></div>
        </section>}
      </div>
      <DialogFooter className="mx-0 mb-0 min-h-16 shrink-0 flex-row items-center justify-between gap-3 rounded-b-xl border-t bg-muted/30 px-4 py-3 sm:px-7">
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
        <div className="flex items-center gap-2">
          {tab !== "limits" ? <Button onClick={goNext} disabled={saving || !canContinue}>Continue</Button> : <Button onClick={onSave} disabled={saving || draft.members.length < 2 || Boolean(inputLimitError || outputLimitError)}>{saving && <LoaderLine className="mr-2 size-4 animate-spin" />}{draft.id ? "Save changes" : "Create compound model"}</Button>}
        </div>
      </DialogFooter>
    </DialogContent>}
  </Dialog>;
}

function TokenLimitField({ id, title, description, value, memberLimit, memberLimitLabel, limiters, error, onChange }: {
  id: string;
  title: string;
  description: string;
  value: number | null;
  memberLimit: number | null;
  memberLimitLabel: string;
  limiters: string[];
  error: string | null;
  onChange: (value: number | null) => void;
}) {
  const effectiveLimit = value != null ? value : memberLimit;
  return <div className="flex min-h-56 flex-col rounded-xl border bg-card p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div><Label htmlFor={id} className="text-sm font-semibold">{title}</Label><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>
    </div>
    <div className="mt-5">
      <Input id={id} className="h-11 bg-background font-mono text-base tabular-nums dark:bg-background" type="number" inputMode="numeric" min={1} max={memberLimit ?? undefined} value={value ?? ""} placeholder="Member limit" onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} />
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
    <div className="mt-auto space-y-2 pt-5">
      <div className="flex items-center justify-between gap-3 border-t pt-3 text-xs">
        <span className="text-muted-foreground">Effective maximum</span>
        <span className="font-mono font-medium tabular-nums text-foreground">{effectiveLimit != null ? effectiveLimit.toLocaleString() : "Not reported"}</span>
      </div>
      <p className="min-h-8 text-[11px] leading-relaxed text-muted-foreground">
        {memberLimit != null ? `${memberLimitLabel}: ${memberLimit.toLocaleString()}${limiters.length ? ` · ${limiters.join(", ")}` : ""}` : `No member ${title === "Context window" ? "context window" : "output limit"} has been reported.`}
      </p>
    </div>
  </div>;
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return <div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p></div>;
}

function StrategyOption({ selected, onClick, icon, title, description }: { selected: boolean; onClick: () => void; icon: ReactNode; title: string; description: string }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`flex min-h-28 flex-col rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary/50 bg-primary/[0.06]" : "hover:bg-muted/60"}`}>
    <span className="flex items-center gap-2 text-sm font-medium">{icon}{title}{selected && <span className="ml-auto text-[10px] font-medium text-primary">Selected</span>}</span>
    <span className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</span>
  </button>;
}

function SettingRow({ title, description, checked, onCheckedChange }: { title: string; description: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-muted/50">
    <span className="min-w-0"><span className="block text-sm font-medium">{title}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span></span>
    <Switch checked={checked} onCheckedChange={onCheckedChange} />
  </label>;
}
