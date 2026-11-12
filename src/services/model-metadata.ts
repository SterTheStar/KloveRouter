import type {
  ModelCapabilities,
  ModelMetadataInput,
  ReasoningEffort,
  ModelType,
  Modality,
} from "./model.service";
import type { ProviderProtocol } from "./provider-appearance";
import type { CatalogModelInfo } from "./litellm-pricing";
import { classifyModel } from "./model-type";

function positiveInteger(value: unknown): number | null | undefined {
  if (value === null) return null;
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : undefined;
}

function boolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function effortRows(values: string[], defaultEffort?: string): ReasoningEffort[] {
  return values.map((effort, sort_order) => ({
    effort,
    display_name: effort[0].toUpperCase() + effort.slice(1),
    upstream_value: effort,
    sort_order,
    is_default: defaultEffort !== undefined && effort === defaultEffort,
  }));
}

function parseEfforts(raw: any): ReasoningEffort[] | undefined {
  const source = raw?.reasoning_efforts ?? raw?.supported_reasoning_efforts ??
    raw?.supported_reasoning_levels ?? raw?.reasoning?.efforts ?? raw?.reasoning?.supported_efforts ??
    raw?.capabilities?.reasoning_efforts;
  if (!Array.isArray(source) || !source.length) return undefined;
  const values = source
    .map((item: any) => typeof item === "string"
      ? item
      : item?.effort ?? item?.reasoning_effort ?? item?.value ?? item?.name)
    .filter((item: unknown): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim());
  if (!values.length) return undefined;
  // A default is taken from the provider when it declares one (matched loosely);
  // otherwise nothing is marked and clients must pick explicitly — the Saturn
  // panel can still set one manually.
  const declared = String(raw?.default_reasoning_effort ?? raw?.default_reasoning_level ?? raw?.reasoning?.default_effort ?? "").trim().toLowerCase();
  const declaredMatch = declared ? values.find((value) => value.toLowerCase() === declared) : undefined;
  return effortRows([...new Set(values)], declaredMatch);
}

export function parseRawModelMetadata(raw: any): ModelMetadataInput {
  const nested = raw?.model && typeof raw.model === "object" ? raw.model : {};
  const architecture = raw?.architecture && typeof raw.architecture === "object"
    ? raw.architecture
    : {};
  const parameters = Array.isArray(raw?.supported_parameters)
    ? new Set(raw.supported_parameters.map(String))
    : null;
  const inputModalities = [
    ...(Array.isArray(raw?.input_modalities) ? raw.input_modalities : []),
    ...(Array.isArray(raw?.modalities) ? raw.modalities : []),
    ...(Array.isArray(raw?.modalities?.input) ? raw.modalities.input : []),
    ...(Array.isArray(architecture?.input_modalities)
      ? architecture.input_modalities
      : []),
    ...(typeof architecture?.modality === "string"
      ? architecture.modality.split(/[+>,/]/)
      : []),
  ].map((value) => String(value).toLowerCase());
  const outputModalities = [
    ...(Array.isArray(raw?.output_modalities) ? raw.output_modalities : []),
    ...(Array.isArray(raw?.modalities?.output) ? raw.modalities.output : []),
    ...(Array.isArray(architecture?.output_modalities) ? architecture.output_modalities : []),
  ].map((value) => String(value).toLowerCase());
  const explicit = raw?.capabilities && typeof raw.capabilities === "object"
    ? raw.capabilities
    : {};
  const apiFamilies = raw?.api && typeof raw.api === "object" ? Object.keys(raw.api) : undefined;
  const supportedGenerationMethods = Array.isArray(raw?.supportedGenerationMethods)
    ? raw.supportedGenerationMethods.map(String)
    : undefined;
  const architectureModality = typeof architecture?.modality === "string" ? architecture.modality : undefined;
  const declaredType = raw?.model_type ?? raw?.type ?? nested?.type;

  const classification = classifyModel({
    modelId: raw?.id ?? raw?.model_id ?? nested?.id ?? "",
    displayName: raw?.display_name ?? raw?.name ?? nested?.name ?? "",
    declaredType,
    mode: raw?.mode ?? nested?.mode,
    apiFamilies,
    supportedGenerationMethods,
    architectureModality,
    inputModalities,
    outputModalities,
    capabilities: explicit,
    mediaSettings: raw?.media_settings,
  });
  const supportedMimeTypes = Array.isArray(raw?.supportedMimeTypes)
    ? raw.supportedMimeTypes.map(String).map((value: string) => value.toLowerCase())
    : [];
  const supported = (names: string[]) => parameters
    ? names.some((name) => parameters.has(name))
    : undefined;
  const capability = (key: keyof ModelCapabilities, inferred?: boolean) =>
    boolean(explicit[key]) ?? inferred;
  const reasoningEfforts = parseEfforts(raw);
  return {
    model_type: classification.modelType,
    input_modalities: classification.inputModalities,
    output_modalities: classification.outputModalities,
    context_window: positiveInteger(
      raw?.maxTokens ?? raw?.max_context_window ?? raw?.context_window ?? raw?.context_length ?? raw?.max_context_length ??
        raw?.input_token_limit ?? raw?.limit?.context ?? nested?.context_window ??
        nested?.max_context_window ?? nested?.context_length ?? nested?.input_token_limit ?? nested?.limit?.context ??
        raw?.top_provider?.context_length,
    ),
    max_output_tokens: positiveInteger(
      raw?.maxOutputTokens ?? raw?.max_output_tokens ?? raw?.max_completion_tokens ?? raw?.output_token_limit ??
        raw?.limit?.output ?? nested?.max_output_tokens ?? nested?.output_token_limit ??
        nested?.limit?.output ?? raw?.top_provider?.max_completion_tokens,
    ),
    capabilities: {
      reasoning: capability(
        "reasoning",
        boolean(raw?.supportsThinking) ?? boolean(raw?.reasoning) ??
          (reasoningEfforts?.length ? true : supported(["reasoning", "reasoning_effort"])),
      ),
      tools: capability("tools", boolean(raw?.supportsTools) ?? boolean(raw?.tool_call) ??
        ((raw?.supports_parallel_tool_calls === true || typeof raw?.tool_mode === "string" ||
          (Array.isArray(raw?.experimental_supported_tools) && raw.experimental_supported_tools.length > 0)) ||
          supported(["tools", "tool_choice", "function_call"]))),
      vision: capability("vision", boolean(raw?.supportsImages) ?? classification.inferredCapabilities.vision ?? (inputModalities.length ? inputModalities.some((item) => item.includes("image")) : undefined)),
      audio_input: capability("audio_input", boolean(raw?.supportsAudioInput) ?? classification.inferredCapabilities.audio_input ?? (inputModalities.length ? inputModalities.some((item) => item.includes("audio") || item.includes("speech")) : undefined)),
      audio_output: capability("audio_output", boolean(raw?.supportsAudioOutput) ?? classification.inferredCapabilities.audio_output ?? (outputModalities.length ? outputModalities.some((item) => item.includes("audio") || item.includes("speech")) : undefined)),
      video: capability("video", boolean(raw?.supportsVideo) ?? classification.inferredCapabilities.video ?? (inputModalities.length ? inputModalities.some((item) => item.includes("video")) : undefined)),
      image_generation: capability("image_generation", boolean(raw?.supportsImageGeneration) ?? classification.inferredCapabilities.image_generation),
      text_to_speech: capability("text_to_speech", boolean(raw?.supportsTextToSpeech) ?? classification.inferredCapabilities.text_to_speech),
      video_generation: capability("video_generation", boolean(raw?.supportsVideoGeneration) ?? classification.inferredCapabilities.video_generation),
      attachments: capability("attachments", boolean(raw?.supportsAttachments) ?? boolean(raw?.attachment) ?? (supportedMimeTypes.length ? supportedMimeTypes.some((item: string) => !item.startsWith("image/") && !item.startsWith("audio/") && !item.startsWith("video/") && item !== "text/plain") : (inputModalities.length ? inputModalities.some((item) => item.includes("file")) : undefined))),
      streaming: capability("streaming", boolean(raw?.supportsStreaming) ?? boolean(raw?.streaming) ?? boolean(raw?.supports_streaming)),
      non_streaming: capability("non_streaming", boolean(raw?.supportsNonStreaming) ?? boolean(raw?.non_streaming) ?? boolean(raw?.supports_non_streaming)),
    },
    reasoning_efforts: reasoningEfforts,
  };
}

const dedicatedIntegrations = new Set<ProviderProtocol>([
  "codex",
  "chatgpt",
  "antigravity",
  "qwen",
  "freebuff",
  "atomesus",
  "conol",
]);

function numericMetadata(source: ModelMetadataInput): ModelMetadataInput {
  return {
    context_window: source.context_window,
    max_output_tokens: source.max_output_tokens,
  };
}

export function mergeMetadata(...sources: ModelMetadataInput[]): ModelMetadataInput {
  const scalar = (key: "context_window" | "max_output_tokens" | "model_type") =>
    sources.find((source) => source[key] != null)?.[key];
  const input_modalities = sources.find((source) => source.input_modalities?.length)?.input_modalities;
  const output_modalities = sources.find((source) => source.output_modalities?.length)?.output_modalities;
  const capabilities = Object.fromEntries(
    ["reasoning", "tools", "vision", "audio_input", "audio_output", "video", "image_generation", "text_to_speech", "video_generation", "attachments", "streaming", "non_streaming"].map((key) => [
      key,
      sources.find((source) => source.capabilities?.[key as keyof ModelCapabilities] !== undefined)
        ?.capabilities?.[key as keyof ModelCapabilities],
    ]),
  ) as Partial<ModelCapabilities>;
  return {
    model_type: scalar("model_type") as ModelType | undefined,
    input_modalities,
    output_modalities,
    context_window: scalar("context_window") as number | null | undefined,
    max_output_tokens: scalar("max_output_tokens") as number | null | undefined,
    capabilities,
    reasoning_efforts: sources.find((source) => source.reasoning_efforts !== undefined)?.reasoning_efforts,
  };
}

export type MetadataSourceTag = "provider" | "litellm" | "manual";

export interface ModelMetadataSource {
  context_window?: MetadataSourceTag | "unknown";
  max_output_tokens?: MetadataSourceTag | "unknown";
  capabilities?: Partial<Record<keyof ModelCapabilities, MetadataSourceTag>>;
  reasoning_efforts?: MetadataSourceTag | "unknown";
}

const modalityIncludes = (modalities: string[] | undefined, needle: string): boolean | undefined =>
  modalities ? modalities.some((value) => value.includes(needle)) : undefined;

export function emptyMetadataSource(): ModelMetadataSource {
  return { capabilities: {} };
}

export function mergeMetadataSource(
  existing: ModelMetadataSource | null | undefined,
  incoming: ModelMetadataSource | null | undefined,
): ModelMetadataSource {
  const base = existing?.capabilities ? existing : emptyMetadataSource();
  if (!incoming) return { ...base, capabilities: { ...base.capabilities } };
  return {
    context_window: incoming.context_window ?? base.context_window,
    max_output_tokens: incoming.max_output_tokens ?? base.max_output_tokens,
    reasoning_efforts: incoming.reasoning_efforts ?? base.reasoning_efforts,
    capabilities: { ...base.capabilities, ...(incoming.capabilities ?? {}) },
  };
}

/**
 * Fills gaps in provider-declared metadata from the LiteLLM catalog. The
 * provider always wins when it declares something; LiteLLM only fills values
 * that are missing, and every filled value is tagged with its origin so the
 * admin can distinguish declared facts from catalog fallbacks.
 */
export function applyLiteLLMMetadata(
  base: ModelMetadataInput,
  info: CatalogModelInfo | null | undefined,
  baseSource: MetadataSourceTag = "provider",
): ModelMetadataInput {
  const capabilities: Partial<ModelCapabilities> = { ...(base.capabilities ?? {}) };
  const capSource: Partial<Record<keyof ModelCapabilities, MetadataSourceTag>> = {};
  const fill = (key: keyof ModelCapabilities, litellmValue: boolean | undefined) => {
    const current = capabilities[key];
    if (current !== undefined && current !== null) { capSource[key] = baseSource; return; }
    if (litellmValue !== undefined) capabilities[key] = litellmValue;
    capSource[key] = litellmValue !== undefined ? "litellm" : undefined;
  };
  fill("vision", info?.supportsVision ?? modalityIncludes(info?.supportedModalities, "image"));
  fill("tools", info?.supportsFunctionCalling);
  fill("reasoning", info?.supportsReasoning);
  fill("streaming", info?.supportsNativeStreaming);
  fill("audio_input", modalityIncludes(info?.supportedModalities, "audio") ?? modalityIncludes(info?.supportedModalities, "speech"));
  fill("audio_output", modalityIncludes(info?.supportedOutputModalities, "audio") ?? modalityIncludes(info?.supportedOutputModalities, "speech"));
  fill("video", modalityIncludes(info?.supportedModalities, "video"));
  fill("attachments", info?.supportsPdfInput ?? modalityIncludes(info?.supportedModalities, "file"));
  fill("image_generation", info?.supportsImageGeneration ?? (info?.mode === "image_generation" ? true : undefined));
  fill("text_to_speech", info?.supportsTextToSpeech ?? (info?.mode === "audio_speech" ? true : undefined));
  fill("video_generation", info?.supportsVideoGeneration ?? (info?.mode === "video_generation" ? true : undefined));

  let inferredModelType = base.model_type;
  if (!inferredModelType || inferredModelType === "chat") {
    if (info?.mode === "image_generation" || capabilities.image_generation === true) inferredModelType = "image";
    else if (info?.mode === "audio_speech" || capabilities.text_to_speech === true) inferredModelType = "tts";
    else if (info?.mode === "video_generation" || capabilities.video_generation === true) inferredModelType = "video";
    else if (info?.mode === "embedding") inferredModelType = "embedding";
  }

  const pick = (current: number | null | undefined, fallback?: number) =>
    current !== undefined && current !== null ? current : fallback;
  return {
    ...base,
    model_type: inferredModelType,
    context_window: pick(base.context_window, info?.maxInputTokens) ?? null,
    max_output_tokens: pick(base.max_output_tokens, info?.maxOutputTokens) ?? null,
    capabilities,
    metadata_source: mergeMetadataSource(emptyMetadataSource(), {
      context_window: base.context_window != null ? baseSource : info?.maxInputTokens !== undefined ? "litellm" : "unknown",
      max_output_tokens: base.max_output_tokens != null ? baseSource : info?.maxOutputTokens !== undefined ? "litellm" : "unknown",
      reasoning_efforts: base.reasoning_efforts !== undefined ? baseSource : "unknown",
      capabilities: Object.fromEntries(Object.entries(capSource).filter(([, value]) => value !== undefined)) as ModelMetadataSource["capabilities"],
    }),
  };
}

export async function resolveModelMetadata(
  protocol: ProviderProtocol,
  _modelId: string,
  raw: any = {},
): Promise<ModelMetadataInput> {
  const rawMetadata = parseRawModelMetadata(raw);
  if (protocol === "antigravity" || protocol === "codex")
    return rawMetadata;
  if (dedicatedIntegrations.has(protocol))
    return numericMetadata(rawMetadata);
  const resolved = mergeMetadata(rawMetadata);
  if (resolved.capabilities?.reasoning === false)
    resolved.reasoning_efforts = undefined;
  return resolved;
}
