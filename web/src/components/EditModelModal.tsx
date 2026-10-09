import { useEffect, useState } from "react";
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
import type { Model, ModelMetadataInput } from "../types";
import { useToast } from "./ui/toast";
import {
  emptyModelMetadata,
  MediaSettingsEditor,
  ModelMetadataEditor,
  modelFormTabsFor,
  PricingEditor,
  ThinkTagModeEditor,
} from "./AddModelModal";
import type { PricingTier } from "../types";
import { generateDisplayName } from "../lib/model-name";
import { invalidateModels } from "../lib/query-cache";
import { Switch } from "@/components/ui/switch";
import type { CatalogPricing } from "../types";
import { modelCategories } from "../lib/model-modality";

const formatUsd = (value: number) => new Intl.NumberFormat(undefined, {
  style: "currency", currency: "USD", maximumFractionDigits: 6,
}).format(value);

function catalogPriceDescription(price: CatalogPricing): string {
  return price.rates.map((rate) => `${rate.label}: ${formatUsd(rate.display_usd)} / ${rate.display_unit}`).join(" · ");
}

export default function EditModelModal({
  isOpen,
  model,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  model: Model | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { success, error: notifyError } = useToast();
  const [modelId, setModelId] = useState("");
  const [prettyId, setPrettyId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displayEdited, setDisplayEdited] = useState(false);
  const [thinkOpeningTagMode, setThinkOpeningTagMode] =
    useState<import("../types").ThinkOpeningTagMode>("off");
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [pricingEdited, setPricingEdited] = useState(false);
  const [useLiteLLMPricing, setUseLiteLLMPricing] = useState(false);
  const [metadata, setMetadata] = useState<ModelMetadataInput>(() =>
    emptyModelMetadata(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("general");
  const showOutputFixes = modelCategories({ model_id: modelId || model?.model_id, display_name: displayName || model?.display_name, capabilities: metadata.capabilities }).includes("chat");
  const tabs = modelFormTabsFor(showOutputFixes);
  useEffect(() => {
    if (!showOutputFixes && activeTab === "output-fixes") setActiveTab("generation");
  }, [showOutputFixes, activeTab]);
  useEffect(() => {
    if (model) {
      const defaultEffortIndex = Math.max(
        0,
        (model.reasoning_efforts ?? []).findIndex((effort) => effort.is_default),
      );
      setModelId(model.model_id);
      setPricingEdited(false);
      setUseLiteLLMPricing(model.use_litellm_pricing === 1);
      setPrettyId(model.pretty_id ?? "");
      setDisplayName(model.display_name ?? generateDisplayName(model.model_id));
      setDisplayEdited(Boolean(model.display_name));
      setThinkOpeningTagMode(
        model.think_opening_tag_mode ??
          (model.fix_missing_think_opening_tag ? "detect" : "off"),
      );
      setMetadata({
        context_window: model.context_window ?? null,
        max_output_tokens: model.max_output_tokens ?? null,
        capabilities: {
          ...emptyModelMetadata().capabilities,
          ...(model.capabilities ?? {}),
        },
        reasoning_efforts: (model.reasoning_efforts ?? []).map(
          (effort, index) => ({
            ...effort,
            is_default: index === defaultEffortIndex,
          }),
        ),
        media_settings: model.media_settings ?? {},
      });
      setPricingTiers(
        model.pricing_tiers?.length
          ? model.pricing_tiers
          : [
              {
                threshold_tokens: 0,
                input_per_million: 0,
                output_per_million: 0,
                cache_read_per_million: 0,
                cache_write_per_million: 0,
              },
            ],
      );
      setError(null);
      setActiveTab("general");
    }
  }, [model]);
  const updateTier = (index: number, field: keyof PricingTier, value: string) =>
    (setPricingEdited(true), setPricingTiers((tiers) =>
      tiers.map((tier, i) =>
        i === index ? { ...tier, [field]: Number(value) || 0 } : tier,
      ),
    ));
  const submit = async () => {
    if (!model || !modelId.trim()) return setError("Model ID is required.");
    if (
      metadata.reasoning_efforts.length > 0 &&
      metadata.reasoning_efforts.filter((effort) => effort.is_default)
        .length !== 1
    )
      return setError("Select exactly one default reasoning effort.");
    setLoading(true);
    try {
      await models.update(model.id, {
        model_id: modelId.trim(),
        pretty_id: prettyId.trim() || null,
        display_name: displayName || null,
        think_opening_tag_mode: thinkOpeningTagMode,
        pricing_tiers: model.pricing_source === "litellm" && !pricingEdited ? undefined : pricingTiers,
        use_litellm_pricing: useLiteLLMPricing,
        ...metadata,
      });
      invalidateModels(model.provider_id);
      success("Model updated");
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message);
      notifyError("Could not update model", e.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="overflow-visible sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit model</DialogTitle>
          <DialogDescription>
            Update model identity, capabilities, limits, and pricing.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          tabs={tabs}
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
              <Label htmlFor="edit-model-id">Model ID</Label>
              <Input
                className="h-10 bg-muted/30 dark:bg-muted/30"
                id="edit-model-id"
                value={modelId}
                onChange={(e) => {
                  const value = e.target.value;
                  setModelId(value);
                  if (!displayEdited)
                    setDisplayName(generateDisplayName(value));
                }}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="edit-model-pretty">Pretty ID (optional)</Label>
              <Input className="h-10 bg-muted/30 dark:bg-muted/30" id="edit-model-pretty" value={prettyId} onChange={(e) => setPrettyId(e.target.value)} placeholder="friendly-model" />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="edit-model-display">Display name</Label>
              <Input
                className="h-10 bg-muted/30 dark:bg-muted/30"
                id="edit-model-display"
                value={displayName}
                onChange={(e) => {
                  setDisplayEdited(true);
                  setDisplayName(e.target.value);
                }}
              />
            </div>
              </div>
            </div>
          )}
          {activeTab === "capabilities" && (
            <ModelMetadataEditor value={metadata} onChange={setMetadata} />
          )}
          {activeTab === "generation" && (
            <MediaSettingsEditor value={metadata} onChange={setMetadata} />
          )}
          {activeTab === "output-fixes" && (
            <ThinkTagModeEditor
              value={thinkOpeningTagMode}
              onChange={setThinkOpeningTagMode}
            />
          )}
          {activeTab === "pricing" && (
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <span className="space-y-1">
                  <span className="block text-sm font-medium">Use LiteLLM catalog pricing</span>
                  <span className="block text-xs text-muted-foreground">Use the public catalog when no custom price is set for this model.</span>
                </span>
                <Switch checked={useLiteLLMPricing} onCheckedChange={setUseLiteLLMPricing} />
              </label>
              {model.catalog_pricing && model.catalog_pricing.billing_unit !== "token" && (
                <div className="rounded-lg border px-3 py-2 text-sm">
                  <span className="font-medium">LiteLLM catalog rate: </span>
                  <span className="text-muted-foreground">{catalogPriceDescription(model.catalog_pricing)}</span>
                </div>
              )}
              <PricingEditor tiers={pricingTiers} updateTier={updateTier} setTiers={(update) => { setPricingEdited(true); setPricingTiers(update); }} />
            </div>
          )}
          {error && (
            <Alert variant="destructive" className="mt-5">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
