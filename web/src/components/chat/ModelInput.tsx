import { useEffect, useMemo, useRef, useState } from "react";
import {
  RiArrowDownSLine as ChevronDown,
  RiCheckLine as CheckLine,
  RiSearchLine as Search,
} from "@remixicon/react";
import type { ModelWithProvider } from "../../types";
import ProviderIcon from "../ProviderIcon";

function modelId(model: ModelWithProvider) {
  return `${model.provider_name.toLowerCase().replace(/\s+/g, "")}/${model.model_id}`;
}

export default function ModelInput({
  models,
  value,
  onChange,
  disabled,
}: {
  models: ModelWithProvider[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const current = models.find((model) => modelId(model) === value);
  const filteredModels = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return models;
    return models.filter((model) =>
      [model.provider_name, model.model_id, model.display_name ?? "", modelId(model)]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [models, query]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  const selectModel = (model: ModelWithProvider) => {
    onChange(modelId(model));
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className="flex h-8 max-w-64 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-60"
        onClick={() => setOpen((previous) => !previous)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={current ? `${current.provider_name}/${current.model_id}` : "Selecione um modelo"}
      >
        <span className="min-w-0 truncate">
          {current ? current.display_name || current.model_id : "Selecione um modelo"}
        </span>
        <ChevronDown className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 bottom-11 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card p-2 text-card-foreground shadow-2xl">
          <div className="flex h-10 items-center gap-2 rounded-xl px-2.5 focus-within:bg-muted/70">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
              }}
              placeholder="Search models..."
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Search models"
            />
          </div>

          <div className="mt-1 max-h-80 overflow-y-auto">
            {filteredModels.length > 0 ? (
              filteredModels.map((model) => {
                const selected = modelId(model) === value;
                return (
                  <button
                    key={model.id}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-muted"
                    onClick={() => selectModel(model)}
                  >
                    <ProviderIcon
                      name={model.provider_name}
                      src={model.provider_avatar}
                      sources={model.provider_avatar_sources}
                      className="size-8 shrink-0 text-[10px]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">
                        {model.display_name || model.model_id}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {model.provider_name} · {model.model_id}
                      </span>
                    </span>
                    {selected && <CheckLine className="size-4 shrink-0 text-primary" />}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                No models found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
