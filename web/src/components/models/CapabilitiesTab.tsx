import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  capabilityLabels,
  mediaCapabilityKeys,
} from "./types";
import type {
  MetadataSource,
  ModelCapabilities,
  ModelMetadataInput,
  ReasoningEffort,
} from "../../types";

interface CapabilitiesTabProps {
  value: ModelMetadataInput;
  onChange: (value: ModelMetadataInput) => void;
  source?: MetadataSource | null;
}

export function CapabilitiesTab({
  value,
  onChange,
  source,
}: CapabilitiesTabProps) {
  const litellmValues = [
    source?.context_window,
    source?.max_output_tokens,
    source?.reasoning_efforts,
    ...Object.values(source?.capabilities ?? {}),
  ].filter(Boolean);
  const hasLiteLLM = litellmValues.includes("litellm");

  const setLimit = (
    field: "context_window" | "max_output_tokens",
    raw: string,
  ) =>
    onChange({
      ...value,
      [field]: raw === "" ? null : Math.max(0, Number(raw)),
    });

  const setCapability = (key: keyof ModelCapabilities) => {
    const current = value.capabilities[key];
    onChange({
      ...value,
      capabilities: {
        ...value.capabilities,
        [key]: current === null ? true : current ? false : null,
      },
    });
  };

  const updateEffort = (
    index: number,
    field: keyof ReasoningEffort,
    nextValue: string | number,
  ) =>
    onChange({
      ...value,
      reasoning_efforts: value.reasoning_efforts.map((effort, itemIndex) =>
        itemIndex === index ? { ...effort, [field]: nextValue } : effort,
      ),
    });

  const addEffort = () => {
    const index = value.reasoning_efforts.length;
    onChange({
      ...value,
      reasoning_efforts: [
        ...value.reasoning_efforts,
        {
          effort: "",
          display_name: "",
          upstream_value: "",
          sort_order: index,
          is_default: index === 0,
        },
      ],
    });
  };

  const removeEffort = (index: number) => {
    const removedDefault = value.reasoning_efforts[index]?.is_default;
    const remaining = value.reasoning_efforts.filter((_, i) => i !== index);
    if (removedDefault && remaining.length) {
      remaining[0] = { ...remaining[0], is_default: true };
    }
    onChange({ ...value, reasoning_efforts: remaining });
  };

  const setDefault = (index: number) =>
    onChange({
      ...value,
      reasoning_efforts: value.reasoning_efforts.map((effort, itemIndex) => ({
        ...effort,
        is_default: itemIndex === index,
      })),
    });

  const nonMediaCapabilityKeys = Object.keys(capabilityLabels) as Exclude<
    keyof ModelCapabilities,
    (typeof mediaCapabilityKeys)[number]
  >[];

  return (
    <div className="space-y-5 py-1">
      <div>
        <h3 className="text-sm font-normal text-foreground">
          Model limits & capabilities
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Context window, token limits, and supported input/output formats exposed to clients.
        </p>
        {hasLiteLLM && (
          <p className="mt-2 rounded-lg border border-dashed border-border bg-muted/20 p-2.5 text-[11px] text-muted-foreground">
            Some limits are populated from the public LiteLLM catalog. Editing any field saves a permanent manual override.
          </p>
        )}
      </div>

      {/* Token Limits */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 rounded-lg border border-border bg-card p-3">
          <Label className="text-xs font-normal">Context Window (tokens)</Label>
          <Input
            type="number"
            min="0"
            className="h-8 font-mono text-xs"
            placeholder="e.g. 128000 (Unknown)"
            value={value.context_window ?? ""}
            onChange={(event) => setLimit("context_window", event.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Maximum total request + response context length.
          </p>
        </div>

        <div className="space-y-1.5 rounded-lg border border-border bg-card p-3">
          <Label className="text-xs font-normal">Maximum Output (tokens)</Label>
          <Input
            type="number"
            min="0"
            className="h-8 font-mono text-xs"
            placeholder="e.g. 4096 (Unknown)"
            value={value.max_output_tokens ?? ""}
            onChange={(event) => setLimit("max_output_tokens", event.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Maximum tokens this model can generate per completion.
          </p>
        </div>
      </div>

      {/* Capabilities toggles */}
      <div className="space-y-2">
        <div>
          <Label className="text-xs font-normal">Feature flags</Label>
          <p className="text-[11px] text-muted-foreground">
            Click any badge to cycle: <span className="text-tertiary">Unknown</span> → <span className="text-primary font-normal">Supported</span> → <span className="text-muted-foreground">Unsupported</span>
          </p>
        </div>

        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
          {nonMediaCapabilityKeys.map((key) => {
            const state = value.capabilities[key];
            return (
              <button
                key={key}
                type="button"
                className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                  state === true
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : state === false
                      ? "border-border bg-muted/20 text-muted-foreground opacity-60"
                      : "border-dashed border-border bg-card text-muted-foreground hover:bg-accent/50"
                }`}
                onClick={() => setCapability(key)}
                aria-label={`${capabilityLabels[key]}: ${state === null ? "unknown" : state ? "supported" : "unsupported"}`}
              >
                <span className="truncate pr-1">{capabilityLabels[key]}</span>
                <span className="shrink-0 text-[10px] font-mono text-muted-foreground font-normal">
                  {state === null ? "Auto" : state ? "Yes" : "No"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Reasoning Efforts */}
      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-xs font-normal">Reasoning efforts mapping</Label>
            <p className="text-[11px] text-muted-foreground">
              Map client reasoning effort values (low, medium, high) to provider parameters. One must be marked default.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs shrink-0"
            onClick={addEffort}
          >
            + Add effort
          </Button>
        </div>

        {value.reasoning_efforts.map((effort, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-lg border border-border bg-card p-2.5 sm:grid-cols-[1fr_1fr_1fr_4.5rem_auto] items-center"
          >
            <Input
              aria-label="Effort"
              placeholder="Effort (e.g. high)"
              className="h-8 text-xs font-mono"
              value={effort.effort}
              onChange={(event) => updateEffort(index, "effort", event.target.value)}
            />
            <Input
              aria-label="Display name"
              placeholder="Display name"
              className="h-8 text-xs"
              value={effort.display_name}
              onChange={(event) =>
                updateEffort(index, "display_name", event.target.value)
              }
            />
            <Input
              aria-label="Upstream value"
              placeholder="Upstream value"
              className="h-8 text-xs font-mono"
              value={effort.upstream_value}
              onChange={(event) =>
                updateEffort(index, "upstream_value", event.target.value)
              }
            />
            <Input
              aria-label="Sort order"
              type="number"
              placeholder="Order"
              className="h-8 text-xs text-center font-mono"
              value={effort.sort_order}
              onChange={(event) =>
                updateEffort(index, "sort_order", Number(event.target.value) || 0)
              }
            />
            <div className="flex items-center gap-1 shrink-0">
              <Button
                type="button"
                size="sm"
                variant={effort.is_default ? "default" : "outline"}
                className="h-8 text-xs px-2.5"
                onClick={() => setDefault(index)}
              >
                {effort.is_default ? "Default" : "Set default"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs px-2 text-destructive hover:text-destructive"
                onClick={() => removeEffort(index)}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}

        {!value.reasoning_efforts.length && (
          <p className="rounded-lg border border-dashed border-border bg-card p-3 text-center text-xs text-muted-foreground">
            No reasoning efforts configured. Leave blank for standard non-reasoning models.
          </p>
        )}
      </div>
    </div>
  );
}
