import { getDb } from "../db/connection";
import { decryptSecret, encryptSecret } from "./secret.service";
import { logger } from "../logger";

export type CredentialKind = "api_key" | "codex";
export type CredentialMode = "fixed" | "round_robin";

export interface ProviderCredential {
  id: string;
  provider_id: string;
  label: string;
  kind: CredentialKind;
  secret: string | null;
  access_token: string | null;
  refresh_token: string | null;
  id_token: string | null;
  account_id: string | null;
  is_active: number;
  last_used_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderCredentialPublic {
  id: string;
  provider_id: string;
  label: string;
  kind: CredentialKind;
  account_id: string | null;
  masked_secret: string | null;
  is_active: number;
  last_used_at: string | null;
  last_error: string | null;
  created_at: string;
}

function mask(value: string | null) {
  if (!value) return null;
  if (value.length <= 10) return `${value.slice(0, 3)}...`;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function toPublic(credential: ProviderCredential): ProviderCredentialPublic {
  return {
    id: credential.id,
    provider_id: credential.provider_id,
    label: credential.label,
    kind: credential.kind,
    account_id: credential.account_id,
    masked_secret: mask(credential.secret ?? credential.account_id),
    is_active: credential.is_active,
    last_used_at: credential.last_used_at,
    last_error: credential.last_error,
    created_at: credential.created_at,
  };
}

export const credentialService = {
  findAll(providerId: string): ProviderCredentialPublic[] {
    const db = getDb();
    return (db.query("SELECT id FROM provider_credentials WHERE provider_id = ? ORDER BY created_at ASC").all(providerId) as { id: string }[]).map(({ id }) => toPublic(this.findById(id)!));
  },

  findById(id: string): ProviderCredential | null {
    const credential = getDb().query("SELECT * FROM provider_credentials WHERE id = ?").get(id) as ProviderCredential | null;
    if (!credential) return null;
    return { ...credential, secret: decryptSecret(credential.secret), access_token: decryptSecret(credential.access_token), refresh_token: decryptSecret(credential.refresh_token), id_token: decryptSecret(credential.id_token) };
  },

  status(id: string) {
    const credential = this.findById(id);
    if (!credential) return null;
    return { authenticated: Boolean(credential.access_token), account_id: credential.account_id };
  },

  disconnect(id: string) {
    return this.update(id, { access_token: null, refresh_token: null, id_token: null, account_id: null });
  },

  hasAuthenticatedCodexAccount() {
    const row = getDb().query("SELECT id FROM provider_credentials WHERE kind = 'codex' AND is_active = 1 AND access_token IS NOT NULL LIMIT 1").get();
    return Boolean(row);
  },

  create(input: { provider_id: string; label: string; kind: CredentialKind; secret?: string; access_token?: string; refresh_token?: string; id_token?: string; account_id?: string }): ProviderCredentialPublic {
    const id = crypto.randomUUID();
    getDb().query("INSERT INTO provider_credentials (id, provider_id, label, kind, secret, access_token, refresh_token, id_token, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, input.provider_id, input.label, input.kind, encryptSecret(input.secret), encryptSecret(input.access_token), encryptSecret(input.refresh_token), encryptSecret(input.id_token), input.account_id ?? null);
    return toPublic(this.findById(id)!);
  },

  update(id: string, input: { label?: string; secret?: string | null; is_active?: number; access_token?: string | null; refresh_token?: string | null; id_token?: string | null; account_id?: string | null }) {
    const updates: string[] = [];
    const values: any[] = [];
    for (const field of ["label", "secret", "is_active", "access_token", "refresh_token", "id_token", "account_id"] as const) {
      if (input[field] !== undefined) { updates.push(`${field} = ?`); values.push(input[field]); }
    }
    if (!updates.length) return this.findById(id) ? toPublic(this.findById(id)!) : null;
    updates.push("updated_at = datetime('now')"); values.push(id);
    getDb().query(`UPDATE provider_credentials SET ${updates.join(", ")} WHERE id = ?`).run(...values.map((value, index) => index < values.length - 1 && ["secret", "access_token", "refresh_token", "id_token"].includes(updates[index]?.split(" ")[0]) ? encryptSecret(value as string | null) : value));
    const result = this.findById(id);
    return result ? toPublic(result) : null;
  },

  remove(id: string) {
    return getDb().query("DELETE FROM provider_credentials WHERE id = ?").run(id).changes > 0;
  },

  select(providerId: string, mode: CredentialMode, fixedId?: string | null): ProviderCredential | null {
    const db = getDb();
    const provider = db.query("SELECT protocol FROM providers WHERE id = ?").get(providerId) as { protocol: string } | null;
    const eligible = provider?.protocol === "codex" ? "kind = 'codex' AND access_token IS NOT NULL" : "kind = 'api_key' AND secret IS NOT NULL";
    if (mode === "fixed" && fixedId) {
      const raw = db.query(`SELECT id FROM provider_credentials WHERE id = ? AND provider_id = ? AND is_active = 1 AND ${eligible}`).get(fixedId, providerId) as { id: string } | null;
      const row = raw ? this.findById(raw.id) : null;
      if (row) db.query("UPDATE provider_credentials SET last_used_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(row.id);
      return row;
    }
    const raw = db.query(`SELECT id FROM provider_credentials WHERE provider_id = ? AND is_active = 1 AND ${eligible} ORDER BY COALESCE(last_used_at, '1970-01-01') ASC, created_at ASC LIMIT 1`).get(providerId) as { id: string } | null;
    const row = raw ? this.findById(raw.id) : null;
    if (row) db.query("UPDATE provider_credentials SET last_used_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(row.id);
    return row;
  },

  markError(id: string, message: string) {
    getDb().query("UPDATE provider_credentials SET last_error = ?, updated_at = datetime('now') WHERE id = ?").run(message.slice(0, 500), id);
    logger.warn("Provider credential failed", { credential_id: id, error: message });
  },

  clearError(id: string) {
    getDb().query("UPDATE provider_credentials SET last_error = NULL, updated_at = datetime('now') WHERE id = ?").run(id);
  },
};
