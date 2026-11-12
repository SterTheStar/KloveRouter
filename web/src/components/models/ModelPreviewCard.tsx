import { useState } from "react";
import {
  RiCheckLine,
  RiFileCopyLine,
  RiVipCrownLine,
  RiCoinsLine,
  RiChat1Line,
  RiImageLine,
  RiMicLine,
  RiVideoLine,
  RiEyeLine,
  RiToolsLine,
  RiBrainLine,
  RiAttachmentLine,
  RiDatabase2Line,
  RiVoiceprintLine,
  RiGitBranchLine,
} from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { copyToClipboard } from "@/lib/clipboard";
import { useToast } from "@/components/ui/toast";
import { modelCategories, modelCategoryBadge } from "@/lib/model-modality";
import type {
  ModelBillingType,
  ModelMetadataInput,
  PricingTier,
  ProviderBillingType,
  ThinkOpeningTagMode,
} from "../../types";
import { formatUsd } from "./types";

interface ModelPreviewCardProps {
  modelId: string;
  prettyId: string;
  displayName: string;
  billingType: ModelBillingType;
  providerBillingType?: ProviderBillingType;
  metadata: ModelMetadataInput;
  pricingTiers: PricingTier[];
  useLiteLLMPricing?: boolean;
  catalogPricingRate?: string | null;
  thinkOpeningTagMode: ThinkOpeningTagMode;
}

function categoryIcon(category: string) {
  switch (category) {
    case "chat":
      return <RiChat1Line className="size-3" />;
    case "image":
      return <RiImageLine className="size-3" />;
    case "tts":
      return <RiMicLine className="size-3" />;
    case "video":
      return <RiVideoLine className="size-3" />;
    case "embedding":
      return <RiDatabase2Line className="size-3" />;
    case "systemone":
      return <RiGitBranchLine className="size-3" />;
    case "stt":
      return <RiVoiceprintLine className="size-3" />;
    default:
      return null;
  }
}

function formatTokens(tokens: number | null | undefined): string {
  if (tokens == null || tokens === 0) return "—";
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    const k = tokens / 1_000;
    return `${k % 1 === 0 ? k : k.toFixed(0)}k`;
  }
  return tokens.toLocaleString();
}

export function ModelPreviewCard({
  modelId,
  prettyId,
  displayName,
  billingType,
  providerBillingType,
  metadata,
  pricingTiers,
  useLiteLLMPricing,
  catalogPricingRate,
  thinkOpeningTagMode,
}: ModelPreviewCardProps) {
  const { success, error: notifyError } = useToast();
  const [copied, setCopied] = useState(false);

  const effectiveBilling =
    billingType === "inherit"
      ? providerBillingType ?? "pay_as_you_go"
      : billingType;

  const categories = modelCategories({
    model_id: modelId,
    display_name: displayName,
    capabilities: metadata.capabilities,
  });

  const handleCopyId = async () => {
    if (!modelId) return;
    try {
      await copyToClipboard(modelId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      success("Model ID copied to clipboard");
    } catch (e: any) {
      notifyError("Failed to copy", e.message);
    }
  };

  const enabledCapabilitiesCount = Object.values(
    metadata.capabilities ?? {},
  ).filter((v) => v === true).length;

  const baseTier = pricingTiers[0];

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-3.5 space-y-3">
      {/* Header with Title & Copy */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-normal text-muted-foreground">
            Preview
          </span>
          <h4 className="truncate text-xs font-normal text-foreground mt-0.5">
            {displayName || modelId || "Unnamed Model"}
          </h4>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
            <span className="truncate max-w-[170px]" title={modelId || "model-id"}>
              {modelId || "model-id"}
            </span>
            {modelId && (
              <button
                type="button"
                onClick={handleCopyId}
                className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                title="Copy model ID"
              >
                {copied ? (
                  <RiCheckLine className="size-3 text-foreground" />
                ) : (
                  <RiFileCopyLine className="size-3" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Billing Badge */}
        <div className="shrink-0">
          {effectiveBilling === "subscription" ? (
            <Badge
              variant="outline"
              className="border-border px-1.5 py-0 text-[10px] text-muted-foreground font-normal gap-1"
            >
              <RiVipCrownLine className="size-3 text-purple-500" />
              <span>Subscription</span>
            </Badge>
          ) : effectiveBilling === "free" ? (
            <Badge
              variant="outline"
              className="border-border px-1.5 py-0 text-[10px] text-muted-foreground font-normal gap-1"
            >
              <RiCheckLine className="size-3 text-emerald-500" />
              <span>Free ($0)</span>
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-border px-1.5 py-0 text-[10px] text-muted-foreground font-normal gap-1"
            >
              <RiCoinsLine className="size-3 text-blue-500" />
              <span>Pay-as-you-go</span>
            </Badge>
          )}
        </div>
      </div>

      {/* Pretty ID if provided */}
      {prettyId && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-accent/40 rounded-md px-2 py-1">
          <span className="text-[11px] font-normal text-muted-foreground">Alias:</span>
          <span className="font-mono text-foreground truncate">{prettyId}</span>
        </div>
      )}

      {/* Modalities & Capabilities Badges */}
      <div className="flex flex-wrap items-center gap-1">
        {categories.map((cat) => (
          <Badge
            key={cat}
            variant="outline"
            className="border-border px-1.5 py-0 text-[10px] text-muted-foreground font-normal gap-1"
          >
            {categoryIcon(cat)}
            <span>{modelCategoryBadge(cat)}</span>
          </Badge>
        ))}
        {metadata.capabilities?.vision && (
          <Badge
            variant="outline"
            className="border-border px-1.5 py-0 text-[10px] text-muted-foreground font-normal gap-1"
          >
            <RiEyeLine className="size-3" />
            <span>Vision</span>
          </Badge>
        )}
        {metadata.capabilities?.tools && (
          <Badge
            variant="outline"
            className="border-border px-1.5 py-0 text-[10px] text-muted-foreground font-normal gap-1"
          >
            <RiToolsLine className="size-3" />
            <span>Tools</span>
          </Badge>
        )}
        {metadata.capabilities?.reasoning && (
          <Badge
            variant="outline"
            className="border-border px-1.5 py-0 text-[10px] text-muted-foreground font-normal gap-1"
          >
            <RiBrainLine className="size-3" />
            <span>Reasoning</span>
          </Badge>
        )}
        {metadata.capabilities?.audio_input && (
          <Badge
            variant="outline"
            className="border-border px-1.5 py-0 text-[10px] text-muted-foreground font-normal gap-1"
          >
            <RiMicLine className="size-3" />
            <span>Audio</span>
          </Badge>
        )}
        {metadata.capabilities?.attachments && (
          <Badge
            variant="outline"
            className="border-border px-1.5 py-0 text-[10px] text-muted-foreground font-normal gap-1"
          >
            <RiAttachmentLine className="size-3" />
            <span>Files</span>
          </Badge>
        )}
      </div>

      {/* Key Specs Grid */}
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-accent/20 p-2 text-[11px]">
        <div>
          <span className="text-muted-foreground text-[10px] block">Context</span>
          <span className="font-mono font-normal text-foreground">
            {formatTokens(metadata.context_window)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground text-[10px] block">Max output</span>
          <span className="font-mono font-normal text-foreground">
            {formatTokens(metadata.max_output_tokens)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground text-[10px] block">Capabilities</span>
          <span className="font-normal text-foreground">
            {enabledCapabilitiesCount} enabled
          </span>
        </div>
        <div>
          <span className="text-muted-foreground text-[10px] block">Think tag</span>
          <span className="font-normal text-foreground capitalize">
            {thinkOpeningTagMode}
          </span>
        </div>
      </div>

      {/* Pricing Summary */}
      <div className="rounded-lg border border-border bg-accent/20 px-2.5 py-2 text-[11px] space-y-1">
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-[10px]">Pricing rate</span>
          {pricingTiers.length > 1 && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {pricingTiers.length} tiers
            </span>
          )}
        </div>
        {effectiveBilling === "subscription" ? (
          <p className="text-foreground font-normal">
            Draws from subscription quota ($0/token)
          </p>
        ) : effectiveBilling === "free" ? (
          <p className="text-foreground font-normal">
            Free tier ($0.00 direct charge)
          </p>
        ) : useLiteLLMPricing && catalogPricingRate ? (
          <p className="text-foreground truncate font-mono text-[10px]">
            {catalogPricingRate}
          </p>
        ) : baseTier ? (
          <div className="flex items-center justify-between text-foreground font-mono text-[10px]">
            <span>In: {formatUsd(baseTier.input_per_million)} / 1M</span>
            <span>Out: {formatUsd(baseTier.output_per_million)} / 1M</span>
          </div>
        ) : (
          <span className="text-muted-foreground">No custom rates configured</span>
        )}
      </div>
    </div>
  );
}
