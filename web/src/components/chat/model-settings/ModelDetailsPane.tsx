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
      <span className="shrink-0 text-tertiary">{label}</span>
      <span className="min-w-0 truncate font-normal text-foreground" title={title ?? value}>{value}</span>
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
    <section className="flex min-h-0 min-w-0 flex-col bg-background/60" aria-label="Model details and reasoning effort">
      <div className="shrink-0 border-b border-border px-4 pt-4 pb-3">
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
            <h3 className="truncate text-sm font-normal text-foreground">
              {model?.display_name || (model ? modelDisplayId(model) : "No model selected")}
            </h3>
            <p className="mt-0.5 truncate text-xs text-tertiary">
              {model?.provider_name || "Select a model to view its details"}
            </p>
          </div>
        </div>

        {model && (
          <div className="mt-3">
            <DetailRow label="Model ID" value={modelDisplayId(model)} />
            <DetailRow label="Context" value={formatTokens(model.context_window)} />
            <DetailRow
              label="Max output"
              value={`${formatTokens(model.max_output_tokens)} (${model.max_output_tokens_source})`}
              title={model.max_output_tokens_is_default ? "Automatic default; configure manually to override" : undefined}
            />
            {model.max_output_tokens_is_default && (
              <p className="mt-1 text-[11px] text-tertiary">Automatic default; configure manually to override.</p>
            )}
            <DetailRow label="Capabilities" value={capabilities || "—"} title={capabilities || "No capabilities reported"} />
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-1.5 pb-3">
        <div className="flex shrink-0 items-center justify-between gap-3 px-2.5 pt-3 pb-2">
          <div>
            <h3 className="text-xs font-normal text-tertiary">Reasoning effort</h3>
            <p className="mt-0.5 text-xs text-tertiary/80">Thinking depth</p>
          </div>
          {efforts.length > 0 && (
            <span className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] tabular-nums text-tertiary">
              {efforts.length}
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {efforts.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {efforts.map((item) => {
                const selected = item.effort === selectedEffort?.effort;
                return (
                  <button
                    key={item.effort}
                    type="button"
                    className={`flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors ${selected ? "bg-accent text-foreground" : "hover:bg-accent/60"}`}
                    onClick={() => onSelectEffort(item.effort)}
                    title={item.effort}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.display_name}</span>
                    {item.is_default && (
                      <span className="shrink-0 text-[10px] text-tertiary">Default</span>
                    )}
                    <span className="max-w-20 truncate text-[11px] text-tertiary">{item.effort}</span>
                    {selected && <CheckLine className="size-4 shrink-0 text-foreground" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full min-h-24 items-center justify-center px-4 text-center text-sm text-tertiary">
              No reasoning options
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
