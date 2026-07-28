import type {
  ModelCapabilities,
  ModelMetadataInput,
  ReasoningEffort,
} from "./model.service";
import type { ProviderProtocol } from "./provider-appearance";

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

function effortRows(values: string[], defaultEffort = "medium"): ReasoningEffort[] {
  return values.map((effort, sort_order) => ({
    effort,
    display_name: effort[0].toUpperCase() + effort.slice(1),
    upstream_value: effort,
    sort_order,
    is_default: effort === defaultEffort,
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
  const preferred = String(raw?.default_reasoning_effort ?? raw?.default_reasoning_level ?? raw?.reasoning?.default_effort ?? "medium");
  const fallback = values.includes(preferred) ? preferred : values.includes("medium") ? "medium" : values[0];
  return effortRows([...new Set(values)], fallback);
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
  const explicit = raw?.capabilities && typeof raw.capabilities === "object"
    ? raw.capabilities
    : {};
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
      vision: capability("vision", boolean(raw?.supportsImages) ?? boolean(raw?.supportsVideo) ?? (inputModalities.length ? inputModalities.some((item) => item.includes("image")) : undefined)),
      attachments: capability("attachments", boolean(raw?.supportsAttachments) ?? boolean(raw?.attachment) ?? (supportedMimeTypes.length ? supportedMimeTypes.some((item: string) => !item.startsWith("image/") && item !== "text/plain") : (inputModalities.length ? inputModalities.some((item) => item.includes("file")) : undefined))),
      streaming: capability("streaming", boolean(raw?.supportsStreaming) ?? boolean(raw?.streaming) ?? boolean(raw?.supports_streaming)),
      non_streaming: capability("non_streaming", boolean(raw?.supportsNonStreaming) ?? boolean(raw?.non_streaming) ?? boolean(raw?.supports_non_streaming)),
    },
    reasoning_efforts: reasoningEfforts,
  };
}

const dedicatedIntegrations = new Set<ProviderProtocol>([
  "codex",
  "antigravity",
  "qwen",
  "freebuff",
  "atomesus",
]);

function numericMetadata(source: ModelMetadataInput): ModelMetadataInput {
  return {
    context_window: source.context_window,
    max_output_tokens: source.max_output_tokens,
  };
}

export function mergeMetadata(...sources: ModelMetadataInput[]): ModelMetadataInput {
  const scalar = (key: "context_window" | "max_output_tokens") =>
    sources.find((source) => source[key] != null)?.[key];
  const capabilities = Object.fromEntries(
    ["reasoning", "tools", "vision", "attachments", "streaming", "non_streaming"].map((key) => [
      key,
      sources.find((source) => source.capabilities?.[key as keyof ModelCapabilities] !== undefined)
        ?.capabilities?.[key as keyof ModelCapabilities],
    ]),
  ) as Partial<ModelCapabilities>;
  return {
    context_window: scalar("context_window"),
    max_output_tokens: scalar("max_output_tokens"),
    capabilities,
    reasoning_efforts: sources.find((source) => source.reasoning_efforts !== undefined)?.reasoning_efforts,
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
