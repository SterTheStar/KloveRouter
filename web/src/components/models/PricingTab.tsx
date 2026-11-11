import { useState, type Dispatch, type SetStateAction } from "react";
import {
  RiVipCrownLine,
  RiCheckLine,
  RiCoinsLine,
  RiAddLine,
  RiDeleteBinLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type {
  CatalogPricing,
  Model,
  ModelBillingType,
  PricingTier,
  ProviderBillingType,
} from "../../types";
import { catalogPriceDescription } from "./types";

interface PricingTabProps {
  billingType: ModelBillingType;
  onBillingTypeChange: (type: ModelBillingType) => void;
  providerBillingType?: ProviderBillingType;
  pricingTiers: PricingTier[];
  onPricingTiersChange: Dispatch<SetStateAction<PricingTier[]>>;
  useLiteLLMPricing: boolean;
  onUseLiteLLMPricingChange: (value: boolean) => void;
  isEditMode?: boolean;
  model?: Model | null;
  onPricingEdited?: () => void;
}

export function PricingTab({
  billingType,
  onBillingTypeChange,
  providerBillingType,
  pricingTiers,
  onPricingTiersChange,
  useLiteLLMPricing,
  onUseLiteLLMPricingChange,
  isEditMode = false,
  model,
  onPricingEdited,
}: PricingTabProps) {
  const effectiveBilling =
    billingType === "inherit"
      ? providerBillingType ?? "pay_as_you_go"
      : billingType;

  const isNonTokenBilled =
    effectiveBilling === "subscription" || effectiveBilling === "free";

  const customPricingWillBeReplaced = Boolean(
    model?.pricing_source === "custom" && pricingTiers.length === 0,
  );

  const updateTier = (
    index: number,
    field: keyof PricingTier,
    value: string,
  ) => {
    onPricingEdited?.();
    onPricingTiersChange((tiers) =>
      tiers.map((tier, i) =>
        i === index ? { ...tier, [field]: Number(value) || 0 } : tier,
      ),
    );
  };

  return (
    <div className="space-y-5 py-1">
      {/* Billing Mode Section */}
      <div className="space-y-3 border-b border-border pb-4">
        <div>
          <h3 className="text-sm font-normal text-foreground">
            Billing & Quota Mode
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Configure how requests are tracked. Subscription models draw from plan quota without calculating per-token dollar costs.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => onBillingTypeChange("inherit")}
            className={`flex flex-col items-start rounded-lg border p-2.5 text-left text-xs transition-all cursor-pointer ${
              billingType === "inherit"
                ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary shadow-xs"
                : "border-border bg-card hover:border-border-strong text-muted-foreground hover:bg-accent/40"
            }`}
          >
            <span className="font-normal text-foreground">Inherit</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              Provider default ({providerBillingType ?? "pay_as_you_go"})
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onBillingTypeChange("subscription");
              onUseLiteLLMPricingChange(false);
            }}
            className={`flex flex-col items-start rounded-lg border p-2.5 text-left text-xs transition-all cursor-pointer ${
              billingType === "subscription"
                ? "border-purple-500 bg-purple-500/10 text-foreground ring-1 ring-purple-500 shadow-xs"
                : "border-border bg-card hover:border-border-strong text-muted-foreground hover:bg-accent/40"
            }`}
          >
            <span className="font-normal text-foreground flex items-center gap-1">
              <RiVipCrownLine className="size-3 text-purple-500" />
              <span>Subscription</span>
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              Quota, $0 direct
            </span>
          </button>

          <button
            type="button"
            onClick={() => onBillingTypeChange("pay_as_you_go")}
            className={`flex flex-col items-start rounded-lg border p-2.5 text-left text-xs transition-all cursor-pointer ${
              billingType === "pay_as_you_go"
                ? "border-blue-500 bg-blue-500/10 text-foreground ring-1 ring-blue-500 shadow-xs"
                : "border-border bg-card hover:border-border-strong text-muted-foreground hover:bg-accent/40"
            }`}
          >
            <span className="font-normal text-foreground flex items-center gap-1">
              <RiCoinsLine className="size-3 text-blue-500" />
              <span>Pay-as-you-go</span>
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              Pay per token
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onBillingTypeChange("free");
              onUseLiteLLMPricingChange(false);
            }}
            className={`flex flex-col items-start rounded-lg border p-2.5 text-left text-xs transition-all cursor-pointer ${
              billingType === "free"
                ? "border-emerald-500 bg-emerald-500/10 text-foreground ring-1 ring-emerald-500 shadow-xs"
                : "border-border bg-card hover:border-border-strong text-muted-foreground hover:bg-accent/40"
            }`}
          >
            <span className="font-normal text-foreground flex items-center gap-1">
              <RiCheckLine className="size-3 text-emerald-500" />
              <span>Free</span>
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5">
              Zero cost ($0.00)
            </span>
          </button>
        </div>

        {effectiveBilling === "subscription" && (
          <p className="rounded-md bg-purple-500/10 p-2.5 text-xs text-purple-700 dark:text-purple-300 leading-relaxed">
            This model runs as a subscription. Token requests draw from your subscription quota ($0 direct cost) and public commercial rates are excluded.
          </p>
        )}
      </div>

      {/* Subscription or Free Disabled State */}
      {isNonTokenBilled ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card p-6 text-center space-y-3">
          <div className="mx-auto flex items-center justify-center">
            {effectiveBilling === "subscription" ? (
              <RiVipCrownLine className="size-7 text-purple-500" />
            ) : (
              <RiCheckLine className="size-7 text-emerald-500" />
            )}
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-normal text-foreground">
              {effectiveBilling === "subscription"
                ? "Subscription mode active — token pricing disabled"
                : "Free tier active — token pricing disabled"}
            </h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              {effectiveBilling === "subscription"
                ? "Token requests consume from your active provider quota with $0 direct per-token API charges. Pricing tiers and catalog lookups are disabled."
                : "This model is 100% free ($0.00). Per-token charges and pricing tiers are disabled."}
            </p>
          </div>
          <div className="pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onBillingTypeChange("pay_as_you_go")}
              className="text-xs h-8"
            >
              Switch to Pay-As-You-Go to configure token prices
            </Button>
          </div>
        </div>
      ) : (
        /* Pay-As-You-Go Pricing Section */
        <div className="space-y-4">
          {/* LiteLLM catalog option in edit mode */}
          {isEditMode && (
            <div className="space-y-3 border-b border-border pb-3">
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs font-normal text-foreground">
                    Use LiteLLM catalog pricing
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Use public catalog rates when available. Custom pricing tiers take precedence.
                  </p>
                </div>
                <Switch
                  checked={useLiteLLMPricing}
                  onCheckedChange={onUseLiteLLMPricingChange}
                  aria-label="Use LiteLLM catalog pricing"
                />
              </div>

              {useLiteLLMPricing &&
                model?.pricing_source === "custom" &&
                !customPricingWillBeReplaced && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                    <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                      Custom tiers are currently used instead of the catalog rates.
                    </p>
                    {model.catalog_pricing && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => {
                          onPricingEdited?.();
                          onPricingTiersChange([]);
                        }}
                      >
                        Replace with catalog
                      </Button>
                    )}
                  </div>
                )}

              {useLiteLLMPricing &&
                model?.catalog_pricing &&
                (model.pricing_source !== "custom" ||
                  customPricingWillBeReplaced) && (
                  <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs">
                    <span className="font-normal text-foreground">
                      Catalog rate:{" "}
                    </span>
                    <span className="text-muted-foreground font-mono">
                      {catalogPriceDescription(model.catalog_pricing)}
                    </span>
                  </div>
                )}

              {useLiteLLMPricing &&
                !model?.catalog_pricing &&
                model?.use_litellm_pricing === 1 && (
                  <p className="text-[11px] text-muted-foreground">
                    No matching rate was found in the public catalog for this model.
                  </p>
                )}

              {useLiteLLMPricing &&
                !model?.catalog_pricing &&
                model?.use_litellm_pricing !== 1 && (
                  <p className="text-[11px] text-muted-foreground">
                    Save changes to look up this model in the public catalog.
                  </p>
                )}
            </div>
          )}

          {/* Pricing Tiers Editor */}
          {pricingTiers.length > 0 || !isEditMode ? (
            <PricingEditor
              tiers={pricingTiers}
              updateTier={updateTier}
              setTiers={(update) => {
                onPricingEdited?.();
                onPricingTiersChange(update);
              }}
            />
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-dashed border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                {useLiteLLMPricing && model?.catalog_pricing
                  ? "Catalog pricing is currently active."
                  : "No custom pricing tiers configured."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  onPricingEdited?.();
                  onPricingTiersChange([
                    {
                      threshold_tokens: 0,
                      input_per_million: 0,
                      output_per_million: 0,
                      cache_read_per_million: 0,
                      cache_write_per_million: 0,
                    },
                  ]);
                }}
              >
                + Add custom pricing tier
              </Button>
            </div>
          )}
        </div>
      )}
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
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-normal text-foreground">
          Pricing per 1M tokens
        </h4>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Create threshold tiers for tiered pricing. The closest tier below the request context size is applied.
        </p>
      </div>

      {/* Tier Switcher Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border pb-2">
        {tiers.map((tier, index) => (
          <button
            key={index}
            type="button"
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
              index === selectedTier
                ? "bg-primary text-primary-foreground font-normal shadow-xs"
                : "bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
            onClick={() => setActiveTier(index)}
          >
            Tier {index + 1}
            <span
              className={`ml-1.5 font-mono text-[10px] ${
                index === selectedTier
                  ? "text-primary-foreground/80"
                  : "text-muted-foreground"
              }`}
            >
              ({thresholdLabel(tier.threshold_tokens)})
            </span>
          </button>
        ))}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs shrink-0"
          onClick={addTier}
        >
          <RiAddLine className="size-3.5 mr-1" />
          Add tier
        </Button>
      </div>

      {/* Current Tier Details */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-3.5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-xs font-normal">
              Input token threshold
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Minimum input context size for this tier (0 for base tier).
            </p>
          </div>
          {tiers.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive shrink-0"
              onClick={removeTier}
            >
              <RiDeleteBinLine className="size-3.5 mr-1" />
              Remove tier
            </Button>
          )}
        </div>

        <Input
          type="number"
          min="0"
          className="h-8 font-mono text-xs max-w-xs"
          value={currentTier.threshold_tokens}
          onChange={(e) =>
            updateTier(selectedTier, "threshold_tokens", e.target.value)
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-border/60">
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
    <div className="space-y-1.5">
      <Label className="text-xs font-normal">{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-muted-foreground font-mono">
          $
        </span>
        <Input
          className="h-8 pl-6 font-mono text-xs"
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">USD per 1M tokens</p>
    </div>
  );
}
