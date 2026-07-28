import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs } from "@/components/ui/tabs";
import { models } from "../api/client";
import { useToast } from "./ui/toast";
import type {
  ModelCapabilities,
  ModelMetadataInput,
  PricingTier,
  ReasoningEffort,
} from "../types";
import { generateDisplayName } from "../lib/model-name";

export default function AddModelModal({
  isOpen,
  onClose,
  onSuccess,
  providerId,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  providerId: string;
}) {
  const { success, error: notifyError } = useToast();
  const [modelId, setModelId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displayEdited, setDisplayEdited] = useState(false);
  const [metadata, setMetadata] = useState<ModelMetadataInput>(() =>
    emptyModelMetadata(),
  );
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([
    {
      threshold_tokens: 0,
      input_per_million: 0,
      output_per_million: 0,
      cache_read_per_million: 0,
      cache_write_per_million: 0,
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("general");
  const close = () => {
    if (loading) return;
    setModelId("");
    setDisplayName("");
    setDisplayEdited(false);
    setMetadata(emptyModelMetadata());
    setPricingTiers([
      {
        threshold_tokens: 0,
        input_per_million: 0,
        output_per_million: 0,
        cache_read_per_million: 0,
        cache_write_per_million: 0,
      },
    ]);
    setError(null);
    setActiveTab("general");
    onClose();
  };
  const updateTier = (index: number, field: keyof PricingTier, value: string) =>
    setPricingTiers((tiers) =>
      tiers.map((tier, i) =>
        i === index ? { ...tier, [field]: Number(value) || 0 } : tier,
      ),
    );
  const submit = async () => {
    if (!modelId.trim()) return setError("Model ID is required.");
    if (
      metadata.reasoning_efforts.length > 0 &&
      metadata.reasoning_efforts.filter((effort) => effort.is_default)
        .length !== 1
    )
      return setError("Select exactly one default reasoning effort.");
    setLoading(true);
    try {
      await models.create(providerId, {
        model_id: modelId.trim(),
        display_name: displayName || undefined,
        pricing_tiers: pricingTiers,
        ...metadata,
      });
      success("Model added");
      onSuccess();
      close();
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not add model", e.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="overflow-visible sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add model</DialogTitle>
          <DialogDescription>
            Add a model and its pricing to this provider.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          tabs={modelFormTabs}
          active={activeTab}
          onChange={setActiveTab}
          className="-mx-1 overflow-x-auto px-1"
        />
        <div className="min-w-0 min-h-[27rem] max-h-[64vh] overflow-y-auto overflow-x-hidden pr-1">
          {activeTab === "general" && (
            <div className="space-y-5 py-1">
              <div>
                <div className="text-sm font-medium">Model identity</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upstream identifier and friendly name shown in Klove.
                </p>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="model-id">Model ID</Label>
              <Input
                className="h-10 bg-muted/30 dark:bg-muted/30"
                id="model-id"
                value={modelId}
                onChange={(e) => {
                  const value = e.target.value;
                  setModelId(value);
                  if (!displayEdited)
                    setDisplayName(generateDisplayName(value));
                }}
                placeholder="gpt-4o"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="model-display">Display name</Label>
              <Input
                className="h-10 bg-muted/30 dark:bg-muted/30"
                id="model-display"
                value={displayName}
                onChange={(e) => {
                  setDisplayEdited(true);
                  setDisplayName(e.target.value);
                }}
                placeholder="Auto-generated from model ID"
              />
            </div>
              </div>
            </div>
          )}
          {activeTab === "capabilities" && (
            <ModelMetadataEditor value={metadata} onChange={setMetadata} />
          )}
          {activeTab === "pricing" && (
            <PricingEditor
              tiers={pricingTiers}
              updateTier={updateTier}
              setTiers={setPricingTiers}
            />
          )}
          {error && (
            <Alert variant="destructive" className="mt-5">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? "Saving..." : "Save model"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const modelFormTabs = [
  { id: "general", label: "General" },
  { id: "capabilities", label: "Capabilities" },
  { id: "pricing", label: "Pricing" },
];

const capabilityLabels: Record<keyof ModelCapabilities, string> = {
  reasoning: "Reasoning",
  tools: "Tools",
  vision: "Vision",
  attachments: "Attachments",
  streaming: "Streaming",
  non_streaming: "Non-streaming",
};

export function emptyModelMetadata(): ModelMetadataInput {
  return {
    context_window: null,
    max_output_tokens: null,
    capabilities: {
      reasoning: null,
      tools: null,
      vision: null,
      attachments: null,
      streaming: null,
      non_streaming: null,
    },
    reasoning_efforts: [],
  };
}

export function ModelMetadataEditor({
  value,
  onChange,
}: {
  value: ModelMetadataInput;
  onChange: (value: ModelMetadataInput) => void;
}) {
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
    if (removedDefault && remaining.length) remaining[0] = { ...remaining[0], is_default: true };
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

  return (
    <div className="space-y-5 py-1">
      <div>
        <div className="text-sm font-medium">Model metadata</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Limits, request modes, and reasoning options exposed to clients.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Context window</Label>
          <Input type="number" min="0" placeholder="Unknown" value={value.context_window ?? ""} onChange={(event) => setLimit("context_window", event.target.value)} />
          <p className="text-xs text-muted-foreground">Maximum total tokens</p>
        </div>
        <div className="space-y-2">
          <Label>Maximum output</Label>
          <Input type="number" min="0" placeholder="Unknown" value={value.max_output_tokens ?? ""} onChange={(event) => setLimit("max_output_tokens", event.target.value)} />
          <p className="text-xs text-muted-foreground">Maximum generated tokens</p>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <Label>Capabilities</Label>
          <p className="mt-1 text-xs text-muted-foreground">Click to cycle Unknown, Supported, and Unsupported.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(capabilityLabels) as (keyof ModelCapabilities)[]).map((key) => {
            const state = value.capabilities[key];
            return (
              <button
                key={key}
                type="button"
                className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors ${state === true ? "border-primary/50 bg-primary/10" : state === false ? "bg-muted/50 text-muted-foreground" : "border-dashed"}`}
                onClick={() => setCapability(key)}
                aria-label={`${capabilityLabels[key]}: ${state === null ? "unknown" : state ? "supported" : "unsupported"}`}
              >
                <span>{capabilityLabels[key]}</span>
                <span className="text-xs font-medium">{state === null ? "Unknown" : state ? "Yes" : "No"}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label>Reasoning efforts</Label>
            <p className="mt-1 text-xs text-muted-foreground">Map client effort names to provider values. One row must be default.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addEffort}>+ Add effort</Button>
        </div>
        {value.reasoning_efforts.map((effort, index) => (
          <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_1fr_5.5rem_auto]">
            <Input aria-label="Effort" placeholder="Effort" value={effort.effort} onChange={(event) => updateEffort(index, "effort", event.target.value)} />
            <Input aria-label="Display name" placeholder="Display name" value={effort.display_name} onChange={(event) => updateEffort(index, "display_name", event.target.value)} />
            <Input aria-label="Upstream value" placeholder="Upstream value" value={effort.upstream_value} onChange={(event) => updateEffort(index, "upstream_value", event.target.value)} />
            <Input aria-label="Sort order" type="number" placeholder="Order" value={effort.sort_order} onChange={(event) => updateEffort(index, "sort_order", Number(event.target.value) || 0)} />
            <div className="flex items-center gap-1">
              <Button type="button" size="sm" variant={effort.is_default ? "default" : "outline"} onClick={() => setDefault(index)}>{effort.is_default ? "Default" : "Set default"}</Button>
              <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeEffort(index)}>Remove</Button>
            </div>
          </div>
        ))}
        {!value.reasoning_efforts.length && <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No reasoning efforts configured.</p>}
      </div>
    </div>
  );
}

export function PricingEditor({
  tiers,
  updateTier,
  setTiers,
}: {
  tiers: PricingTier[];
  updateTier: (index: number, field: keyof PricingTier, value: string) => void;
  setTiers: Dispatch<SetStateAction<PricingTier[]>>;
}) {
  const [activeTier, setActiveTier] = useState(0);
  const selectedTier = Math.min(activeTier, Math.max(0, tiers.length - 1));
  const currentTier = tiers[selectedTier];
  const addTier = () => {
    setTiers((items) => [
      ...items,
      {
        threshold_tokens: (items.at(-1)?.threshold_tokens ?? 0) + 1_000_000,
        input_per_million: 0,
        output_per_million: 0,
        cache_read_per_million: 0,
        cache_write_per_million: 0,
      },
    ]);
    setActiveTier(tiers.length);
  };
  const removeTier = () => {
    if (tiers.length <= 1) return;
    setTiers((items) => items.filter((_, index) => index !== selectedTier));
    setActiveTier(Math.max(0, Math.min(selectedTier, tiers.length - 2)));
  };
  const thresholdLabel = (value: number) =>
    value === 0 ? "Base" : `${(value / 1_000_000).toLocaleString()}M+`;
  if (!currentTier) return null;
  return (
    <div className="min-w-0 space-y-5 py-1">
      <div>
        <div className="text-sm font-medium">Pricing per 1M tokens</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Create a pricing tab for each input-token range. The closest range
          below the request size is applied.
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto border-b border-border/60 pb-2">
        {tiers.map((tier, index) => (
          <button
            key={index}
            type="button"
            className={`shrink-0 rounded-md px-3 py-2 text-sm transition-colors ${index === selectedTier ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            onClick={() => setActiveTier(index)}
          >
            Tier {index + 1}
            <span
              className={`ml-1.5 text-xs ${index === selectedTier ? "text-primary-foreground/75" : "text-muted-foreground"}`}
            >
              {thresholdLabel(tier.threshold_tokens)}
            </span>
          </button>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={addTier}
        >
          + Add tier
        </Button>
      </div>
      <div className="min-w-0 space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <Label>Input threshold</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Minimum input tokens for this pricing tier.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={removeTier}
            disabled={tiers.length <= 1}
          >
            Remove tier
          </Button>
        </div>
        <Input
          className="h-10 w-full bg-muted/30 dark:bg-muted/30"
          type="number"
          min="0"
          value={currentTier.threshold_tokens}
          onChange={(e) =>
            updateTier(selectedTier, "threshold_tokens", e.target.value)
          }
        />
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <PriceField
            label="Input price"
            value={currentTier.input_per_million}
            onChange={(value) =>
              updateTier(selectedTier, "input_per_million", value)
            }
          />
          <PriceField
            label="Output price"
            value={currentTier.output_per_million}
            onChange={(value) =>
              updateTier(selectedTier, "output_per_million", value)
            }
          />
          <PriceField
            label="Cache read price"
            value={currentTier.cache_read_per_million}
            onChange={(value) =>
              updateTier(selectedTier, "cache_read_per_million", value)
            }
          />
          <PriceField
            label="Cache write price"
            value={currentTier.cache_write_per_million}
            onChange={(value) =>
              updateTier(selectedTier, "cache_write_per_million", value)
            }
          />
        </div>
      </div>
    </div>
  );
}

function PriceField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label>{label}</Label>
      <div className="relative min-w-0">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
          $
        </span>
        <Input
          className="h-10 w-full bg-muted/30 pl-7 dark:bg-muted/30"
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <p className="text-xs text-muted-foreground">USD per 1M tokens</p>
    </div>
  );
}
