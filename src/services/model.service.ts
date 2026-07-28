import { getDb } from "../db/connection";
import { isBlockedAntigravityModel } from "../integrations/antigravity/antigravity.models";
import { generateDisplayName } from "./model-name";
import { resolveProviderAvatar, type ProviderProtocol } from "./provider-appearance";

export interface Model {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string | null;
  is_manual: number;
  is_active: number;
  created_at: string;
  pricing_tiers?: PricingTier[];
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
}

export type CreateModelInput = {
  provider_id: string;
  model_id: string;
  display_name?: string;
  is_manual?: number;
  is_active?: number;
  pricing_tiers?: PricingTier[];
};

export class DuplicateProviderModelError extends Error {
  constructor(public readonly modelId: string) {
    super(
      `The model "${modelId}" already exists for this provider. Choose another model ID or edit the existing model.`,
    );
    this.name = "DuplicateProviderModelError";
  }
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
  "gpt-5.5": {
    threshold_tokens: 0,
    input_per_million: 5,
    output_per_million: 30,
    cache_read_per_million: 0.5,
    cache_write_per_million: 0,
  },
  "gpt-5.6-luna": {
    threshold_tokens: 0,
    input_per_million: 1,
    output_per_million: 6,
    cache_read_per_million: 0.1,
    cache_write_per_million: 0,
  },
  "gpt-5.6-sol": {
    threshold_tokens: 0,
    input_per_million: 5,
    output_per_million: 30,
    cache_read_per_million: 0.5,
    cache_write_per_million: 0,
  },
  "gpt-5.6-terra": {
    threshold_tokens: 0,
    input_per_million: 2.5,
    output_per_million: 15,
    cache_read_per_million: 0.25,
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

function withPricing(model: Model | null): Model | null {
  if (!model) return null;
  const db = getDb();
  return {
    ...model,
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
    return withPricing(
      db
        .query("SELECT * FROM models WHERE provider_id = ? AND model_id = ?")
        .get(providerId, modelId) as Model | null,
    );
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
      .map((model) => withPricing(model as Model)!) as Model[];
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
      .all() as Model[];
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
        pricing_tiers: withPricing(model)?.pricing_tiers,
        provider_avatar: resolveProviderAvatar(
          model.provider_avatar,
          provider_protocol,
          provider_base_url,
        ),
      }));
  },

  findById(id: string): Model | null {
    const db = getDb();
    return withPricing(
      db.query("SELECT * FROM models WHERE id = ?").get(id) as Model | null,
    );
  },

  upsert(input: CreateModelInput): Model {
    const db = getDb();
    const pricingTiers =
      input.pricing_tiers ?? defaultPricing(input.provider_id, input.model_id);
    const existing = db
      .query("SELECT * FROM models WHERE provider_id = ? AND model_id = ?")
      .get(input.provider_id, input.model_id) as Model | null;

    if (existing) {
      const displayName =
        input.display_name?.trim() ||
        (existing.is_manual
          ? existing.display_name
          : generateDisplayName(input.model_id));
      db.query(
        "UPDATE models SET is_manual = ?, display_name = ?, is_active = ?, created_at = datetime('now') WHERE id = ?",
      ).run(input.is_manual ?? 0, displayName, input.is_active ?? 1, existing.id);
      const hasPricing = Boolean(
        db
          .query("SELECT 1 FROM model_pricing_tiers WHERE model_id = ? LIMIT 1")
          .get(existing.id),
      );
      if (input.pricing_tiers || !hasPricing)
        savePricing(existing.id, pricingTiers);
      return this.findById(existing.id)!;
    }

    const id = crypto.randomUUID();
    db.query(
      "INSERT INTO models (id, provider_id, model_id, display_name, is_manual, is_active) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      input.provider_id,
      input.model_id,
      input.display_name?.trim() || generateDisplayName(input.model_id),
      input.is_manual ?? 0,
      input.is_active ?? 1,
    );
    savePricing(id, pricingTiers);
    return this.findById(id)!;
  },

  create(input: CreateModelInput): Model {
    return this.upsert(input);
  },

  toggleActive(id: string): Model | null {
    const db = getDb();
    const model = this.findById(id);
    if (!model) return null;
    const newActive = model.is_active ? 0 : 1;
    db.query("UPDATE models SET is_active = ? WHERE id = ?").run(newActive, id);
    return this.findById(id);
  },

  update(
    id: string,
    input: {
      model_id?: string;
      display_name?: string | null;
      pricing_tiers?: PricingTier[];
    },
  ): Model | null {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: any[] = [];

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
    savePricing(id, input.pricing_tiers);

    if (updates.length === 0) return existing;

    values.push(id);
    db.query(`UPDATE models SET ${updates.join(", ")} WHERE id = ?`).run(
      ...values,
    );

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
