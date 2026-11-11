import { useEffect, useState } from "react";
import { RiVipCrownLine, RiCoinsLine, RiCheckLine } from "@remixicon/react";
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
import type { Model, ModelBillingType, ModelMetadataInput } from "../types";
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
  const [billingType, setBillingType] = useState<ModelBillingType>("inherit");
  const [metadata, setMetadata] = useState<ModelMetadataInput>(() =>
    emptyModelMetadata(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("general");
  const showOutputFixes = modelCategories({ model_id: modelId || model?.model_id, display_name: displayName || model?.display_name, capabilities: metadata.capabilities }).includes("chat");
  const tabs = modelFormTabsFor(showOutputFixes);
  const customPricingWillBeReplaced = Boolean(
    model?.pricing_source === "custom" && pricingEdited && pricingTiers.length === 0,
  );
  useEffect(() => {
    if (!showOutputFixes && activeTab === "output-fixes") setActiveTab("capabilities");
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
      setBillingType(model.billing_type ?? "inherit");
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
        pricing_tiers: pricingEdited ? pricingTiers : undefined,
        use_litellm_pricing: useLiteLLMPricing,
        billing_type: billingType,
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
  if (!model) return null;
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
                <div className="text-sm font-normal">Model identity</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upstream identifier and friendly name shown in Saturn.
                </p>
              </div>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="edit-model-id">Model ID</Label>
              <Input
                className="h-9"
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
              <Input className="h-9" id="edit-model-pretty" value={prettyId} onChange={(e) => setPrettyId(e.target.value)} placeholder="friendly-model" />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="edit-model-display">Display name</Label>
              <Input
                className="h-9"
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
            <ModelMetadataEditor value={metadata} onChange={setMetadata} source={model?.metadata_source} />
          )}
          {activeTab === "generation" && (
            <MediaSettingsEditor value={metadata} onChange={setMetadata} modelIdentity={`${modelId} ${displayName}`} />
          )}
          {activeTab === "output-fixes" && (
            <ThinkTagModeEditor
              value={thinkOpeningTagMode}
              onChange={setThinkOpeningTagMode}
            />
          )}
          {activeTab === "pricing" && model && (
            <div className="space-y-4">
              <div className="space-y-2 border-b pb-4">
                <div className="space-y-1">
                  <div className="text-sm font-normal">Billing & Quota Mode</div>
                  <p className="text-xs text-muted-foreground">
                    Configure how usage is accounted. Subscriptions consume quota with $0 direct charge, without applying commercial LiteLLM rates.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => setBillingType("inherit")}
                    className={`flex flex-col items-start rounded-lg border p-2.5 text-left text-xs transition-all cursor-pointer ${
                      billingType === "inherit"
                        ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary"
                        : "border-border bg-card hover:border-border-strong text-muted-foreground"
                    }`}
                  >
                    <span className="font-normal text-foreground">Inherit</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      Provider default ({model.effective_billing_type ?? "pay_as_you_go"})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBillingType("subscription");
                      setUseLiteLLMPricing(false);
                    }}
                    className={`flex flex-col items-start rounded-lg border p-2.5 text-left text-xs transition-all cursor-pointer ${
                      billingType === "subscription"
                        ? "border-purple-500 bg-purple-500/10 text-foreground ring-1 ring-purple-500"
                        : "border-border bg-card hover:border-border-strong text-muted-foreground"
                    }`}
                  >
                    <span className="font-normal text-foreground">Subscription</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">Quota · $0 direct</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingType("pay_as_you_go")}
                    className={`flex flex-col items-start rounded-lg border p-2.5 text-left text-xs transition-all cursor-pointer ${
                      billingType === "pay_as_you_go"
                        ? "border-blue-500 bg-blue-500/10 text-foreground ring-1 ring-blue-500"
                        : "border-border bg-card hover:border-border-strong text-muted-foreground"
                    }`}
                  >
                    <span className="font-normal text-foreground">Pay-As-You-Go</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">Pay per token</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBillingType("free");
                      setUseLiteLLMPricing(false);
                    }}
                    className={`flex flex-col items-start rounded-lg border p-2.5 text-left text-xs transition-all cursor-pointer ${
                      billingType === "free"
                        ? "border-emerald-500 bg-emerald-500/10 text-foreground ring-1 ring-emerald-500"
                        : "border-border bg-card hover:border-border-strong text-muted-foreground"
                    }`}
                  >
                    <span className="font-normal text-foreground">Free</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">Zero cost</span>
                  </button>
                </div>
                {(billingType === "subscription" || (billingType === "inherit" && model.effective_billing_type === "subscription")) && (
                  <p className="rounded-md bg-purple-500/10 p-2.5 text-xs text-purple-700 dark:text-purple-300 leading-relaxed">
                    This model runs as a subscription. Token requests draw from your subscription quota ($0 direct cost) and public LiteLLM rates are excluded.
                  </p>
                )}
              </div>

              {(billingType === "subscription" || (billingType === "inherit" && model.effective_billing_type === "subscription") || billingType === "free" || (billingType === "inherit" && model.effective_billing_type === "free")) ? (
                <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-5 text-center space-y-3">
                  <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">
                    {(billingType === "subscription" || (billingType === "inherit" && model.effective_billing_type === "subscription")) ? (
                      <RiVipCrownLine className="size-5" />
                    ) : (
                      <RiCheckLine className="size-5 text-emerald-500" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-normal text-foreground">
                      {(billingType === "subscription" || (billingType === "inherit" && model.effective_billing_type === "subscription"))
                        ? "Subscription mode active — pricing disabled"
                        : "Free tier active — pricing disabled"}
                    </h4>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                      {(billingType === "subscription" || (billingType === "inherit" && model.effective_billing_type === "subscription"))
                        ? "Token requests on this model consume from your subscription quota with $0 direct per-token API charges. Commercial pricing tables and LiteLLM catalog rates are disabled."
                        : "This model is 100% free ($0.00). Per-token charges and pricing tiers are disabled."}
                    </p>
                  </div>
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setBillingType("pay_as_you_go")}
                      className="text-xs"
                    >
                      Switch to Pay-As-You-Go to configure token prices
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-6 border-b pb-3">
                    <div className="min-w-0 space-y-1">
                      <div className="text-sm font-normal">Use LiteLLM catalog pricing</div>
                      <p className="text-xs text-muted-foreground">Use public catalog rates when available. Custom pricing tiers take precedence.</p>
                    </div>
                    <Switch
                      checked={useLiteLLMPricing}
                      onCheckedChange={setUseLiteLLMPricing}
                      aria-label="Use LiteLLM catalog pricing"
                    />
                  </div>
                  {useLiteLLMPricing && model.pricing_source === "custom" && !customPricingWillBeReplaced && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                        Custom tiers are currently used instead of the catalog rates.
                      </p>
                      {model.catalog_pricing && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPricingEdited(true);
                            setPricingTiers([]);
                          }}
                        >
                          Replace with catalog
                        </Button>
                      )}
                    </div>
                  )}
                  {useLiteLLMPricing && model.catalog_pricing && (model.pricing_source !== "custom" || customPricingWillBeReplaced) && (
                    <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm">
                      <span className="font-normal">Catalog rate: </span>
                      <span className="text-muted-foreground">{catalogPriceDescription(model.catalog_pricing)}</span>
                    </div>
                  )}
                  {useLiteLLMPricing && !model.catalog_pricing && model.use_litellm_pricing === 1 && (
                    <p className="text-xs text-muted-foreground">No matching rate was found in the public catalog for this model.</p>
                  )}
                  {useLiteLLMPricing && !model.catalog_pricing && model.use_litellm_pricing !== 1 && (
                    <p className="text-xs text-muted-foreground">Save changes to look up this model in the public catalog.</p>
                  )}
                  {pricingTiers.length > 0 ? (
                    <PricingEditor
                      tiers={pricingTiers}
                      updateTier={updateTier}
                      setTiers={(update) => { setPricingEdited(true); setPricingTiers(update); }}
                    />
                  ) : (
                    <p className="py-3 text-sm text-muted-foreground">
                      {useLiteLLMPricing && model.catalog_pricing ? "Catalog pricing will be used." : "No custom pricing tiers."}
                    </p>
                  )}
                </>
              )}
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
