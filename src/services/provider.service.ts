import { getDb } from "../db/connection";
import type { CredentialMode } from "./credential.service";

export interface Provider {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  avatar: string | null;
  protocol: "openai" | "anthropic" | "codex" | "antigravity";
  credential_mode: CredentialMode;
  fixed_credential_id: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ProviderPublic {
  id: string;
  name: string;
  base_url: string;
  avatar: string | null;
  protocol: "openai" | "anthropic" | "codex" | "antigravity";
  credential_mode: CredentialMode;
  fixed_credential_id: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export type CreateProviderInput = {
  name: string;
  base_url: string;
  api_key: string;
  avatar?: string;
  protocol?: "openai" | "anthropic" | "codex" | "antigravity";
  credential_mode?: CredentialMode;
  fixed_credential_id?: string | null;
};

export type UpdateProviderInput = {
  name?: string;
  base_url?: string;
  api_key?: string;
  avatar?: string | null;
  protocol?: "openai" | "anthropic" | "codex" | "antigravity";
  credential_mode?: CredentialMode;
  fixed_credential_id?: string | null;
  is_active?: number;
};

function getFaviconUrl(baseUrl: string): string | null {
  try {
    const hostname = new URL(baseUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return null;
  }
}

function defaultProviderAvatar(protocol: Provider["protocol"]): string | null {
  if (protocol === "antigravity") return "https://antigravity.google/assets/image/brand/antigravity-icon__full-color.png";
  if (protocol === "codex") return "https://openai.com/favicon.ico";
  return null;
}

function toPublic(p: Provider): ProviderPublic {
  return {
    id: p.id,
    name: p.name,
    base_url: p.base_url,
    avatar: p.avatar ?? defaultProviderAvatar(p.protocol) ?? getFaviconUrl(p.base_url),
    protocol: p.protocol ?? "openai",
    credential_mode: p.credential_mode ?? "fixed",
    fixed_credential_id: p.fixed_credential_id ?? null,
    is_active: p.is_active,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

export const providerService = {
  findAll(): ProviderPublic[] {
    const db = getDb();
    return (db
      .query("SELECT * FROM providers ORDER BY created_at DESC")
      .all() as Provider[]).map(toPublic);
  },

  findById(id: string): Provider | null {
    const db = getDb();
    return db
      .query("SELECT * FROM providers WHERE id = ?")
      .get(id) as Provider | null;
  },

  findPublicById(id: string): ProviderPublic | null {
    const p = this.findById(id);
    return p ? toPublic(p) : null;
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
      "INSERT INTO providers (id, name, base_url, api_key, avatar, protocol) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, input.name, input.base_url.replace(/\/+$/, ""), input.api_key, input.avatar ?? defaultProviderAvatar(input.protocol ?? "openai"), input.protocol ?? "openai");
    const credentialId = crypto.randomUUID();
     db.query("INSERT INTO provider_credentials (id, provider_id, label, kind, secret) VALUES (?, ?, ?, ?, ?)").run(credentialId, id, input.protocol === "codex" ? "Codex session" : input.protocol === "antigravity" ? "Google account" : "Default API key", input.protocol === "codex" ? "codex" : input.protocol === "antigravity" ? "antigravity" : "api_key", input.protocol === "antigravity" ? null : input.api_key);
    db.query("UPDATE providers SET fixed_credential_id = ? WHERE id = ?").run(credentialId, id);
    return this.findPublicById(id)!;
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
      db.query("UPDATE provider_credentials SET secret = ?, updated_at = datetime('now') WHERE provider_id = ? AND id = COALESCE((SELECT fixed_credential_id FROM providers WHERE id = ?), id) AND kind = 'api_key'").run(input.api_key, id, id);
    }
    if (input.avatar !== undefined) {
      updates.push("avatar = ?");
      values.push(input.avatar);
    }
    if (input.protocol !== undefined) {
      updates.push("protocol = ?");
      values.push(input.protocol);
    }
    if (input.credential_mode !== undefined) { updates.push("credential_mode = ?"); values.push(input.credential_mode); }
    if (input.fixed_credential_id !== undefined) { updates.push("fixed_credential_id = ?"); values.push(input.fixed_credential_id); }
    if (input.is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(input.is_active);
    }

    if (updates.length === 0) return this.findPublicById(id);

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.query(
      `UPDATE providers SET ${updates.join(", ")} WHERE id = ?`
    ).run(...values);

    return this.findPublicById(id);
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
