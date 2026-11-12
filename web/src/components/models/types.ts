import type {
  CatalogPricing,
  MetadataSource,
  Model,
  ModelBillingType,
  ModelCapabilities,
  ModelMetadataInput,
  PricingTier,
  ProviderBillingType,
  ReasoningEffort,
  ThinkOpeningTagMode,
} from "../../types";

export interface ModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode?: "create" | "edit";
  model?: Model | null;
  providerId?: string;
  providerBillingType?: ProviderBillingType;
}

export type ModelTabId =
  | "general"
  | "generation"
  | "capabilities"
  | "output-fixes"
  | "pricing";

export interface ModelTabItem {
  id: ModelTabId;
  label: string;
  description: string;
  iconName: "info" | "sparkles" | "cpu" | "tool" | "coin";
}

export const mediaCapabilityKeys = [
  "image_generation",
  "text_to_speech",
  "video_generation",
] as const;

export const capabilityLabels: Record<
  Exclude<keyof ModelCapabilities, (typeof mediaCapabilityKeys)[number]>,
  string
> = {
  reasoning: "Reasoning",
  tools: "Tools",
  vision: "Vision",
  audio_input: "Audio input",
  audio_output: "Audio output",
  video: "Video",
  attachments: "Attachments",
  streaming: "Streaming",
  non_streaming: "Non-streaming",
};

export function emptyModelMetadata(): ModelMetadataInput {
  return {
    model_type: "chat",
    input_modalities: ["text"],
    output_modalities: ["text"],
    context_window: null,
    max_output_tokens: null,
    capabilities: {
      reasoning: null,
      tools: null,
      vision: null,
      audio_input: null,
      audio_output: null,
      video: null,
      image_generation: false,
      text_to_speech: false,
      video_generation: false,
      attachments: null,
      streaming: null,
      non_streaming: null,
    },
    reasoning_efforts: [],
  };
}

export function defaultPricingTiers(): PricingTier[] {
  return [
    {
      threshold_tokens: 0,
      input_per_million: 0,
      output_per_million: 0,
      cache_read_per_million: 0,
      cache_write_per_million: 0,
    },
  ];
}

export function modelFormTabsFor(includeOutputFixes = true): ModelTabItem[] {
  return [
    {
      id: "general",
      label: "General",
      description: "Model identity & naming",
      iconName: "info",
    },
    {
      id: "generation",
      label: "Model type",
      description: "Media & generation modes",
      iconName: "sparkles",
    },
    {
      id: "capabilities",
      label: "Capabilities",
      description: "Context, limits & reasoning",
      iconName: "cpu",
    },
    ...(includeOutputFixes
      ? [
          {
            id: "output-fixes" as const,
            label: "Output fixes",
            description: "Think tags and formatting",
            iconName: "tool" as const,
          },
        ]
      : []),
    {
      id: "pricing",
      label: "Pricing & Billing",
      description: "Tiers, quotas & catalog",
      iconName: "coin",
    },
  ];
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
  }).format(value);
}

export function catalogPriceDescription(price: CatalogPricing): string {
  return price.rates
    .map(
      (rate) =>
        `${rate.label}: ${formatUsd(rate.display_usd)} / ${rate.display_unit}`,
    )
    .join(", ");
}
