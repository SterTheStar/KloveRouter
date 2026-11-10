import type { RefObject } from "react";
import {
  RiArrowDownSLine as ChevronDown,
  RiCheckLine as CheckLine,
  RiSearchLine as Search,
} from "@remixicon/react";
import type { ModelWithProvider } from "../../../types";
import { modelDisplayId, modelPublicId } from "../../../lib/model-id";
import ProviderIcon from "../../ProviderIcon";

export type ModelGroup = {
  name: string;
  models: ModelWithProvider[];
};

type Props = {
  groups: ModelGroup[];
  selectedModel: string | null;
  query: string;
  searchRef: RefObject<HTMLInputElement | null>;
  collapsedProviders: Set<string>;
  onQueryChange: (query: string) => void;
  onToggleProvider: (provider: string) => void;
  onSelectModel: (model: ModelWithProvider) => void;
  onClose: () => void;
};

export default function ModelListPane({
  groups,
  selectedModel,
  query,
  searchRef,
  collapsedProviders,
  onQueryChange,
  onToggleProvider,
  onSelectModel,
  onClose,
}: Props) {
  return (
    <section
      className="flex min-h-0 min-w-0 flex-col border-b border-border sm:border-r sm:border-b-0"
      aria-label="Models"
    >
      <div className="shrink-0 px-3 pt-3 pb-2">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-2.5 transition-colors focus-within:border-border-strong focus-within:bg-card">
          <Search className="size-4 shrink-0 text-tertiary" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
            }}
            placeholder="Search models..."
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-placeholder"
            aria-label="Search models"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {groups.length > 0 ? (
          groups.map((group) => {
            const collapsed = !query && collapsedProviders.has(group.name);
            const firstModel = group.models[0];

            return (
              <div key={group.name} className="mb-1 last:mb-0">
                <button
                  type="button"
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-accent"
                  onClick={() => onToggleProvider(group.name)}
                  aria-expanded={!collapsed}
                >
                  <ProviderIcon
                    name={group.name}
                    src={firstModel?.provider_avatar}
                    sources={firstModel?.provider_avatar_sources}
                    className="size-4 shrink-0 text-[7px]"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-normal text-tertiary">
                    {group.name}
                  </span>
                  <span className="text-[11px] tabular-nums text-tertiary">{group.models.length}</span>
                  <ChevronDown
                    className={`size-3.5 shrink-0 text-tertiary transition-transform ${collapsed ? "-rotate-90" : ""}`}
                  />
                </button>

                {!collapsed && (
                  <div className="flex flex-col gap-0.5">
                    {group.models.map((model) => {
                      const selected = modelPublicId(model) === selectedModel;
                      const name = model.display_name || modelDisplayId(model);
                      const id = modelDisplayId(model);

                      return (
                        <button
                          key={model.id}
                          type="button"
                          className={`flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors ${selected ? "bg-accent text-foreground" : "hover:bg-accent/60"}`}
                          onClick={() => onSelectModel(model)}
                          title={`${model.provider_name} / ${id}`}
                        >
                          <span className="min-w-0 flex-1 truncate">{name}</span>
                          <span className="max-w-32 shrink-0 truncate text-[11px] text-tertiary" title={id}>
                            {id}
                          </span>
                          {selected && <CheckLine className="size-4 shrink-0 text-foreground" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex h-full min-h-28 items-center justify-center px-4 text-center text-sm text-tertiary">
            No models found
          </div>
        )}
      </div>
    </section>
  );
}
