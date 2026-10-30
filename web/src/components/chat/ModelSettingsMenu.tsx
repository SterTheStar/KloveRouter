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
  const selectedProvider = current?.model_pool ? "Compound models" : current?.provider_name;
  // Strict: only display an effort when one is actually selected (and sent).
  // The synthetic "None" must not appear as chosen while nothing is sent.
  const selectedEffort = selectedReasoningEffort
    ? reasoningEfforts.find((item) => item.effort === selectedReasoningEffort)
    : undefined;

  const groups = useMemo<ModelGroup[]>(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const grouped = new Map<string, ModelWithProvider[]>();

    for (const model of models) {
      const searchable = [
        model.provider_name,
        model.display_name ?? "",
        modelDisplayId(model),
        modelPublicId(model),
        ...(model.members ?? []).flatMap((member) => [member.provider_name, member.display_name ?? ""]),
      ].join(" ").toLowerCase();

      if (normalizedQuery && !searchable.includes(normalizedQuery)) continue;
      const providerName = model.model_pool ? "Compound models" : model.provider_name;
      const providerModels = grouped.get(providerName) ?? [];
      providerModels.push(model);
      grouped.set(providerName, providerModels);
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
        className={`flex h-7 max-w-[min(16rem,calc(100vw-7rem))] items-center gap-1 rounded-lg px-2 text-sm text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60 sm:max-w-72 ${open ? "bg-accent" : ""}`}
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
          <span className="hidden min-w-0 max-w-28 items-center gap-1 truncate text-xs text-tertiary sm:flex">
            <span className="shrink-0 text-tertiary/60">/</span>
            <span className="truncate">{selectedEffort.display_name}</span>
          </span>
        )}
        <ChevronDown
          className={`size-3.5 shrink-0 text-tertiary transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="fixed inset-x-0 top-20 bottom-0 z-[120] h-auto max-h-[calc(100dvh-5rem)] w-screen max-w-none overflow-hidden rounded-t-2xl border border-border bg-popover pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-popover-foreground shadow-[0px_4px_16px_0px_rgba(0,0,0,0.05)] sm:absolute sm:right-0 sm:bottom-10 sm:top-auto sm:inset-x-auto sm:h-[min(30rem,calc(100vh-5rem))] sm:max-h-none sm:w-[min(42rem,calc(100vw-2rem))] sm:max-w-[calc(100vw-2rem)] sm:rounded-xl sm:pt-0 sm:pb-0"
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
