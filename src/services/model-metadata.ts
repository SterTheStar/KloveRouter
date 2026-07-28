import { logger } from "../logger";
import type {
  ModelCapabilities,
  ModelMetadataInput,
  ReasoningEffort,
} from "./model.service";
import type { ProviderProtocol } from "./provider-appearance";

type CatalogModel = {
  id?: string;
  family?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  modalities?: { input?: string[] };
  limit?: { context?: number; output?: number };
};

type Catalog = Record<string, { id?: string; name?: string; models?: Record<string, CatalogModel> }>;

const CATALOG_URL = "https://models.dev/api.json";
const CATALOG_TIMEOUT_MS = 1_500;
const CATALOG_TTL_MS = 6 * 60 * 60 * 1_000;
let catalogCache: { value: Catalog | null; expiresAt: number } | null = null;
let catalogRequest: Promise<Catalog | null> | null = null;

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
    raw?.reasoning?.efforts ?? raw?.capabilities?.reasoning_efforts;
  if (!Array.isArray(source) || !source.length) return undefined;
  const values = source
    .map((item: any) => typeof item === "string"
      ? item
      : item?.effort ?? item?.reasoning_effort ?? item?.value ?? item?.name)
    .filter((item: unknown): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((item) => item.trim());
  if (!values.length) return undefined;
  const preferred = String(raw?.default_reasoning_effort ?? raw?.reasoning?.default_effort ?? "medium");
  const fallback = values.includes(preferred) ? preferred : values.includes("medium") ? "medium" : values[0];
  return effortRows([...new Set(values)], fallback);
}

export function parseRawModelMetadata(raw: any): ModelMetadataInput {
  const nested = raw?.model && typeof raw.model === "object" ? raw.model : {};
  const parameters = Array.isArray(raw?.supported_parameters)
    ? new Set(raw.supported_parameters.map(String))
    : null;
  const inputModalities = [
    ...(Array.isArray(raw?.input_modalities) ? raw.input_modalities : []),
    ...(Array.isArray(raw?.modalities) ? raw.modalities : []),
    ...(Array.isArray(raw?.modalities?.input) ? raw.modalities.input : []),
  ].map((value) => String(value).toLowerCase());
  const explicit = raw?.capabilities && typeof raw.capabilities === "object"
    ? raw.capabilities
    : {};
  const supported = (names: string[]) => parameters
    ? names.some((name) => parameters.has(name))
    : undefined;
  const capability = (key: keyof ModelCapabilities, inferred?: boolean) =>
    boolean(explicit[key]) ?? inferred;
  return {
    context_window: positiveInteger(
      raw?.context_window ?? raw?.context_length ?? raw?.max_context_length ??
        raw?.input_token_limit ?? raw?.limit?.context ?? nested?.context_window ??
        nested?.context_length ?? nested?.input_token_limit ?? nested?.limit?.context,
    ),
    max_output_tokens: positiveInteger(
      raw?.max_output_tokens ?? raw?.max_completion_tokens ?? raw?.output_token_limit ??
        raw?.limit?.output ?? nested?.max_output_tokens ?? nested?.output_token_limit ??
        nested?.limit?.output,
    ),
    capabilities: {
      reasoning: capability("reasoning", boolean(raw?.reasoning) ?? supported(["reasoning", "reasoning_effort"])),
      tools: capability("tools", boolean(raw?.tool_call) ?? supported(["tools", "tool_choice", "function_call"])),
      vision: capability("vision", inputModalities.length ? inputModalities.some((item) => item.includes("image")) : undefined),
      attachments: capability("attachments", boolean(raw?.attachment) ?? (inputModalities.length ? inputModalities.some((item) => item.includes("file")) : undefined)),
      streaming: capability("streaming", boolean(raw?.streaming) ?? boolean(raw?.supports_streaming)),
      non_streaming: capability("non_streaming", boolean(raw?.non_streaming) ?? boolean(raw?.supports_non_streaming)),
    },
    reasoning_efforts: parseEfforts(raw),
  };
}

async function fetchCatalog(): Promise<Catalog | null> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.value;
  if (catalogRequest) return catalogRequest;
  catalogRequest = (async () => {
    try {
      const response = await fetch(CATALOG_URL, {
        signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const value = await response.json() as Catalog;
      catalogCache = { value, expiresAt: Date.now() + CATALOG_TTL_MS };
      return value;
    } catch (error) {
      logger.warn("Model metadata catalog unavailable", { error: String(error) });
      const value = catalogCache?.value ?? null;
      catalogCache = { value, expiresAt: Date.now() + 5 * 60 * 1_000 };
      return value;
    } finally {
      catalogRequest = null;
    }
  })();
  return catalogRequest;
}

function catalogProviderPriority(protocol: ProviderProtocol, modelId: string): string[] {
  const namespace = modelId.includes("/") ? modelId.split("/", 1)[0].toLowerCase() : "";
  const aliases: Record<string, string[]> = {
    codex: ["openai"],
    openai: ["openai"],
    anthropic: ["anthropic"],
    antigravity: ["google", "anthropic"],
    qwen: ["alibaba", "qwen"],
    freebuff: [namespace],
    atomesus: [],
  };
  return [namespace, ...aliases[protocol]].filter(Boolean);
}

function findCatalogModel(catalog: Catalog | null, protocol: ProviderProtocol, modelId: string): CatalogModel | null {
  if (!catalog) return null;
  const normalized = modelId.replace(/^models\//, "").replace(/^googleantigravity\//i, "");
  const bare = normalized.includes("/") ? normalized.slice(normalized.indexOf("/") + 1) : normalized;
  const entries = Object.entries(catalog);
  const preferred = catalogProviderPriority(protocol, normalized);
  const ordered = [
    ...preferred.flatMap((hint) => entries.filter(([key, provider]) =>
      key.toLowerCase() === hint || provider.id?.toLowerCase() === hint || provider.name?.toLowerCase() === hint)),
    ...entries,
  ];
  const seen = new Set<string>();
  for (const [providerId, provider] of ordered) {
    if (seen.has(providerId)) continue;
    seen.add(providerId);
    const found = provider.models?.[normalized] ?? provider.models?.[bare] ??
      Object.values(provider.models ?? {}).find((model) => model.id === normalized || model.id === bare);
    if (found) return found;
  }
  return null;
}

function familyDefaults(protocol: ProviderProtocol, modelId: string): ModelMetadataInput {
  const id = modelId.toLowerCase();
  const reasoning = /(^|[/:-])(o[134]|gpt-5|codex|claude|gemini|qwen|qwq|deepseek-r1|glm-4\.5|glm-5)/.test(id) ||
    /reason|think/.test(id);
  const vision = /vision|image|gemini|(^|[/:-])gpt-4o|claude/.test(id);
  const protocolDefaults: Partial<ModelCapabilities> = protocol === "atomesus"
    ? { reasoning: true, tools: false, vision: false, attachments: true, streaming: true, non_streaming: true }
    : protocol === "codex"
      ? { reasoning: true, tools: true, streaming: true, non_streaming: true }
      : protocol === "anthropic"
        ? { tools: true, vision: true, attachments: true, streaming: true, non_streaming: true }
        : protocol === "antigravity"
          ? { tools: true, streaming: true, non_streaming: true }
          : protocol === "qwen" || protocol === "freebuff" || protocol === "openai"
            ? { streaming: true, non_streaming: true }
            : {};
  return {
    capabilities: {
      ...protocolDefaults,
      ...(reasoning ? { reasoning: true } : {}),
      ...(vision ? { vision: true } : {}),
    },
    reasoning_efforts: protocol === "atomesus" || reasoning
      ? effortRows(["low", "medium", "high"])
      : undefined,
  };
}

function catalogMetadata(model: CatalogModel | null): ModelMetadataInput {
  return model ? parseRawModelMetadata(model) : {};
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
  modelId: string,
  raw: any = {},
  catalogOverride?: Catalog | null,
): Promise<ModelMetadataInput> {
  const catalog = catalogOverride === undefined ? await fetchCatalog() : catalogOverride;
  const resolved = mergeMetadata(
    parseRawModelMetadata(raw),
    catalogMetadata(findCatalogModel(catalog, protocol, modelId)),
    familyDefaults(protocol, modelId),
  );
  if (resolved.capabilities?.reasoning === false)
    resolved.reasoning_efforts = undefined;
  return resolved;
}

export function resetModelMetadataCatalogCacheForTests(): void {
  catalogCache = null;
  catalogRequest = null;
}
