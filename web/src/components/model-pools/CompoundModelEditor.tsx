import { useEffect, useMemo, useState } from "react";
import {
  RiAddLine as AddLine,
  RiArrowDownSLine as DownLine,
  RiArrowUpSLine as UpLine,
  RiCloseLine as CloseLine,
  RiErrorWarningLine as WarningLine,
  RiGitMergeLine as MergeLine,
  RiLoader4Line as LoaderLine,
  RiSearchLine as SearchLine,
  RiShuffleLine as ShuffleLine,
} from "@remixicon/react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Tabs } from "../ui/tabs";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import ProviderIcon from "../ProviderIcon";
import type { ModelPool, ModelWithProvider } from "../../types";
import type { CompoundModelDraft } from "./types";

type Props = {
  draft: CompoundModelDraft | null;
  models: ModelWithProvider[];
  pools: ModelPool[];
  saving: boolean;
  onDraftChange: (update: (current: CompoundModelDraft) => CompoundModelDraft) => void;
  onSave: () => void;
  onClose: () => void;
};

const slugify = (value: string) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9_-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 80);

const minKnown = (values: Array<number | null | undefined>) => {
  const known = values.filter((value): value is number => value != null);
  return known.length ? Math.min(...known) : null;
};

const modelLabel = (model: ModelWithProvider) => model.display_name || model.model_id;

export function CompoundModelEditor({ draft, models, pools, saving, onDraftChange, onSave, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("identity");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (draft) {
      setActiveTab("identity");
      setQuery("");
      setProviderFilter("all");
      setPickerOpen(false);
    }
  }, [Boolean(draft), draft?.id]);

  const update = (patch: Partial<CompoundModelDraft>) =>
    onDraftChange((current) => ({ ...current, ...patch }));

  // Resolve every selected member, including ones that are disabled or no longer in the catalog.
  const members = useMemo(() => {
    if (!draft) return [];
    const known = new Map<string, ModelWithProvider>(models.map((model) => [model.id, model]));
    for (const pool of pools) for (const member of pool.members) if (!known.has(member.id)) known.set(member.id, member);
    return draft.members.flatMap((selection) => {
      const model = known.get(selection.id);
      return model ? [{ selection, model }] : [];
    });
  }, [draft, models, pools]);

  const selectedIds = useMemo(() => new Set(draft?.members.map((member) => member.id) ?? []), [draft]);
  const providers = useMemo(() => [...new Set(models.map((model) => model.provider_name))].sort((a, b) => a.localeCompare(b)), [models]);
  const candidates = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return models.filter((model) => {
      if (selectedIds.has(model.id)) return false;
      if (providerFilter !== "all" && model.provider_name !== providerFilter) return false;
      if (!term) return true;
      return [model.display_name ?? "", model.model_id, model.pretty_id ?? "", model.provider_name]
        .some((value) => value.toLocaleLowerCase().includes(term));
    });
  }, [models, query, providerFilter, selectedIds]);

  if (!draft) return <Dialog open={false} onOpenChange={() => {}}><DialogContent /></Dialog>;

  const isEditing = Boolean(draft.id);
  const memberInputLimit = minKnown(members.map(({ model }) => model.context_window));
  const memberOutputLimit = minKnown(members.map(({ model }) => model.max_output_tokens));
  const inputLimiters = members.filter(({ model }) => memberInputLimit != null && model.context_window === memberInputLimit).map(({ model }) => modelLabel(model));
  const outputLimiters = members.filter(({ model }) => memberOutputLimit != null && model.max_output_tokens === memberOutputLimit).map(({ model }) => modelLabel(model));
  const unavailable = members.filter(({ model }) => !model.is_active || !model.provider_is_active);
  const slugTaken = pools.some((pool) => pool.slug === draft.slug.trim().toLowerCase() && pool.id !== draft.id);

  const errors: Record<string, string> = {};
  if (!draft.name.trim()) errors.name = "Enter a display name.";
  if (!draft.slug.trim()) errors.slug = "Enter a public ID.";
  else if (slugTaken) errors.slug = "This public ID is already used by another compound model.";
  if (draft.members.length < 2) errors.members = "Choose at least two member models.";
  if (draft.max_input_tokens != null && memberInputLimit != null && draft.max_input_tokens > memberInputLimit) {
    errors.input = `Cannot exceed ${memberInputLimit.toLocaleString()}, the lowest member context window.`;
  }
  if (draft.max_output_tokens != null && memberOutputLimit != null && draft.max_output_tokens > memberOutputLimit) {
    errors.output = `Cannot exceed ${memberOutputLimit.toLocaleString()}, the lowest member output limit.`;
  }
  if (draft.is_active && unavailable.length) {
    errors.enabled = "Enable every member model and its provider, or disable this compound model.";
  }
  const hasErrors = Object.keys(errors).length > 0;

  const addMember = (id: string) => update({ members: [...draft.members, { id, fallback: true }] });
  const removeMember = (id: string) => update({ members: draft.members.filter((member) => member.id !== id) });
  const moveMember = (index: number, offset: -1 | 1) => {
    const next = index + offset;
    if (next < 0 || next >= draft.members.length) return;
    const list = [...draft.members];
    [list[index], list[next]] = [list[next], list[index]];
    update({ members: list });
  };
  const setFallback = (id: string, fallback: boolean) =>
    update({ members: draft.members.map((member) => member.id === id ? { ...member, fallback } : member) });

  const effectiveInput = draft.max_input_tokens ?? memberInputLimit;
  const effectiveOutput = draft.max_output_tokens ?? memberOutputLimit;
  const firstInvalidTab = errors.name || errors.slug ? "identity"
    : errors.members ? "members"
      : errors.input || errors.output ? "limits"
        : errors.enabled ? "availability" : "identity";
  const save = () => {
    if (hasErrors) {
      setActiveTab(firstInvalidTab);
      return;
    }
    onSave();
  };

  const tabs = [
    { id: "identity", label: "Identity" },
    { id: "members", label: `Members${draft.members.length ? ` (${draft.members.length})` : ""}` },
    { id: "routing", label: "Routing" },
    { id: "limits", label: "Limits" },
    { id: "availability", label: "Availability" },
  ];

  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent
      showCloseButton={!saving}
      className="flex h-[min(46rem,calc(100dvh-2rem))] w-[min(72rem,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
    >
      <DialogHeader className="shrink-0 gap-0 border-b">
        <div className="px-6 py-4 pr-14">
          <DialogTitle>{isEditing ? "Edit compound model" : "New compound model"}</DialogTitle>
          <DialogDescription className="mt-1">One stable API model that routes requests across several provider models.</DialogDescription>
        </div>
        <div className="overflow-x-auto px-6">
          <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} ariaLabel="Compound model settings" className="min-w-max" />
        </div>
      </DialogHeader>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-h-0 overflow-y-auto px-6 py-6">
          <div id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`${activeTab}-tab`} className="min-w-0">
            {activeTab === "identity" && <>
            <Section title="Identity" description="How the model appears in catalogs and what API clients request.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="pool-name" label="Display name" error={errors.name} hint="Shown in the model picker.">
                  <Input id="pool-name" value={draft.name} maxLength={120} placeholder="Reliable coding model" aria-invalid={Boolean(errors.name)} className="h-9"
                    onChange={(event) => update({ name: event.target.value, ...(!isEditing ? { slug: slugify(event.target.value) } : {}) })} />
                </Field>
                <Field id="pool-slug" label="Public ID" error={errors.slug} hint={isEditing ? "Changing it breaks clients using the old ID." : "Used in API requests."}>
                  <div className="flex h-9 items-center rounded-lg bg-input/30 focus-within:ring-2 focus-within:ring-ring">
                    <span className="select-none px-3 text-sm font-medium text-foreground/70">pool/</span>
                    <input id="pool-slug" value={draft.slug} maxLength={80} placeholder="reliable-coding" aria-invalid={Boolean(errors.slug)}
                      onChange={(event) => update({ slug: slugify(event.target.value) })}
                      className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground" />
                  </div>
                </Field>
              </div>
            </Section>
            </>}

            {activeTab === "members" && <>
            <Section title="Members" description="Order is priority. With fallback on, a failing member hands the request to the next one."
              action={<PopoverPrimitive.Root open={pickerOpen} onOpenChange={(open) => {
                setPickerOpen(open);
                if (open) {
                  setQuery("");
                  setProviderFilter("all");
                }
              }}>
                <PopoverPrimitive.Trigger
                  aria-label="Add member model"
                  render={<Button type="button" variant="outline" className="gap-2"><AddLine className="size-4" />Add model</Button>}
                />
                <PopoverPrimitive.Portal>
                  <PopoverPrimitive.Positioner side="bottom" align="end" sideOffset={6} className="z-[60] outline-none">
                    <PopoverPrimitive.Popup className="w-[min(34rem,calc(100vw-3rem))] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10">
                      <div className="space-y-3 border-b p-3">
                        <div>
                          <p className="text-sm font-medium">Add member models</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">Search the catalog and select models to add.</p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <div className="relative min-w-0 flex-1">
                            <SearchLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search models" aria-label="Search models" className="h-9 bg-background pl-9" />
                          </div>
                          <select aria-label="Filter by provider" value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}
                            className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring dark:[color-scheme:dark] sm:w-48">
                            <option value="all">All providers</option>
                            {providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="max-h-72 overflow-y-auto p-1">
                        {candidates.length ? candidates.map((model) => {
                          const off = !model.is_active || !model.provider_is_active;
                          return <button key={model.id} type="button" onClick={() => addMember(model.id)}
                            className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${off ? "bg-muted/40 hover:bg-muted/70" : "hover:bg-muted/60"}`}>
                            <ProviderIcon name={model.provider_name} src={model.provider_avatar} sources={model.provider_avatar_sources} className="size-6 shrink-0" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{modelLabel(model)}</span>
                              <span className="block truncate text-xs text-muted-foreground">{model.provider_name} · {model.pretty_id || model.model_id}</span>
                            </span>
                            {off && <span className="shrink-0 text-[11px] text-muted-foreground">Disabled</span>}
                            <AddLine className="size-4 shrink-0 text-muted-foreground" />
                          </button>;
                        }) : <p className="px-3 py-8 text-center text-xs text-muted-foreground">No models match.</p>}
                      </div>
                    </PopoverPrimitive.Popup>
                  </PopoverPrimitive.Positioner>
                </PopoverPrimitive.Portal>
              </PopoverPrimitive.Root>}>
              {draft.members.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-8 text-center">
                  <p className="text-sm font-medium">No members yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Add at least two models from the list below.</p>
                </div>
              ) : (
                <ol className="divide-y overflow-hidden rounded-lg border" aria-label="Members in priority order">
                  {members.map(({ selection, model }, index) => {
                    const isUnavailable = !model.is_active || !model.provider_is_active;
                    const reason = !model.provider_is_active ? "Provider disabled" : !model.is_active ? "Model disabled" : null;
                    return <li key={selection.id} className={`flex items-center gap-3 px-3 py-2.5 ${isUnavailable ? "bg-destructive/5" : "bg-card"}`}>
                      <span className="w-5 shrink-0 text-center font-mono text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                      <ProviderIcon name={model.provider_name} src={model.provider_avatar} sources={model.provider_avatar_sources} className="size-7 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{modelLabel(model)}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {model.provider_name}
                          {reason ? <span className="ml-2 inline-flex items-center gap-1 text-destructive"><WarningLine className="size-3" />{reason}</span> : null}
                        </p>
                      </div>
                      <label className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
                        Fallback
                        <Switch size="sm" checked={selection.fallback} onCheckedChange={(checked) => setFallback(selection.id, checked)} aria-label={`Fallback for ${modelLabel(model)}`} />
                      </label>
                      <div className="flex shrink-0 items-center">
                        <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => moveMember(index, -1)} aria-label={`Move ${modelLabel(model)} up`}><UpLine className="size-4" /></Button>
                        <Button variant="ghost" size="icon-sm" disabled={index === members.length - 1} onClick={() => moveMember(index, 1)} aria-label={`Move ${modelLabel(model)} down`}><DownLine className="size-4" /></Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => removeMember(selection.id)} aria-label={`Remove ${modelLabel(model)}`}><CloseLine className="size-4" /></Button>
                      </div>
                    </li>;
                  })}
                </ol>
              )}
              {errors.members && <p className="text-xs text-destructive">{errors.members}</p>}

            </Section>
            </>}

            {activeTab === "routing" && <>
            <Section title="Routing" description="How a member is chosen for each request.">
              <div role="radiogroup" aria-label="Routing strategy" className="grid gap-3 sm:grid-cols-2">
                <StrategyCard selected={draft.strategy === "priority"} onSelect={() => update({ strategy: "priority" })}
                  icon={<MergeLine className="size-4" />} title="Priority fallback" description="Use members in the order above. Move to the next on retryable errors." />
                <StrategyCard selected={draft.strategy === "random"} onSelect={() => update({ strategy: "random" })}
                  icon={<ShuffleLine className="size-4" />} title="Random" description="Pick a member at random per request. Failures continue through the rest." />
              </div>
            </Section>
            </>}

            {activeTab === "limits" && <>
            <Section title="Token limits" description="Leave empty to inherit the strictest member limit.">
              <div className="grid gap-4 sm:grid-cols-2">
                <LimitField id="pool-max-input" label="Input (context)" value={draft.max_input_tokens} onChange={(value) => update({ max_input_tokens: value })}
                  memberLimit={memberInputLimit} limiters={inputLimiters} error={errors.input} />
                <LimitField id="pool-max-output" label="Output" value={draft.max_output_tokens} onChange={(value) => update({ max_output_tokens: value })}
                  memberLimit={memberOutputLimit} limiters={outputLimiters} error={errors.output} />
              </div>
            </Section>
            </>}

            {activeTab === "availability" && <>
            <Section title="Availability" description="Control visibility and whether requests are accepted.">
              <ToggleRow title="Enabled" description={draft.is_active ? "Accepts requests and appears in catalogs." : "Hidden from catalogs and rejects requests."}
                checked={draft.is_active} onCheckedChange={(checked) => update({ is_active: checked })} />
              {errors.enabled && <p className="px-3 text-xs text-destructive">{errors.enabled}</p>}
              <ToggleRow title="Hide member models" description="Remove members from catalogs while this compound model is enabled."
                checked={draft.hide_members} onCheckedChange={(checked) => update({ hide_members: checked })} />
            </Section>
            </>}
          </div>
        </div>

        {/* Live summary */}
        <aside className="hidden min-h-0 flex-col gap-5 overflow-y-auto border-l bg-muted/20 px-5 py-6 lg:flex" aria-label="Summary">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
            <p className="mt-2 truncate text-base font-semibold">{draft.name.trim() || "Untitled"}</p>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">pool/{draft.slug || "…"}</p>
          </div>
          <dl className="space-y-3 text-sm">
            <SummaryRow label="Status"><StatusPill active={draft.is_active} /></SummaryRow>
            <SummaryRow label="Routing">{draft.strategy === "priority" ? "Priority fallback" : "Random"}</SummaryRow>
            <SummaryRow label="Members">{draft.members.length}</SummaryRow>
            <SummaryRow label="Context">{effectiveInput != null ? effectiveInput.toLocaleString() : "Not reported"}</SummaryRow>
            <SummaryRow label="Output">{effectiveOutput != null ? effectiveOutput.toLocaleString() : "Not reported"}</SummaryRow>
          </dl>
          {unavailable.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
              <p className="flex items-center gap-1.5 font-medium text-destructive"><WarningLine className="size-3.5" />Unavailable members</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {unavailable.map(({ model }) => <li key={model.id} className="truncate">{modelLabel(model)}</li>)}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <DialogFooter className="mx-0 mb-0 shrink-0 flex-row items-center justify-between gap-3 rounded-b-xl border-t bg-popover px-6 py-3">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {hasErrors ? "Fix the highlighted fields to save." : isEditing ? "All changes valid." : "Ready to create."}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <LoaderLine className="mr-2 size-4 animate-spin" />}
            {isEditing ? "Save changes" : "Create compound model"}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function Section({ title, description, action, children }: { title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="space-y-4">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
    {children}
  </section>;
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return <div className="space-y-1.5">
    <Label htmlFor={id}>{label}</Label>
    {children}
    {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
  </div>;
}

function LimitField({ id, label, value, onChange, memberLimit, limiters, error }: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  memberLimit: number | null;
  limiters: string[];
  error?: string;
}) {
  return <div className="space-y-1.5">
    <div className="flex items-baseline justify-between gap-2">
      <Label htmlFor={id}>{label}</Label>
      <span className="text-xs text-muted-foreground">
        {memberLimit != null ? <>Member max <span className="font-mono tabular-nums text-foreground">{memberLimit.toLocaleString()}</span></> : "No member limit reported"}
      </span>
    </div>
    <Input id={id} type="number" inputMode="numeric" min={1} max={memberLimit ?? undefined} value={value ?? ""} placeholder={memberLimit != null ? memberLimit.toLocaleString() : "Unlimited"}
      aria-invalid={Boolean(error)} className="font-mono tabular-nums"
      onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} />
    {error ? <p className="text-xs text-destructive">{error}</p>
      : limiters.length ? <p className="text-xs text-muted-foreground">Set by {limiters.join(", ")}</p> : null}
  </div>;
}

function StrategyCard({ selected, onSelect, icon, title, description }: { selected: boolean; onSelect: () => void; icon: React.ReactNode; title: string; description: string }) {
  return <button type="button" role="radio" aria-checked={selected} onClick={onSelect}
    className={`flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary bg-primary/[0.05] ring-1 ring-primary/30" : "hover:bg-muted/50"}`}>
    <span className="flex items-center gap-2 text-sm font-medium">{icon}{title}</span>
    <span className="text-xs leading-relaxed text-muted-foreground">{description}</span>
  </button>;
}

function ToggleRow({ title, description, checked, onCheckedChange }: { title: string; description: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border px-4 py-3 hover:bg-muted/40">
    <span className="min-w-0">
      <span className="block text-sm font-medium">{title}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
    </span>
    <Switch checked={checked} onCheckedChange={onCheckedChange} />
  </label>;
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="text-right font-medium">{children}</dd>
  </div>;
}

function StatusPill({ active }: { active: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
    <span className={`size-1.5 rounded-full ${active ? "bg-success" : "bg-muted-foreground/50"}`} />
    {active ? "Enabled" : "Disabled"}
  </span>;
}
