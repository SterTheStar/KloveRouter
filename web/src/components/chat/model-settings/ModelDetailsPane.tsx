import { RiCheckLine as CheckLine } from "@remixicon/react";
import type { ModelWithProvider, ReasoningEffort } from "../../../types";
import { modelDisplayId } from "../../../lib/model-id";
import ProviderIcon from "../../ProviderIcon";

type Props = {
  model?: ModelWithProvider;
  efforts: ReasoningEffort[];
  selectedEffort?: ReasoningEffort;
  onSelectEffort: (effort: string) => void;
};

function formatTokens(value: number | null) {
  if (!value) return "—";
  if (value < 1_000) return value.toLocaleString();
  const thousands = value / 1_000;
  return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}K`;
}

function DetailRow({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex h-7 items-center justify-between gap-3 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium text-foreground" title={title ?? value}>{value}</span>
    </div>
  );
}

export default function ModelDetailsPane({ model, efforts, selectedEffort, onSelectEffort }: Props) {
  const capabilities = model
    ? Object.entries(model.capabilities)
      .filter(([, enabled]) => enabled === true)
      .map(([capability]) => capability.replace("non_streaming", "non-streaming"))
      .join(" · ")
    : "";

  return (
    <section className="flex min-h-0 min-w-0 flex-col" aria-label="Model details and reasoning effort">
      <div className="shrink-0 px-4 pt-4 pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {model && (
            <ProviderIcon
              name={model.provider_name}
              src={model.provider_avatar}
              sources={model.provider_avatar_sources}
              className="size-7 shrink-0 text-[9px]"
            />
          )}
          <div className="min-w-0">
            <h3 className="truncate font-heading text-sm font-medium text-foreground">
              {model?.display_name || (model ? modelDisplayId(model) : "No model selected")}
            </h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {model?.provider_name || "Select a model to view its details"}
            </p>
          </div>
        </div>

        {model && (
          <div className="mt-3">
            <DetailRow label="Model ID" value={modelDisplayId(model)} />
            <DetailRow label="Context" value={formatTokens(model.context_window)} />
            <DetailRow label="Max output" value={formatTokens(model.max_output_tokens)} />
            <DetailRow label="Capabilities" value={capabilities || "—"} title={capabilities || "No capabilities reported"} />
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-2 pb-3">
        <div className="flex shrink-0 items-center justify-between gap-3 px-2 pb-2">
          <div>
            <h3 className="font-heading text-sm font-medium text-foreground">Reasoning effort</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Thinking depth</p>
          </div>
          {efforts.length > 0 && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
              {efforts.length}
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {efforts.length > 0 ? (
            efforts.map((item) => {
              const selected = item.effort === selectedEffort?.effort;
              return (
                <button
                  key={item.effort}
                  type="button"
                  className={`flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-muted ${selected ? "bg-accent text-accent-foreground" : ""}`}
                  onClick={() => onSelectEffort(item.effort)}
                  title={item.effort}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{item.display_name}</span>
                  {item.is_default && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">Default</span>
                  )}
                  <span className="max-w-20 truncate text-[11px] text-muted-foreground">{item.effort}</span>
                  {selected && <CheckLine className="size-4 shrink-0 text-primary" />}
                </button>
              );
            })
          ) : (
            <div className="flex h-full min-h-24 items-center justify-center px-4 text-center text-sm text-muted-foreground">
              No reasoning options
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
