import { getDb } from "../db/connection";

export interface Provider {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  avatar: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ProviderPublic {
  id: string;
  name: string;
  base_url: string;
  avatar: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export type CreateProviderInput = {
  name: string;
  base_url: string;
  api_key: string;
  avatar?: string;
};

export type UpdateProviderInput = {
  name?: string;
  base_url?: string;
  api_key?: string;
  avatar?: string | null;
  is_active?: number;
};

function toPublic(p: Provider): ProviderPublic {
  return {
    id: p.id,
    name: p.name,
    base_url: p.base_url,
    avatar: p.avatar,
    is_active: p.is_active,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

export const providerService = {
  findAll(): ProviderPublic[] {
    const db = getDb();
    return db
      .query("SELECT id, name, base_url, avatar, is_active, created_at, updated_at FROM providers ORDER BY created_at DESC")
      .all() as ProviderPublic[];
  },

  findById(id: string): Provider | null {
    const db = getDb();
    return db
      .query("SELECT * FROM providers WHERE id = ?")
      .get(id) as Provider | null;
  },

  findByName(name: string): Provider | null {
    const db = getDb();
    return db
      .query("SELECT * FROM providers WHERE name = ?")
      .get(name) as Provider | null;
  },

  create(input: CreateProviderInput): ProviderPublic {
    const db = getDb();
    const id = crypto.randomUUID();
    db.query(
      "INSERT INTO providers (id, name, base_url, api_key, avatar) VALUES (?, ?, ?, ?, ?)"
    ).run(id, input.name, input.base_url.replace(/\/+$/, ""), input.api_key, input.avatar ?? null);
    return this.findById(id) as ProviderPublic;
  },

  update(id: string, input: UpdateProviderInput): ProviderPublic | null {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) {
      updates.push("name = ?");
      values.push(input.name);
    }
    if (input.base_url !== undefined) {
      updates.push("base_url = ?");
      values.push(input.base_url.replace(/\/+$/, ""));
    }
    if (input.api_key !== undefined) {
      updates.push("api_key = ?");
      values.push(input.api_key);
    }
    if (input.avatar !== undefined) {
      updates.push("avatar = ?");
      values.push(input.avatar);
    }
    if (input.is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(input.is_active);
    }

    if (updates.length === 0) return this.findById(id) as ProviderPublic;

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.query(
      `UPDATE providers SET ${updates.join(", ")} WHERE id = ?`
    ).run(...values);

    return this.findById(id) as ProviderPublic;
  },

  remove(id: string): boolean {
    const db = getDb();
    const result = db.query("DELETE FROM providers WHERE id = ?").run(id);
    return result.changes > 0;
  },

  toggleActive(id: string): ProviderPublic | null {
    const db = getDb();
    const provider = this.findById(id);
    if (!provider) return null;
    return this.update(id, {
      is_active: provider.is_active ? 0 : 1,
    });
  },
};
