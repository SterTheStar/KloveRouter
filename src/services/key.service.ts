import { getDb } from "../db/connection";
import { decryptSecret, encryptSecret } from "./secret.service";

export interface ApiKey {
  id: string;
  name: string;
  key_hash: string;
  key_secret: string | null;
  prefix: string;
  is_active: number;
  created_at: string;
}

export interface ApiKeyPublic {
  id: string;
  name: string;
  prefix: string;
  is_active: number;
  created_at: string;
}

// In-memory key that the panel chat ("/api/chat/completions") uses to call the
// public proxy over loopback. Unlike persisted API keys it never appears in the
// API Keys panel and is regenerated on every server restart, so it cannot be
// recovered or revoked after a crash — it only lives for this process.
let internalKeyValue: string | null = null;

function toPublic(k: ApiKey): ApiKeyPublic {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    is_active: k.is_active,
    created_at: k.created_at,
  };
}

export const keyService = {
  /**
   * Lazily generates and returns the panel's internal API key. The key is
   * accepted by `verify` but is never persisted, listed, or disclosed.
   */
  internalKey(): string {
    internalKeyValue ??=
      `kl-internal-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    return internalKeyValue;
  },

  findAll(): ApiKeyPublic[] {
    const db = getDb();
    return (
      db
        .query("SELECT * FROM api_keys ORDER BY created_at DESC")
        .all() as ApiKey[]
    ).map(toPublic);
  },

  findById(id: string): ApiKey | null {
    const db = getDb();
    return db
      .query("SELECT * FROM api_keys WHERE id = ?")
      .get(id) as ApiKey | null;
  },

  findByPrefix(prefix: string): ApiKey | null {
    const db = getDb();
    return db
      .query("SELECT * FROM api_keys WHERE prefix = ?")
      .get(prefix) as ApiKey | null;
  },

  create(name: string): { key: string; record: ApiKeyPublic } {
    const db = getDb();
    const id = crypto.randomUUID();
    const rawKey = `kl-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const prefix = rawKey.slice(0, 12) + "...";
    const hash = Bun.password.hashSync(rawKey, {
      algorithm: "bcrypt",
      cost: 10,
    });

    db.query(
      "INSERT INTO api_keys (id, name, key_hash, key_secret, prefix) VALUES (?, ?, ?, ?, ?)",
    ).run(id, name, hash, encryptSecret(rawKey), prefix);

    const record = toPublic(this.findById(id)!);
    return { key: rawKey, record };
  },

  reveal(id: string): string | null {
    const record = this.findById(id);
    return record ? decryptSecret(record.key_secret) : null;
  },

  remove(id: string): boolean {
    const db = getDb();
    const result = db.query("DELETE FROM api_keys WHERE id = ?").run(id);
    return result.changes > 0;
  },

  verify(key: string): ApiKey | null {
    if (internalKeyValue && key === internalKeyValue) {
      return {
        id: "internal",
        name: "Klove Panel",
        key_hash: "",
        key_secret: null,
        prefix: "kl-internal...",
        is_active: 1,
        created_at: new Date().toISOString(),
      };
    }
    const db = getDb();
    const keys = db
      .query("SELECT * FROM api_keys WHERE is_active = 1")
      .all() as ApiKey[];
    for (const k of keys) {
      if (Bun.password.verifySync(key, k.key_hash)) {
        return k;
      }
    }
    return null;
  },
};
