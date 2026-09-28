import { useMemo, useState } from "react";
import {
  RiCheckLine as CheckLine,
  RiCloseLine as CloseLine,
  RiArrowLeftSLine as MoveLeftLine,
  RiArrowRightSLine as MoveRightLine,
  RiSearchLine as SearchLine,
  RiStackLine as StackLine,
} from "@remixicon/react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import type { ModelPool, ModelWithProvider } from "../../types";
import ProviderIcon from "../ProviderIcon";

const INITIAL_VISIBLE = 80;
const VISIBLE_STEP = 80;

export function ModelPicker({
  models,
  pools,
  selected,
  hideMembers,
  onToggle,
  onFallbackChange,
  onMove,
}: {
  models: ModelWithProvider[];
  pools: ModelPool[];
  selected: Array<{ id: string; fallback: boolean }>;
  hideMembers: boolean;
  onToggle: (modelId: string) => void;
  onFallbackChange: (modelId: string, fallback: boolean) => void;
  onMove: (index: number, offset: -1 | 1) => void;
}) {
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [showSelected, setShowSelected] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const selectedIds = useMemo(() => new Set(selected.map((member) => member.id)), [selected]);
  const providers = useMemo(() => [...new Set(models.map((model) => model.provider_name))].sort((a, b) => a.localeCompare(b)), [models]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return models.filter((model) => {
      if (providerFilter !== "all" && model.provider_name !== providerFilter) return false;
      if (showSelected && !selectedIds.has(model.id)) return false;
      if (!normalized) return true;
      return [model.display_name ?? "", model.model_id, model.pretty_id ?? "", model.provider_name]
        .some((value) => value.toLocaleLowerCase().includes(normalized));
    });
  }, [models, providerFilter, query, selectedIds, showSelected]);

  const visible = filtered.slice(0, visibleCount);
  return (
    <section aria-labelledby="member-models-heading" className="flex min-h-0 flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="member-models-heading" className="text-sm font-semibold">Member models</h2>
          <p className="mt-1 text-xs text-muted-foreground">Select at least two. Their order determines priority when using fallback routing.</p>
        </div>
        <Badge variant={selected.length >= 2 ? "secondary" : "outline"} className="tabular-nums">
          {selected.length} selected
        </Badge>
      </header>

      {selected.length > 0 && <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto" aria-label="Selected models">
        {selected.map((member, index) => {
          const model = models.find((item) => item.id === member.id);
          if (!model) return null;
          return <div key={member.id} className="flex max-w-full items-center gap-1 rounded-md border bg-muted/35 py-1 pl-2 pr-1">
            <span className="w-4 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground">{index + 1}</span>
            <ProviderIcon name={model.provider_name} src={model.provider_avatar} sources={model.provider_avatar_sources} className="size-5 shrink-0" />
            <span className="max-w-36 truncate text-xs font-medium">{model.display_name || model.model_id}</span>
            <button type="button" disabled={index === 0} onClick={() => onMove(index, -1)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30" aria-label={`Move ${model.display_name || model.model_id} earlier`}>
              <MoveLeftLine className="size-3.5" />
            </button>
            <button type="button" disabled={index === selected.length - 1} onClick={() => onMove(index, 1)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30" aria-label={`Move ${model.display_name || model.model_id} later`}>
              <MoveRightLine className="size-3.5" />
            </button>
            <button type="button" onClick={() => onToggle(model.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Remove ${model.display_name || model.model_id}`}>
              <CloseLine className="size-3.5" />
            </button>
          </div>;
        })}
      </div>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <SearchLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(INITIAL_VISIBLE); }} placeholder="Search by model or provider" aria-label="Search available models" className="h-9 pl-9" />
        </div>
        <div className="relative sm:w-52">
          <StackLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <select aria-label="Filter by provider" value={providerFilter} onChange={(event) => { setProviderFilter(event.target.value); setVisibleCount(INITIAL_VISIBLE); }} className="h-9 w-full appearance-none rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="all">All providers ({providers.length})</option>
            {providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{filtered.length.toLocaleString()} available{providerFilter !== "all" ? ` · ${providerFilter}` : ""}</span>
        <label className="flex cursor-pointer items-center gap-2">
          <Switch size="sm" checked={showSelected} onCheckedChange={(checked) => { setShowSelected(checked); setVisibleCount(INITIAL_VISIBLE); }} />
          <span>Selected only</span>
        </label>
      </div>

      <div className="h-[min(34vh,20rem)] min-h-48 overflow-y-auto rounded-lg border bg-background" aria-label="Available models">
        {visible.length ? visible.map((model) => {
          const index = selected.findIndex((member) => member.id === model.id);
          const isSelected = index >= 0;
          const member = isSelected ? selected[index] : null;
          const hidingPools = pools.filter((pool) => pool.is_active && pool.hide_members && pool.members.some((item) => item.id === model.id));
          const alreadyHidden = !hideMembers && model.is_active && hidingPools.length > 0;
          return <div key={model.id} className={`group flex min-h-14 items-center gap-3 border-b px-3 py-2 last:border-b-0 ${isSelected ? "bg-primary/[0.06]" : "hover:bg-muted/60"}`}>
            <button type="button" onClick={() => onToggle(model.id)} aria-pressed={isSelected} aria-label={`${isSelected ? "Remove" : "Add"} ${model.display_name || model.model_id}`} className={`flex size-5 shrink-0 items-center justify-center rounded border transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 bg-background hover:border-foreground/50"}`}>
              {isSelected && <CheckLine className="size-3.5" />}
            </button>
            <ProviderIcon name={model.provider_name} src={model.provider_avatar} sources={model.provider_avatar_sources} className="size-7 shrink-0" />
            <button type="button" onClick={() => onToggle(model.id)} className="min-w-0 flex-1 text-left" aria-pressed={isSelected}>
              <span className="block truncate text-sm font-medium">{model.display_name || model.model_id}</span>
              <span className="block truncate text-xs text-muted-foreground">{model.provider_name} · {model.pretty_id || model.model_id}</span>
            </button>
            {alreadyHidden && <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">Hidden elsewhere</Badge>}
            {!model.is_active && <Badge variant="outline" className="shrink-0">Inactive</Badge>}
            {isSelected && <label className="flex shrink-0 items-center gap-1.5 border-l pl-3 text-[11px] text-muted-foreground">
              <Switch size="sm" checked={member?.fallback ?? true} onCheckedChange={(checked) => onFallbackChange(model.id, checked)} aria-label={`Fallback for ${model.display_name || model.model_id}`} />
              <span className="hidden sm:inline">Fallback</span>
            </label>}
          </div>;
        }) : <div className="flex h-full min-h-48 flex-col items-center justify-center px-5 text-center">
          <SearchLine className="mb-2 size-5 text-muted-foreground/70" />
          <p className="text-sm font-medium">No models found</p>
          <p className="mt-1 text-xs text-muted-foreground">Try another search or provider filter.</p>
        </div>}
        {filtered.length > visibleCount && <div className="border-t p-2 text-center">
          <Button variant="ghost" size="sm" onClick={() => setVisibleCount((count) => count + VISIBLE_STEP)}>Show more ({(filtered.length - visibleCount).toLocaleString()} remaining)</Button>
        </div>}
      </div>
      <p className="text-xs text-muted-foreground">Selected models stay in the order shown above. Use the Strategy tab to choose priority fallback or random routing.</p>
    </section>
  );
}
