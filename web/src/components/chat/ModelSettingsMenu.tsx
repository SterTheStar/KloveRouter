import { useEffect, useMemo, useRef, useState } from "react";
import { RiArrowDownSLine as ChevronDown } from "@remixicon/react";
import type { ModelWithProvider, ReasoningEffort } from "../../types";
import { modelDisplayId, modelPublicId } from "../../lib/model-id";
import ModelDetailsPane from "./model-settings/ModelDetailsPane";
import ModelListPane, { type ModelGroup } from "./model-settings/ModelListPane";

type Props = {
  models: ModelWithProvider[];
  selectedModel: string | null;
  onSelectModel: (id: string) => void;
  reasoningEfforts: ReasoningEffort[];
  selectedReasoningEffort: string | null;
  onSelectReasoningEffort: (effort: string) => void;
  disabled?: boolean;
};

export default function ModelSettingsMenu({
  models,
  selectedModel,
  onSelectModel,
  reasoningEfforts,
  selectedReasoningEffort,
  onSelectReasoningEffort,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const current = models.find((model) => modelPublicId(model) === selectedModel);
  const selectedProvider = current?.provider_name;
  const selectedEffort = reasoningEfforts.find((item) => item.effort === selectedReasoningEffort)
    ?? reasoningEfforts.find((item) => item.is_default)
    ?? reasoningEfforts[0];

  const groups = useMemo<ModelGroup[]>(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const grouped = new Map<string, ModelWithProvider[]>();

    for (const model of models) {
      const searchable = [
        model.provider_name,
        model.display_name ?? "",
        modelDisplayId(model),
        modelPublicId(model),
      ].join(" ").toLowerCase();

      if (normalizedQuery && !searchable.includes(normalizedQuery)) continue;
      const providerModels = grouped.get(model.provider_name) ?? [];
      providerModels.push(model);
      grouped.set(model.provider_name, providerModels);
    }

    return [...grouped.entries()].map(([name, providerModels]) => ({
      name,
      models: providerModels,
    }));
  }, [models, query]);

  useEffect(() => {
    if (!open) return;

    searchRef.current?.focus();
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !selectedProvider) return;
    setCollapsedProviders((previous) => {
      if (!previous.has(selectedProvider)) return previous;
      const next = new Set(previous);
      next.delete(selectedProvider);
      return next;
    });
  }, [open, selectedProvider]);

  const toggleProvider = (provider: string) => {
    setCollapsedProviders((previous) => {
      const next = new Set(previous);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  const selectModel = (model: ModelWithProvider) => {
    onSelectModel(modelPublicId(model));
    setQuery("");
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className="flex h-8 max-w-64 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-60 sm:max-w-72"
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={current ? modelPublicId(current) : "Select model and reasoning"}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {current?.display_name || (current ? modelDisplayId(current) : "Select model")}
        </span>
        {selectedEffort && (
          <span className="hidden min-w-0 max-w-28 items-center gap-1 truncate text-xs font-normal text-muted-foreground sm:flex">
            <span className="shrink-0 text-muted-foreground/50">/</span>
            <span className="truncate">{selectedEffort.display_name}</span>
          </span>
        )}
        <ChevronDown
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 bottom-11 z-50 h-[min(32rem,calc(100vh-5rem))] w-[min(46rem,calc(100vw-2rem))] overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/10"
          role="dialog"
          aria-label="Model and reasoning settings"
        >
          <div className="grid h-full min-h-0 grid-rows-2 sm:grid-cols-[minmax(0,1.45fr)_minmax(15rem,0.85fr)] sm:grid-rows-1">
            <ModelListPane
              groups={groups}
              selectedModel={selectedModel}
              query={query}
              searchRef={searchRef}
              collapsedProviders={collapsedProviders}
              onQueryChange={setQuery}
              onToggleProvider={toggleProvider}
              onSelectModel={selectModel}
              onClose={() => setOpen(false)}
            />
            <ModelDetailsPane
              model={current}
              efforts={reasoningEfforts}
              selectedEffort={selectedEffort}
              onSelectEffort={onSelectReasoningEffort}
            />
          </div>
        </div>
      )}
    </div>
  );
}
