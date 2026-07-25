import { getDb } from "../db/connection";

export interface Model {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string | null;
  is_manual: number;
  is_active: number;
  created_at: string;
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
};

export const modelService = {
  findByProvider(providerId: string): Model[] {
    const db = getDb();
    return db
      .query(
        "SELECT * FROM models WHERE provider_id = ? ORDER BY model_id ASC"
      )
      .all(providerId) as Model[];
  },

  findAllActive(): Model[] {
    const db = getDb();
    return db
      .query(
        `SELECT m.* FROM models m
         JOIN providers p ON p.id = m.provider_id
         WHERE m.is_active = 1 AND p.is_active = 1
         ORDER BY m.model_id ASC`
      )
      .all() as Model[];
  },

  findAllActiveWithProvider(): ModelWithProvider[] {
    const db = getDb();
    return db
      .query(
        `SELECT m.*, p.name as provider_name, p.avatar as provider_avatar FROM models m
         JOIN providers p ON p.id = m.provider_id
         WHERE m.is_active = 1 AND p.is_active = 1
         ORDER BY p.name ASC, m.model_id ASC`
      )
      .all() as ModelWithProvider[];
  },

  findById(id: string): Model | null {
    const db = getDb();
    return db.query("SELECT * FROM models WHERE id = ?").get(id) as Model | null;
  },

  upsert(input: CreateModelInput): Model {
    const db = getDb();
    const existing = db
      .query("SELECT * FROM models WHERE provider_id = ? AND model_id = ?")
      .get(input.provider_id, input.model_id) as Model | null;

    if (existing) {
      db.query(
        "UPDATE models SET is_manual = ?, display_name = ?, is_active = 1, created_at = datetime('now') WHERE id = ?"
      ).run(input.is_manual ?? 0, input.display_name ?? null, existing.id);
      return this.findById(existing.id)!;
    }

    const id = crypto.randomUUID();
    db.query(
      "INSERT INTO models (id, provider_id, model_id, display_name, is_manual) VALUES (?, ?, ?, ?, ?)"
    ).run(
      id,
      input.provider_id,
      input.model_id,
      input.display_name ?? null,
      input.is_manual ?? 0
    );
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
    input: { model_id?: string; display_name?: string | null }
  ): Model | null {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: any[] = [];

    if (input.model_id !== undefined) {
      updates.push("model_id = ?");
      values.push(input.model_id);
    }
    if (input.display_name !== undefined) {
      updates.push("display_name = ?");
      values.push(input.display_name);
    }

    if (updates.length === 0) return existing;

    values.push(id);
    db.query(
      `UPDATE models SET ${updates.join(", ")} WHERE id = ?`
    ).run(...values);

    return this.findById(id);
  },

  remove(id: string): boolean {
    const db = getDb();
    const result = db.query("DELETE FROM models WHERE id = ?").run(id);
    return result.changes > 0;
  },

  removeByProvider(providerId: string): number {
    const db = getDb();
    const result = db.query("DELETE FROM models WHERE provider_id = ?").run(providerId);
    return result.changes;
  },
};
