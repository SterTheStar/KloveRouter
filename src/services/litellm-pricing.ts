/** Public, keyless LiteLLM model pricing catalog client. */
export const LITELLM_PRICING_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

export interface LiteLLMRate {
  field: string;
  label: string;
  unit: string;
  usd_per_unit: number;
  display_usd: number;
  display_unit: string;
}

export type LiteLLMPricing =
  | {
      billing_unit: "token";
      input_per_million: number;
      output_per_million: number;
      cache_read_per_million: number;
      cache_write_per_million: number;
      rates: LiteLLMRate[];
    }
  | {
      billing_unit: "second" | "character" | "other" | "mixed";
      input_per_unit: number | null;
      output_per_unit: number | null;
      rates: LiteLLMRate[];
    };

type CatalogEntry = Record<string, unknown>;
type ProviderProtocol = string;

const PROVIDER_KEYS: Record<string, string[]> = {
  openai: ["openai"],
  "openai-responses": ["openai"],
  anthropic: ["anthropic"],
  antigravity: ["gemini", "vertex_ai", "google"],
  codex: ["openai"],
  chatgpt: ["openai"],
};

let catalog: Record<string, CatalogEntry> | null = null;
let catalogIndex = new Map<string, Array<{ key: string; entry: CatalogEntry; provider: string; price: LiteLLMPricing }>>();
let refreshedAt = 0;
let inFlight: Promise<boolean> | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function validCost(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number * 1_000_000 : null;
}

function priceFromEntry(entry: CatalogEntry): LiteLLMPricing | null {
  const input = validCost(entry.input_cost_per_token);
  const output = validCost(entry.output_cost_per_token);
  if (input === null || output === null) return null;
  return {
    billing_unit: "token",
    input_per_million: input,
    output_per_million: output,
    cache_read_per_million: validCost(entry.cache_read_input_token_cost) ?? input,
    cache_write_per_million: validCost(entry.cache_creation_input_token_cost) ?? 0,
    rates: extractRates(entry),
  };
}

const supportedUnits: Record<string, { unit: string; multiplier: number; displayUnit: string }> = {
  token: { unit: "token", multiplier: 1_000_000, displayUnit: "1M tokens" },
  tokens: { unit: "token", multiplier: 1_000_000, displayUnit: "1M tokens" },
  audio_token: { unit: "audio token", multiplier: 1_000_000, displayUnit: "1M audio tokens" },
  character: { unit: "character", multiplier: 1_000_000, displayUnit: "1M characters" },
  second: { unit: "second", multiplier: 1, displayUnit: "second" },
  audio_per_second: { unit: "audio second", multiplier: 1, displayUnit: "audio second" },
  video_per_second: { unit: "video second", multiplier: 1, displayUnit: "video second" },
  minute: { unit: "minute", multiplier: 1, displayUnit: "minute" },
  image: { unit: "image", multiplier: 1, displayUnit: "image" },
  page: { unit: "page", multiplier: 1, displayUnit: "page" },
  query: { unit: "query", multiplier: 1, displayUnit: "query" },
  request: { unit: "request", multiplier: 1, displayUnit: "request" },
  session: { unit: "session", multiplier: 1, displayUnit: "session" },
  pixel: { unit: "pixel", multiplier: 1_000_000, displayUnit: "1M pixels" },
  credit: { unit: "credit", multiplier: 1, displayUnit: "credit" },
  call: { unit: "call", multiplier: 1, displayUnit: "call" },
  unit: { unit: "unit", multiplier: 1, displayUnit: "unit" },
  gb: { unit: "GB", multiplier: 1, displayUnit: "GB" },
  day: { unit: "day", multiplier: 1, displayUnit: "day" },
};

function extractRates(entry: CatalogEntry): LiteLLMRate[] {
  const rates: LiteLLMRate[] = [];
  for (const [field, raw] of Object.entries(entry)) {
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) continue;
    let unitKey = field.match(/_per_([a-z_]+)$/)?.[1];
    if (field === "cache_read_input_token_cost") unitKey = "token";
    if (field === "cache_creation_input_token_cost") unitKey = "token";
    if (field === "cost_per_second") unitKey = "second";
    if (!unitKey) continue;
    const unit = supportedUnits[unitKey];
    if (!unit) continue;
    const label = field
      .replace(/_cost$/, "")
      .replace(/_per_/, " / ")
      .replace(/_/g, " ");
    rates.push({
      field,
      label,
      unit: unit.unit,
      usd_per_unit: raw,
      display_usd: raw * unit.multiplier,
      display_unit: unit.displayUnit,
    });
  }
  return rates;
}

function priceFromCatalogEntry(entry: CatalogEntry): LiteLLMPricing | null {
  const tokenPrice = priceFromEntry(entry);
  if (tokenPrice) return tokenPrice;
  const rates = extractRates(entry);
  if (!rates.length) return null;
  const units = new Set(rates.map((rate) => rate.unit));
  const billingUnit = units.size > 1 ? "mixed" : units.has("second") || units.has("audio second") || units.has("video second") ? "second" : units.has("character") ? "character" : "other";
  const input = rates.find((rate) => rate.field.startsWith("input_cost"));
  const output = rates.find((rate) => rate.field.startsWith("output_cost"));
  return { billing_unit: billingUnit, input_per_unit: input?.usd_per_unit ?? null, output_per_unit: output?.usd_per_unit ?? null, rates };
}

function validUnitCost(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function catalogProviders(protocol: ProviderProtocol, providerHint?: string): string[] {
  const hint = providerHint?.toLowerCase() ?? "";
  if (hint.includes("mistral.ai") || /\bmistral\b/.test(hint)) return ["mistral", ...(PROVIDER_KEYS[protocol] ?? [protocol])];
  return PROVIDER_KEYS[protocol] ?? [protocol];
}

function providerHintMatches(slug: string, hint?: string): boolean {
  if (!hint) return false;
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normalizedSlug = normalize(slug);
  const hintTokens = hint.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (hintTokens.some((token) => normalize(token) === normalizedSlug)) return true;
  const slugTokens = slug.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const meaningfulSlugTokens = slugTokens.filter((token) => !["ai", "api", "cloud", "labs", "tech"].includes(token));
  if (meaningfulSlugTokens.some((token) => hintTokens.some((hintToken) => normalize(hintToken) === normalize(token)))) return true;
  try {
    const host = new URL(hint.match(/https?:\/\/[^\s]+/)?.[0] ?? "").hostname.toLowerCase();
    const labels = host.split(".").filter((part) => !["www", "api", "cloud", "com", "ai", "net", "org"].includes(part));
    return labels.some((part) => {
      const normalizedPart = normalize(part);
      return normalizedPart === normalizedSlug || meaningfulSlugTokens.some((token) => normalizedPart === normalize(token));
    });
  } catch {
    return false;
  }
}

function buildCatalogIndex(data: Record<string, CatalogEntry>) {
  const index = new Map<string, Array<{ key: string; entry: CatalogEntry; provider: string; price: LiteLLMPricing }>>();
  for (const [key, entry] of Object.entries(data)) {
    if (key === "sample_spec" || key === "fallback_generalizations" || !entry || typeof entry !== "object") continue;
    const price = priceFromCatalogEntry(entry);
    if (!price) continue;
    const provider = typeof entry.litellm_provider === "string" ? entry.litellm_provider : key.includes("/") ? key.slice(0, key.indexOf("/")) : "";
    const modelKey = key.includes("/") ? key.slice(key.indexOf("/") + 1) : key;
    const match = { key, entry, provider, price };
    const candidates = index.get(modelKey) ?? [];
    candidates.push(match);
    index.set(modelKey, candidates);
  }
  return index;
}

/** Refreshes the in-memory catalog; stale data remains available if the request fails. */
export async function refreshLiteLLMPricing(options: { force?: boolean; fetcher?: typeof fetch } = {}): Promise<boolean> {
  if (!options.force && catalog && Date.now() - refreshedAt < CACHE_TTL_MS) return true;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const response = await (options.fetcher ?? fetch)(LITELLM_PRICING_URL, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return false;
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || Array.isArray(data)) return false;
      catalog = data as Record<string, CatalogEntry>;
      catalogIndex = buildCatalogIndex(catalog);
      refreshedAt = Date.now();
      return true;
    } catch {
      return false;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Finds provider-specific pricing for an exact upstream model id. */
export function getLiteLLMPricing(protocol: ProviderProtocol, modelId: string, providerHint?: string): LiteLLMPricing | null {
  if (!catalog) return null;
  const model = modelId.trim().replace(/^googleantigravity\//i, "").replace(/^models\//i, "");
  const preferredProviders = catalogProviders(protocol, providerHint);
  const exact = catalogIndex.get(model) ?? [];
  if (!exact.length) return null;
  const preferred = exact.filter(({ provider }) => preferredProviders.includes(provider));
  if (preferred.length === 1) return preferred[0]!.price;
  const hinted = exact.filter(({ provider }) => providerHintMatches(provider, providerHint));
  if (hinted.length === 1) return hinted[0]!.price;
  if (preferred.length > 1 || hinted.length > 1 || exact.length > 1) return null;
  return exact[0]!.price;
}

export function liteLLMPricingStatus(): { available: boolean; refreshed_at: number | null } {
  return { available: catalog !== null, refreshed_at: catalog ? refreshedAt : null };
}
