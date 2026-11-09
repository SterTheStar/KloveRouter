import { useState, useMemo } from "react";
import {
  RiSearchLine,
  RiCloseLine,
  RiCloseCircleLine,
} from "@remixicon/react";
import { Input } from "@/components/ui/input";
import ProviderIcon from "@/components/ProviderIcon";
import type { ProviderTemplate } from "@/lib/provider-templates";
import { IntegrationBadge } from "./IntegrationBadge";

type Props = {
  templates: readonly ProviderTemplate[];
  selectedTemplate: ProviderTemplate | null;
  onSelect: (template: ProviderTemplate) => void;
  onConfirm?: (template: ProviderTemplate) => void;
  unavailableProtocols?: Set<string>;
};

export function ProviderListColumn({
  templates,
  selectedTemplate,
  onSelect,
  onConfirm,
  unavailableProtocols = new Set(),
}: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => (
      t.name.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      (t.website && t.website.toLowerCase().includes(q))
    ));
  }, [templates, search]);

  return (
    <div className="flex h-full flex-col space-y-3">
      {/* Search Input */}
      <div className="relative">
        <RiSearchLine className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search providers or endpoints..."
          className="h-9 pl-9 pr-8 text-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <RiCloseLine className="size-3.5" />
          </button>
        )}
      </div>

      {/* Provider List */}
      <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
        {filtered.map((type) => {
          const isSelected = selectedTemplate?.id === type.id;
          const isUnavailable = unavailableProtocols.has(type.protocol);
          const isOAuth =
            type.protocol === "codex" ||
            type.protocol === "antigravity" ||
            type.protocol === "deepai";

          return (
            <button
              key={type.id}
              type="button"
              disabled={isUnavailable}
              onClick={() => onSelect(type)}
              onDoubleClick={() => {
                if (!isUnavailable && onConfirm) onConfirm(type);
              }}
              className={`flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                isSelected
                  ? "border-foreground/30 bg-accent text-foreground shadow-xs"
                  : "border-border bg-card hover:bg-accent/60 text-foreground"
              } ${isUnavailable ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background p-1">
                <ProviderIcon
                  name={type.name}
                  src={type.logo}
                  className={`size-full object-contain ${type.id === "openai" ? "dark:invert" : ""}`}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-xs font-medium text-foreground">
                    {type.name}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {isUnavailable && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[9px] font-medium text-destructive">
                        <RiCloseCircleLine className="size-2.5" />
                        <span>Unavailable</span>
                      </span>
                    )}
                    <IntegrationBadge template={type} size="sm" />
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div className="flex h-36 flex-col items-center justify-center rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No providers found matching your search.
          </div>
        )}
      </div>
    </div>
  );
}
