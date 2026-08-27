import { getDb } from "../db/connection";
import { isBlockedAntigravityModel } from "../integrations/antigravity/antigravity.models";
import { generateDisplayName } from "./model-name";
import { providerAvatarSources, resolveProviderAvatar, type ProviderProtocol } from "./provider-appearance";

export type ThinkOpeningTagMode = "off" | "detect" | "force";
export type MaxOutputTokensSource = "auto" | "api" | "manual";

export function automaticMaxOutputTokens(contextWindow: number | null | undefined): number {
  return contextWindow != null && contextWindow <= 131_072
    ? Math.floor(contextWindow / 2)
    : 128_000;
}

const thinkOpeningTagModes: ThinkOpeningTagMode[] = ["off", "detect", "force"];

export interface Model {
  id: string;
  provider_id: string;
  model_id: string;
  pretty_id: string | null;
  display_name: string | null;
  is_manual: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  context_window: number | null;
  max_output_tokens: number | null;
  max_output_tokens_source: MaxOutputTokensSource;
  max_output_tokens_is_default: boolean;
  think_opening_tag_mode: ThinkOpeningTagMode;
  fix_missing_think_opening_tag: boolean;
  capabilities: ModelCapabilities;
  reasoning_efforts: ReasoningEffort[];
  pricing_tiers?: PricingTier[];
}

export const capabilityKeys = [
  "reasoning",
  "tools",
  "vision",
  "attachments",
  "streaming",
  "non_streaming",
] as const;

export type ModelCapabilities = Record<(typeof capabilityKeys)[number], boolean | null>;

export interface ReasoningEffort {
  effort: string;
  display_name: string;
  upstream_value: string;
  sort_order: number;
  is_default: boolean;
}

export interface ModelMetadataInput {
  context_window?: number | null;
  max_output_tokens?: number | null;
  max_output_tokens_source?: MaxOutputTokensSource;
  think_opening_tag_mode?: ThinkOpeningTagMode;
  fix_missing_think_opening_tag?: boolean;
  capabilities?: Partial<ModelCapabilities>;
  reasoning_efforts?: ReasoningEffort[];
}

export interface PricingTier {
  id?: string;
  threshold_tokens: number;
  input_per_million: number;
  output_per_million: number;
  cache_read_per_million: number;
  cache_write_per_million: number;
}

export interface ModelWithProvider extends Model {
  provider_name: string;
  provider_avatar: string | null;
  provider_avatar_sources: string[];
}

export type CreateModelInput = ModelMetadataInput & {
  provider_id: string;
  model_id: string;
  pretty_id?: string | null;
  display_name?: string;
  is_manual?: number;
  is_active?: number;
  pricing_tiers?: PricingTier[];
};

export class InvalidModelMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidModelMetadataError";
  }
}

export class DuplicateProviderModelError extends Error {
  constructor(public readonly modelId: string) {
    super(
      `The model "${modelId}" already exists for this provider. Choose another model ID or edit the existing model.`,
    );
    this.name = "DuplicateProviderModelError";
  }
}

export class DuplicatePrettyModelIdError extends Error {
  constructor(public readonly prettyId: string) {
    super(`The public model ID "${prettyId}" already exists for this provider.`);
    this.name = "DuplicatePrettyModelIdError";
  }
}

export function validatePrettyId(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") return null;
  const normalized = value.trim();
  if (normalized.length > 80 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized))
    throw new InvalidModelMetadataError("pretty_id must use 1-80 letters, numbers, dots, hyphens, or underscores");
  return normalized;
}

export function providerModelPublicId(providerName: string, model: Pick<Model, "model_id" | "pretty_id">): string {
  const prefix = providerName.toLowerCase().replace(/\s+/g, "");
  return `${prefix}/${model.pretty_id ?? model.model_id}`;
}

export function generatePrettyId(source: string): string {
  const value = source.trim().toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (value || "model").slice(0, 80).replace(/-+$/g, "") || "model";
}

const codexPricingDefaults: Record<string, PricingTier> = {
  "gpt-5.4": {
    threshold_tokens: 0,
    input_per_million: 2.5,
    output_per_million: 15,
    cache_read_per_million: 0.25,
    cache_write_per_million: 0,
  },
  "gpt-5.4-mini": {
    threshold_tokens: 0,
    input_per_million: 0.75,
    output_per_million: 4.5,
    cache_read_per_million: 0.075,
    cache_write_per_million: 0,
  },
  "gpt-5.3-codex": {
    threshold_tokens: 0,
    input_per_million: 1.75,
    output_per_million: 14,
    cache_read_per_million: 0.175,
    cache_write_per_million: 0,
  },
  "gpt-5.5": {
    threshold_tokens: 0,
    input_per_million: 5,
    output_per_million: 30,
    cache_read_per_million: 0.5,
    cache_write_per_million: 0,
  },
  "gpt-5.6-luna": {
    threshold_tokens: 0,
    input_per_million: 0.2,
    output_per_million: 1.2,
    cache_read_per_million: 0.02,
    cache_write_per_million: 0.25,
  },
  "gpt-5.6-sol": {
    threshold_tokens: 0,
    input_per_million: 4,
    output_per_million: 20,
    cache_read_per_million: 0.4,
    cache_write_per_million: 0,
  },
  "gpt-5.6-terra": {
    threshold_tokens: 0,
    input_per_million: 2,
    output_per_million: 12,
    cache_read_per_million: 0.2,
    cache_write_per_million: 0,
  },
};

const antigravityPricingDefaults: Record<string, PricingTier> = {
  "claude-opus-4-6-thinking": {
    threshold_tokens: 0,
    input_per_million: 15,
    output_per_million: 75,
    cache_read_per_million: 1.5,
    cache_write_per_million: 0,
  },
  "claude-sonnet-4-6": {
    threshold_tokens: 0,
    input_per_million: 3,
    output_per_million: 15,
    cache_read_per_million: 0.3,
    cache_write_per_million: 0,
  },
  "gemini-2.5-flash": {
    threshold_tokens: 0,
    input_per_million: 0.3,
    output_per_million: 2.5,
    cache_read_per_million: 0.03,
    cache_write_per_million: 0,
  },
  "gemini-2.5-flash-lite": {
    threshold_tokens: 0,
    input_per_million: 0.1,
    output_per_million: 0.4,
    cache_read_per_million: 0.01,
    cache_write_per_million: 0,
  },
  "gemini-2.5-flash-thinking": {
    threshold_tokens: 0,
    input_per_million: 0.3,
    output_per_million: 2.5,
    cache_read_per_million: 0.03,
    cache_write_per_million: 0,
  },
  "gemini-2.5-pro": {
    threshold_tokens: 0,
    input_per_million: 1.25,
    output_per_million: 10,
    cache_read_per_million: 0.125,
    cache_write_per_million: 0,
  },
  "gemini-3-flash": {
    threshold_tokens: 0,
    input_per_million: 0.9,
    output_per_million: 5.4,
    cache_read_per_million: 0.09,
    cache_write_per_million: 0,
  },
  "gemini-3-flash-agent": {
    threshold_tokens: 0,
    input_per_million: 0.9,
    output_per_million: 5.4,
    cache_read_per_million: 0.09,
    cache_write_per_million: 0,
  },
  "gemini-3.1-flash-image": {
    threshold_tokens: 0,
    input_per_million: 0.3,
    output_per_million: 2.5,
    cache_read_per_million: 0.03,
    cache_write_per_million: 0,
  },
  "gemini-3.1-flash-lite": {
    threshold_tokens: 0,
    input_per_million: 0.1,
    output_per_million: 0.4,
    cache_read_per_million: 0.01,
    cache_write_per_million: 0,
  },
  "gemini-3.1-pro-high": {
    threshold_tokens: 0,
    input_per_million: 2,
    output_per_million: 12,
    cache_read_per_million: 0.2,
    cache_write_per_million: 0,
  },
  "gemini-3.1-pro-low": {
    threshold_tokens: 0,
    input_per_million: 2,
    output_per_million: 12,
    cache_read_per_million: 0.2,
    cache_write_per_million: 0,
  },
  "gemini-pro-agent": {
    threshold_tokens: 0,
    input_per_million: 2,
    output_per_million: 12,
    cache_read_per_million: 0.2,
    cache_write_per_million: 0,
  },
  "gemini-3.5-flash-extra-low": {
    threshold_tokens: 0,
    input_per_million: 1.5,
    output_per_million: 9,
    cache_read_per_million: 0.15,
    cache_write_per_million: 0,
  },
  "gemini-3.5-flash-low": {
    threshold_tokens: 0,
    input_per_million: 1.5,
    output_per_million: 9,
    cache_read_per_million: 0.15,
    cache_write_per_million: 0,
  },
  "gemini-3.6-flash-high": {
    threshold_tokens: 0,
    input_per_million: 1.5,
    output_per_million: 7.5,
    cache_read_per_million: 0.15,
    cache_write_per_million: 0,
  },
  "gemini-3.6-flash-medium": {
    threshold_tokens: 0,
    input_per_million: 1.5,
    output_per_million: 7.5,
    cache_read_per_million: 0.15,
    cache_write_per_million: 0,
  },
  "gemini-3.6-flash-low": {
    threshold_tokens: 0,
    input_per_million: 1.5,
    output_per_million: 7.5,
    cache_read_per_million: 0.15,
    cache_write_per_million: 0,
  },
  "gpt-oss-120b-medium": {
    threshold_tokens: 0,
    input_per_million: 0.09,
    output_per_million: 0.36,
    cache_read_per_million: 0,
    cache_write_per_million: 0,
  },
};

function defaultPricing(
  providerId: string,
  modelId: string,
): PricingTier[] | undefined {
  const db = getDb();
  const provider = db
    .query("SELECT protocol FROM providers WHERE id = ?")
    .get(providerId) as { protocol: string } | null;
  if (provider?.protocol !== "codex" && provider?.protocol !== "antigravity")
    return undefined;
  const normalizedModelId = modelId
    .trim()
    .toLowerCase()
    .replace(/^googleantigravity\//, "");
  const tier =
    provider.protocol === "codex"
      ? codexPricingDefaults[normalizedModelId]
      : antigravityPricingDefaults[normalizedModelId];
  return tier ? [{ ...tier }] : undefined;
}

function savePricing(modelId: string, tiers?: PricingTier[]) {
  if (!tiers) return;
  const db = getDb();
  db.query("DELETE FROM model_pricing_tiers WHERE model_id = ?").run(modelId);
  const unique = new Map<number, PricingTier>();
  for (const tier of tiers)
    unique.set(
      Math.max(0, Math.floor(Number(tier.threshold_tokens) || 0)),
      tier,
    );
  for (const tier of [...unique.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, tier]) => tier)) {
    db.query(
      "INSERT INTO model_pricing_tiers (id, model_id, threshold_tokens, input_per_million, output_per_million, cache_read_per_million, cache_write_per_million) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      crypto.randomUUID(),
      modelId,
      Math.max(0, Math.floor(Number(tier.threshold_tokens) || 0)),
      Number(tier.input_per_million) || 0,
      Number(tier.output_per_million) || 0,
      Number(tier.cache_read_per_million) || 0,
      Number(tier.cache_write_per_million) || 0,
    );
  }
}

function validateMetadata(input: ModelMetadataInput): void {
  if (
    input.think_opening_tag_mode !== undefined &&
    !thinkOpeningTagModes.includes(input.think_opening_tag_mode)
  )
    throw new InvalidModelMetadataError(
      "think_opening_tag_mode must be off, detect, or force",
    );
  for (const [name, value] of [
    ["context_window", input.context_window],
    ["max_output_tokens", input.max_output_tokens],
  ] as const) {
    if (value !== undefined && value !== null && (!Number.isInteger(value) || value <= 0))
      throw new InvalidModelMetadataError(`${name} must be a positive integer or null`);
  }
  if (input.capabilities) {
    for (const key of Object.keys(input.capabilities)) {
      if (!capabilityKeys.includes(key as (typeof capabilityKeys)[number]))
        throw new InvalidModelMetadataError(`Unknown capability: ${key}`);
      const value = input.capabilities[key as keyof ModelCapabilities];
      if (value !== undefined && value !== null && typeof value !== "boolean")
        throw new InvalidModelMetadataError(`${key} capability must be boolean or null`);
    }
  }
  if (input.reasoning_efforts) {
    const names = new Set<string>();
    let defaults = 0;
    for (const effort of input.reasoning_efforts) {
      if (!effort.effort.trim() || !effort.display_name.trim() || !effort.upstream_value.trim())
        throw new InvalidModelMetadataError("Reasoning effort fields cannot be empty");
      if (!Number.isInteger(effort.sort_order))
        throw new InvalidModelMetadataError("Reasoning effort sort_order must be an integer");
      if (names.has(effort.effort))
        throw new InvalidModelMetadataError(`Duplicate reasoning effort: ${effort.effort}`);
      names.add(effort.effort);
      if (effort.is_default) defaults++;
    }
    if (defaults > 1)
      throw new InvalidModelMetadataError("Only one reasoning effort can be default");
  }
}

function saveMetadata(modelId: string, input: ModelMetadataInput): void {
  const db = getDb();
  validateMetadata(input);
  const scalarUpdates: string[] = [];
  const scalarValues: Array<number | null | string> = [];
  if (input.context_window !== undefined) {
    scalarUpdates.push("context_window = ?");
    scalarValues.push(input.context_window);
  }
  if (input.max_output_tokens !== undefined) {
    const effectiveMax = input.max_output_tokens == null
      ? automaticMaxOutputTokens(input.context_window ?? (db.query("SELECT context_window FROM models WHERE id = ?").get(modelId) as { context_window: number | null } | null)?.context_window)
      : input.max_output_tokens;
    scalarUpdates.push("max_output_tokens = ?");
    scalarValues.push(effectiveMax);
    scalarUpdates.push("max_output_tokens_source = ?");
    scalarValues.push(input.max_output_tokens == null ? "auto" : input.max_output_tokens_source ?? "manual");
  }
  if (scalarUpdates.length)
    db.query(`UPDATE models SET ${scalarUpdates.join(", ")} WHERE id = ?`).run(...scalarValues, modelId);

  if (input.capabilities !== undefined) {
    const existing = db.query("SELECT * FROM model_capabilities WHERE model_id = ?").get(modelId) as
      | (Record<string, number | null> & { model_id: string })
      | null;
    const values = capabilityKeys.map((key) => {
      const value = input.capabilities?.[key];
      if (value === undefined) return existing?.[key] ?? null;
      return value === null ? null : value ? 1 : 0;
    });
    db.query(`INSERT INTO model_capabilities (model_id, ${capabilityKeys.join(", ")})
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(model_id) DO UPDATE SET ${capabilityKeys.map((key) => `${key} = excluded.${key}`).join(", ")}`)
      .run(modelId, ...values);
  }
  if (input.reasoning_efforts !== undefined) {
    db.query("DELETE FROM model_reasoning_efforts WHERE model_id = ?").run(modelId);
    for (const effort of input.reasoning_efforts)
      db.query("INSERT INTO model_reasoning_efforts (id, model_id, effort, display_name, upstream_value, sort_order, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(crypto.randomUUID(), modelId, effort.effort.trim(), effort.display_name.trim(), effort.upstream_value.trim(), effort.sort_order, effort.is_default ? 1 : 0);
  }
}

function seedMissingMetadata(modelId: string, input: ModelMetadataInput): void {
  const db = getDb();
  const model = db
    .query("SELECT context_window, max_output_tokens FROM models WHERE id = ?")
    .get(modelId) as { context_window: number | null; max_output_tokens: number | null };
  const capabilities = db
    .query("SELECT reasoning, tools, vision, attachments, streaming, non_streaming FROM model_capabilities WHERE model_id = ?")
    .get(modelId) as Record<(typeof capabilityKeys)[number], number | null> | null;
  const seededCapabilities = input.capabilities
    ? Object.fromEntries(
        capabilityKeys.map((key) => [
          key,
          capabilities?.[key] == null ? input.capabilities?.[key] : undefined,
        ]),
      ) as Partial<ModelCapabilities>
    : undefined;
  const hasEfforts = Boolean(
    db.query("SELECT 1 FROM model_reasoning_efforts WHERE model_id = ? LIMIT 1").get(modelId),
  );
  saveMetadata(modelId, {
    context_window: model.context_window == null ? input.context_window : undefined,
    max_output_tokens: model.max_output_tokens == null ? input.max_output_tokens : undefined,
    capabilities: seededCapabilities,
    reasoning_efforts: hasEfforts ? undefined : input.reasoning_efforts,
  });
}

function refreshSyncedMetadata(modelId: string, input: ModelMetadataInput): void {
  const db = getDb();
  const existing = db.query("SELECT context_window, max_output_tokens_source FROM models WHERE id = ?").get(modelId) as { context_window: number | null; max_output_tokens_source: MaxOutputTokensSource };
  const context = input.context_window ?? existing.context_window;
  if (existing.max_output_tokens_source === "manual") {
    saveMetadata(modelId, { ...input, max_output_tokens: undefined });
    return;
  }
  saveMetadata(modelId, {
    ...input,
    max_output_tokens: input.max_output_tokens ?? automaticMaxOutputTokens(context),
    max_output_tokens_source: input.max_output_tokens != null ? "api" : "auto",
  });
}

function resolveThinkOpeningTagMode(
  input: ModelMetadataInput,
  existingMode: ThinkOpeningTagMode = "off",
): ThinkOpeningTagMode {
  if (input.think_opening_tag_mode !== undefined)
    return input.think_opening_tag_mode;
  if (input.fix_missing_think_opening_tag === false) return "off";
  if (input.fix_missing_think_opening_tag === true)
    return existingMode === "force" ? "force" : "detect";
  return existingMode;
}

function hydrate(model: Model | null): Model | null {
  if (!model) return null;
  const db = getDb();
  const capabilities = db
    .query("SELECT reasoning, tools, vision, attachments, streaming, non_streaming FROM model_capabilities WHERE model_id = ?")
    .get(model.id) as Record<(typeof capabilityKeys)[number], number | null> | null;
  const source = model.max_output_tokens_source ?? (model.is_manual ? "manual" : "api");
  const maxOutput = model.max_output_tokens ?? automaticMaxOutputTokens(model.context_window);
  return {
    ...model,
    context_window: model.context_window ?? null,
    max_output_tokens: maxOutput,
    max_output_tokens_source: source,
    max_output_tokens_is_default: source === "auto",
    think_opening_tag_mode: model.think_opening_tag_mode,
    fix_missing_think_opening_tag: model.think_opening_tag_mode !== "off",
    capabilities: Object.fromEntries(
      capabilityKeys.map((key) => {
        const value = capabilities?.[key];
        return [key, value == null ? null : Boolean(value)];
      }),
    ) as ModelCapabilities,
    reasoning_efforts: (db.query("SELECT effort, display_name, upstream_value, sort_order, is_default FROM model_reasoning_efforts WHERE model_id = ? ORDER BY sort_order ASC, effort ASC").all(model.id) as Array<Omit<ReasoningEffort, "is_default"> & { is_default: number }>).map((effort) => ({ ...effort, is_default: Boolean(effort.is_default) })),
    pricing_tiers: db
      .query(
        "SELECT id, threshold_tokens, input_per_million, output_per_million, cache_read_per_million, cache_write_per_million FROM model_pricing_tiers WHERE model_id = ? ORDER BY threshold_tokens ASC",
      )
      .all(model.id) as PricingTier[],
  };
}

export const modelService = {
  findByProviderAndModel(providerId: string, modelId: string): Model | null {
    const db = getDb();
    return hydrate(
      db
        .query("SELECT * FROM models WHERE provider_id = ? AND model_id = ?")
        .get(providerId, modelId) as Model | null,
    );
  },

  findByPublicId(providerId: string, publicId: string): Model | null {
    const db = getDb();
    const model = db.query("SELECT * FROM models WHERE provider_id = ? AND (pretty_id = ? OR (pretty_id IS NULL AND model_id = ?))").get(providerId, publicId, publicId) as Model | null;
    return hydrate(model);
  },

  generateUniquePrettyId(providerId: string, source: string): string {
    const base = generatePrettyId(source);
    const db = getDb();
    let candidate = base;
    let suffix = 2;
    while (db.query("SELECT 1 FROM models WHERE provider_id = ? AND pretty_id = ? LIMIT 1").get(providerId, candidate)) {
      candidate = `${base.slice(0, Math.max(1, 80 - String(suffix).length - 1))}-${suffix++}`;
    }
    return candidate;
  },

  findByProvider(providerId: string): Model[] {
    const db = getDb();
    return db
      .query(
        `SELECT m.* FROM models m
       JOIN providers p ON p.id = m.provider_id
       WHERE m.provider_id = ?
         AND NOT (p.protocol = 'antigravity' AND lower(m.model_id) IN ('chat_20706', 'chat_23310', 'tab_flash_lite_preview', 'tab_jump_flash_lite_preview', 'tab_flash_lite_previewtab_jump_flash_lite_preview'))
         AND NOT (p.protocol = 'antigravity' AND lower(m.model_id) LIKE '%gemini-3.6-flash-tiered%')
       ORDER BY m.model_id ASC`,
      )
      .all(providerId)
      .map((model) => hydrate(model as Model)!) as Model[];
  },

  findAllActive(): Model[] {
    const db = getDb();
    return db
      .query(
        `SELECT m.* FROM models m
         JOIN providers p ON p.id = m.provider_id
         WHERE m.is_active = 1 AND p.is_active = 1
           AND NOT (p.protocol = 'antigravity' AND lower(m.model_id) IN ('chat_20706', 'chat_23310', 'tab_flash_lite_preview', 'tab_jump_flash_lite_preview', 'tab_flash_lite_previewtab_jump_flash_lite_preview'))
           AND NOT (p.protocol = 'antigravity' AND lower(m.model_id) LIKE '%gemini-3.6-flash-tiered%')
         ORDER BY m.model_id ASC`,
      )
      .all()
      .map((model) => hydrate(model as Model)!) as Model[];
  },

  findAllActiveWithProvider(): ModelWithProvider[] {
    const db = getDb();
    const models = db
      .query(
        `SELECT m.*, p.name as provider_name, p.avatar as provider_avatar, p.base_url as provider_base_url, p.protocol as provider_protocol FROM models m
         JOIN providers p ON p.id = m.provider_id
         WHERE m.is_active = 1 AND p.is_active = 1
         ORDER BY p.name ASC, m.model_id ASC`,
      )
      .all() as (ModelWithProvider & {
      provider_base_url: string;
       provider_protocol: ProviderProtocol;
    })[];

    return models
      .filter(
        (model) =>
          !(
            model.provider_protocol === "antigravity" &&
            isBlockedAntigravityModel(model.model_id)
          ),
      )
      .map(({ provider_base_url, provider_protocol, ...model }) => ({
        ...model,
         ...hydrate(model),
        provider_avatar: resolveProviderAvatar(
          model.provider_avatar,
          provider_protocol,
          provider_base_url,
        ),
        provider_avatar_sources: providerAvatarSources(
          model.provider_avatar,
          provider_protocol,
          provider_base_url,
        ),
      }));
  },

  findById(id: string): Model | null {
    const db = getDb();
    return hydrate(
      db.query("SELECT * FROM models WHERE id = ?").get(id) as Model | null,
    );
  },

  upsert(input: CreateModelInput): Model {
    const db = getDb();
    validateMetadata(input);
    const requestedPrettyId = validatePrettyId(input.pretty_id);
    const pricingTiers =
      input.pricing_tiers ?? defaultPricing(input.provider_id, input.model_id);
    const metadataInput: ModelMetadataInput = {
      ...input,
      ...(input.max_output_tokens != null
        ? { max_output_tokens_source: input.is_manual === 1 ? "manual" : "api" }
        : { max_output_tokens_source: "auto" }),
    };
    const existing = db
      .query("SELECT * FROM models WHERE provider_id = ? AND model_id = ?")
      .get(input.provider_id, input.model_id) as Model | null;

    if (requestedPrettyId) {
      const duplicate = db.query("SELECT id FROM models WHERE provider_id = ? AND pretty_id = ? AND id != ?").get(input.provider_id, requestedPrettyId, existing?.id ?? "") as { id: string } | null;
      if (duplicate) throw new DuplicatePrettyModelIdError(requestedPrettyId);
    }
    if (existing) {
      db.transaction(() => {
        const syncingManualModel = Boolean(existing.is_manual && input.is_manual === 0);
        const prettyId = requestedPrettyId ?? existing.pretty_id;

        const displayName = syncingManualModel
          ? existing.display_name
          : input.display_name?.trim() || generateDisplayName(input.model_id);
         const resolvedMode = resolveThinkOpeningTagMode(
          input,
          existing.think_opening_tag_mode,
        );
         db.query("UPDATE models SET pretty_id = ?, display_name = ?, is_active = ?, think_opening_tag_mode = ?, fix_missing_think_opening_tag = ?, updated_at = datetime('now') WHERE id = ?").run(
          prettyId,
          displayName,
          syncingManualModel ? existing.is_active : input.is_active ?? existing.is_active,
          resolvedMode,
          resolvedMode !== "off" ? 1 : 0,
          existing.id,
        );
        const hasPricing = Boolean(
          db.query("SELECT 1 FROM model_pricing_tiers WHERE model_id = ? LIMIT 1").get(existing.id),
        );
        if (!syncingManualModel && (input.pricing_tiers || !hasPricing))
          savePricing(existing.id, pricingTiers);
        if (syncingManualModel) seedMissingMetadata(existing.id, metadataInput);
        else refreshSyncedMetadata(existing.id, metadataInput);
      })();
      return this.findById(existing.id)!;
    }

    const id = crypto.randomUUID();
    db.transaction(() => {
      const resolvedMode = resolveThinkOpeningTagMode(input);
      db.query(
        "INSERT INTO models (id, provider_id, model_id, pretty_id, display_name, fix_missing_think_opening_tag, think_opening_tag_mode, is_manual, is_active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
      ).run(
        id,
        input.provider_id,
        input.model_id,
        requestedPrettyId,
        input.display_name?.trim() || generateDisplayName(input.model_id),
        resolvedMode !== "off" ? 1 : 0,
        resolvedMode,
        input.is_manual ?? 0,
        input.is_active ?? 1,
      );
      savePricing(id, pricingTiers);
      saveMetadata(id, metadataInput);
    })();
    return this.findById(id)!;
  },

  resetExisting(input: CreateModelInput): Model | null {
    const db = getDb();
    validateMetadata(input);
    const requestedPrettyId = validatePrettyId(input.pretty_id);
    const existing = db
      .query("SELECT * FROM models WHERE provider_id = ? AND model_id = ?")
      .get(input.provider_id, input.model_id) as Model | null;
    if (!existing) return null;
    if (requestedPrettyId) {
      const duplicate = db.query("SELECT id FROM models WHERE provider_id = ? AND pretty_id = ? AND id != ?").get(input.provider_id, requestedPrettyId, existing.id) as { id: string } | null;
      if (duplicate) throw new DuplicatePrettyModelIdError(requestedPrettyId);
    }
    const pricingTiers =
      input.pricing_tiers ?? defaultPricing(input.provider_id, input.model_id);
    db.transaction(() => {
      db.query(
        "UPDATE models SET pretty_id = ?, display_name = ?, is_manual = 0, is_active = ?, context_window = NULL, max_output_tokens = NULL, max_output_tokens_source = 'auto', updated_at = datetime('now') WHERE id = ?",
      ).run(
        requestedPrettyId ?? existing.pretty_id,
        input.display_name?.trim() || generateDisplayName(input.model_id),
        input.is_active ?? existing.is_active,
        existing.id,
      );
      db.query("DELETE FROM model_capabilities WHERE model_id = ?").run(existing.id);
      db.query("DELETE FROM model_reasoning_efforts WHERE model_id = ?").run(existing.id);
      if (pricingTiers !== undefined) savePricing(existing.id, pricingTiers);
      saveMetadata(existing.id, {
        context_window: input.context_window ?? null,
        max_output_tokens: input.max_output_tokens ?? null,
        capabilities: Object.fromEntries(
          capabilityKeys.map((key) => [key, input.capabilities?.[key] ?? null]),
        ) as ModelCapabilities,
        reasoning_efforts: input.reasoning_efforts ?? [],
      });
    })();
    return this.findById(existing.id);
  },

  create(input: CreateModelInput): Model {
    const existing = getDb()
      .query("SELECT id FROM models WHERE provider_id = ? AND model_id = ?")
      .get(input.provider_id, input.model_id) as { id: string } | null;
    if (existing) throw new DuplicateProviderModelError(input.model_id);
    return this.upsert(input);
  },

  toggleActive(id: string): Model | null {
    const db = getDb();
    const model = this.findById(id);
    if (!model) return null;
    const newActive = model.is_active ? 0 : 1;
    db.query("UPDATE models SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(newActive, id);
    return this.findById(id);
  },

  update(
    id: string,
    input: ModelMetadataInput & {
      model_id?: string;
      pretty_id?: string | null;
      display_name?: string | null;
      pricing_tiers?: PricingTier[];
    },
  ): Model | null {
    const db = getDb();
    validateMetadata(input);
    const existing = this.findById(id);
    if (!existing) return null;
    const requestedPrettyId = input.pretty_id === undefined ? existing.pretty_id : validatePrettyId(input.pretty_id);
    if (requestedPrettyId) {
      const duplicate = db.query("SELECT id FROM models WHERE provider_id = ? AND pretty_id = ? AND id != ?").get(existing.provider_id, requestedPrettyId, id) as { id: string } | null;
      if (duplicate) throw new DuplicatePrettyModelIdError(requestedPrettyId);
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (input.pretty_id !== undefined) {
      updates.push("pretty_id = ?");
      values.push(requestedPrettyId);
    }
    if (input.model_id !== undefined) {
      const duplicate = db
        .query(
          "SELECT id FROM models WHERE provider_id = ? AND model_id = ? AND id != ?",
        )
        .get(existing.provider_id, input.model_id, id) as { id: string } | null;
      if (duplicate) throw new DuplicateProviderModelError(input.model_id);
      updates.push("model_id = ?");
      values.push(input.model_id);
    }
    if (input.display_name !== undefined) {
      updates.push("display_name = ?");
      values.push(
        input.display_name?.trim() ||
          generateDisplayName(input.model_id ?? existing.model_id),
      );
    }
    if (input.fix_missing_think_opening_tag !== undefined) {
      updates.push("fix_missing_think_opening_tag = ?");
      values.push(input.fix_missing_think_opening_tag ? 1 : 0);
    }
    const resolvedMode = resolveThinkOpeningTagMode(
      input,
      existing.think_opening_tag_mode,
    );
    if (
      input.think_opening_tag_mode !== undefined ||
      input.fix_missing_think_opening_tag !== undefined
    ) {
      updates.push("think_opening_tag_mode = ?");
      values.push(resolvedMode);
      updates.push("fix_missing_think_opening_tag = ?");
      values.push(resolvedMode !== "off" ? 1 : 0);
    }
    db.transaction(() => {
      savePricing(id, input.pricing_tiers);
      saveMetadata(id, input);
      if (updates.length) {
        values.push(id);
        db.query(`UPDATE models SET ${updates.join(", ")} WHERE id = ?`).run(...values);
      }
      db.query("UPDATE models SET updated_at = datetime('now') WHERE id = ?").run(id);
    })();

    return this.findById(id);
  },

  remove(id: string): boolean {
    const db = getDb();
    const result = db.query("DELETE FROM models WHERE id = ?").run(id);
    return result.changes > 0;
  },

  removeByProvider(providerId: string): number {
    const db = getDb();
    const result = db
      .query("DELETE FROM models WHERE provider_id = ?")
      .run(providerId);
    return result.changes;
  },
};
