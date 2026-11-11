import { useEffect, useState } from "react";
import {
  RiCpuLine,
  RiAddLine,
  RiEditLine,
  RiLoader4Line,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { models as modelsApi } from "../../api/client";
import { useToast } from "../ui/toast";
import { invalidateModels } from "../../lib/query-cache";
import { generateDisplayName } from "../../lib/model-name";
import { modelCategories } from "../../lib/model-modality";
import type {
  Model,
  ModelBillingType,
  ModelMetadataInput,
  PricingTier,
  ProviderBillingType,
  ThinkOpeningTagMode,
} from "../../types";
import {
  defaultPricingTiers,
  emptyModelMetadata,
  modelFormTabsFor,
  catalogPriceDescription,
  type ModelModalProps,
  type ModelTabId,
} from "./types";
import { ModelNavigation } from "./ModelNavigation";
import { ModelPreviewCard } from "./ModelPreviewCard";
import { GeneralTab } from "./GeneralTab";
import { GenerationTab } from "./GenerationTab";
import { CapabilitiesTab } from "./CapabilitiesTab";
import { OutputFixesTab } from "./OutputFixesTab";
import { PricingTab } from "./PricingTab";

export function ModelModal({
  isOpen,
  onClose,
  onSuccess,
  mode,
  model = null,
  providerId,
  providerBillingType,
}: ModelModalProps) {
  const isEdit = mode === "edit" || (mode === undefined && model !== null);
  const effectiveProviderBilling =
    providerBillingType ?? model?.effective_billing_type ?? "pay_as_you_go";

  const { success, error: notifyError } = useToast();

  const [modelId, setModelId] = useState("");
  const [prettyId, setPrettyId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [displayEdited, setDisplayEdited] = useState(false);
  const [thinkOpeningTagMode, setThinkOpeningTagMode] =
    useState<ThinkOpeningTagMode>("off");
  const [billingType, setBillingType] = useState<ModelBillingType>("inherit");
  const [metadata, setMetadata] = useState<ModelMetadataInput>(() =>
    emptyModelMetadata(),
  );
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>(() =>
    defaultPricingTiers(),
  );
  const [pricingEdited, setPricingEdited] = useState(false);
  const [useLiteLLMPricing, setUseLiteLLMPricing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ModelTabId>("general");

  // Check whether chat-specific output fixes apply
  const showOutputFixes = modelCategories({
    model_id: modelId || model?.model_id,
    display_name: displayName || model?.display_name,
    capabilities: metadata.capabilities,
  }).includes("chat");

  const tabs = modelFormTabsFor(showOutputFixes);

  useEffect(() => {
    if (!showOutputFixes && activeTab === "output-fixes") {
      setActiveTab("general");
    }
  }, [showOutputFixes, activeTab]);

  // Synchronize state when opened or when target model changes
  useEffect(() => {
    if (!isOpen) return;

    if (isEdit && model) {
      const defaultEffortIndex = Math.max(
        0,
        (model.reasoning_efforts ?? []).findIndex((effort) => effort.is_default),
      );
      setModelId(model.model_id);
      setPrettyId(model.pretty_id ?? "");
      setDisplayName(model.display_name ?? generateDisplayName(model.model_id));
      setDisplayEdited(Boolean(model.display_name));
      setThinkOpeningTagMode(
        model.think_opening_tag_mode ??
          (model.fix_missing_think_opening_tag ? "detect" : "off"),
      );
      setBillingType(model.billing_type ?? "inherit");
      setUseLiteLLMPricing(model.use_litellm_pricing === 1);
      setPricingEdited(false);
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
          : defaultPricingTiers(),
      );
      setError(null);
      setActiveTab("general");
    } else {
      // Create mode initial reset
      setModelId("");
      setPrettyId("");
      setDisplayName("");
      setDisplayEdited(false);
      setThinkOpeningTagMode("off");
      setBillingType("inherit");
      setMetadata(emptyModelMetadata());
      setPricingTiers(defaultPricingTiers());
      setPricingEdited(false);
      setUseLiteLLMPricing(false);
      setError(null);
      setActiveTab("general");
    }
  }, [isOpen, isEdit, model]);

  const handleClose = () => {
    if (loading) return;
    setError(null);
    onClose();
  };

  const submit = async () => {
    const trimmedId = modelId.trim();
    if (!trimmedId) {
      setError("Model ID is required.");
      setActiveTab("general");
      return;
    }

    if (
      metadata.reasoning_efforts.length > 0 &&
      metadata.reasoning_efforts.filter((effort) => effort.is_default).length !== 1
    ) {
      setError("Select exactly one default reasoning effort.");
      setActiveTab("capabilities");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isEdit && model) {
        await modelsApi.update(model.id, {
          model_id: trimmedId,
          pretty_id: prettyId.trim() || null,
          display_name: displayName || null,
          think_opening_tag_mode: thinkOpeningTagMode,
          pricing_tiers: pricingEdited ? pricingTiers : undefined,
          use_litellm_pricing: useLiteLLMPricing,
          billing_type: billingType,
          ...metadata,
        });
        invalidateModels(model.provider_id);
        success("Model updated", `${displayName || trimmedId} has been updated.`);
      } else {
        const targetProviderId = providerId || model?.provider_id;
        if (!targetProviderId) {
          throw new Error("Missing provider ID to create model.");
        }
        await modelsApi.create(targetProviderId, {
          model_id: trimmedId,
          pretty_id: prettyId.trim() || null,
          display_name: displayName || undefined,
          think_opening_tag_mode: thinkOpeningTagMode,
          billing_type: billingType,
          pricing_tiers: pricingTiers,
          ...metadata,
        });
        invalidateModels(targetProviderId);
        success("Model added", `${displayName || trimmedId} was added to this provider.`);
      }

      onSuccess();
      handleClose();
    } catch (e: any) {
      setError(e.message);
      notifyError(isEdit ? "Could not update model" : "Could not add model", e.message);
    } finally {
      setLoading(false);
    }
  };

  const catalogPricingText =
    model?.catalog_pricing ? catalogPriceDescription(model.catalog_pricing) : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-5xl md:max-w-6xl lg:max-w-[1150px] h-[86vh] max-h-[760px] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-3.5 shrink-0 bg-background">
          <div className="flex items-center gap-3 min-w-0">
            {isEdit ? (
              <RiEditLine className="size-5 text-foreground shrink-0" />
            ) : (
              <RiAddLine className="size-5 text-foreground shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-sm font-normal text-foreground">
                  {isEdit ? "Edit model" : "Add model"}
                </DialogTitle>
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] px-1.5 py-0 border-border text-muted-foreground font-normal"
                >
                  {isEdit ? "Edit" : "New"}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground truncate">
                {isEdit
                  ? `Configure parameters, tokens, and billing for ${model?.model_id}`
                  : "Add a model and configure its capabilities, limits, and pricing."}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* 2-Column Content Body */}
        <div className="grid flex-1 grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden">
          {/* Left Column: Navigation Tabs & Live Preview */}
          <div className="flex flex-col md:col-span-5 lg:col-span-4 border-r border-border p-5 min-h-0 overflow-y-auto bg-muted/10 justify-between space-y-4">
            <div className="space-y-3">
              <div className="text-xs font-normal text-muted-foreground px-1">
                Sections
              </div>
              <ModelNavigation
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />
            </div>

            {/* Live Model Preview Card */}
            <div className="pt-2">
              <ModelPreviewCard
                modelId={modelId}
                prettyId={prettyId}
                displayName={displayName}
                billingType={billingType}
                providerBillingType={effectiveProviderBilling}
                metadata={metadata}
                pricingTiers={pricingTiers}
                useLiteLLMPricing={useLiteLLMPricing}
                catalogPricingRate={catalogPricingText}
                thinkOpeningTagMode={thinkOpeningTagMode}
              />
            </div>
          </div>

          {/* Right Column: Active Tab Content & Action Footer */}
          <div className="flex flex-col md:col-span-7 lg:col-span-8 p-6 min-h-0 overflow-hidden bg-background justify-between">
            {/* Scrollable Tab Panel */}
            <div className="min-h-0 flex-1 overflow-y-auto pr-2 space-y-4">
              {activeTab === "general" && (
                <GeneralTab
                  modelId={modelId}
                  onModelIdChange={setModelId}
                  prettyId={prettyId}
                  onPrettyIdChange={setPrettyId}
                  displayName={displayName}
                  onDisplayNameChange={setDisplayName}
                  displayEdited={displayEdited}
                  onDisplayEditedChange={setDisplayEdited}
                  isEditMode={isEdit}
                />
              )}

              {activeTab === "generation" && (
                <GenerationTab
                  value={metadata}
                  onChange={setMetadata}
                  modelIdentity={`${modelId} ${displayName}`}
                />
              )}

              {activeTab === "capabilities" && (
                <CapabilitiesTab
                  value={metadata}
                  onChange={setMetadata}
                  source={model?.metadata_source}
                />
              )}

              {activeTab === "output-fixes" && (
                <OutputFixesTab
                  value={thinkOpeningTagMode}
                  onChange={setThinkOpeningTagMode}
                />
              )}

              {activeTab === "pricing" && (
                <PricingTab
                  billingType={billingType}
                  onBillingTypeChange={setBillingType}
                  providerBillingType={effectiveProviderBilling}
                  pricingTiers={pricingTiers}
                  onPricingTiersChange={setPricingTiers}
                  useLiteLLMPricing={useLiteLLMPricing}
                  onUseLiteLLMPricingChange={setUseLiteLLMPricing}
                  isEditMode={isEdit}
                  model={model}
                  onPricingEdited={() => setPricingEdited(true)}
                />
              )}

              {error && (
                <Alert variant="destructive" className="mt-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>

            {/* Modal Bottom Footer */}
            <div className="border-t border-border pt-4 mt-3 flex items-center justify-between shrink-0">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span className="font-normal capitalize text-foreground">
                  {tabs.find((t) => t.id === activeTab)?.label}
                </span>
                <span className="text-tertiary">/</span>
                <span>Section {tabs.findIndex((t) => t.id === activeTab) + 1} of {tabs.length}</span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClose}
                  disabled={loading}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={submit}
                  disabled={loading}
                  className="h-8 text-xs gap-1.5"
                >
                  {loading && <RiLoader4Line className="size-3.5 animate-spin" />}
                  <span>
                    {loading
                      ? "Saving..."
                      : isEdit
                        ? "Save changes"
                        : "Save model"}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ModelModal;
