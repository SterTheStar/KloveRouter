import { getDb } from "../db/connection";
import { decryptSecret, encryptSecret } from "./secret.service";
import { logger } from "../logger";

export type CredentialKind = "api_key" | "codex" | "antigravity" | "freebuff" | "qwen";
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
  email?: string | null;
  project_id?: string | null;
  managed_project_id?: string | null;
  expires_at?: number | null;
  fingerprint_json?: string | null;
  quota_json?: string | null;
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
  email?: string | null;
  project_id?: string | null;
  expires_at?: number | null;
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
    email: credential.email ?? null,
    project_id: credential.project_id ?? null,
    expires_at: credential.expires_at ?? null,
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
    return (
      db
        .query(
          "SELECT id FROM provider_credentials WHERE provider_id = ? ORDER BY created_at ASC",
        )
        .all(providerId) as { id: string }[]
    ).map(({ id }) => toPublic(this.findById(id)!));
  },

  findById(id: string): ProviderCredential | null {
    const credential = getDb()
      .query("SELECT * FROM provider_credentials WHERE id = ?")
      .get(id) as ProviderCredential | null;
    if (!credential) return null;
    return {
      ...credential,
      secret: decryptSecret(credential.secret),
      access_token: decryptSecret(credential.access_token),
      refresh_token: decryptSecret(credential.refresh_token),
      id_token: decryptSecret(credential.id_token),
      fingerprint_json: decryptSecret(credential.fingerprint_json),
    };
  },

  status(id: string) {
    const credential = this.findById(id);
    if (!credential) return null;
    return {
      authenticated: Boolean(credential.access_token),
      account_id: credential.account_id,
      email: credential.email ?? null,
      project_id: credential.project_id ?? null,
    };
  },

  disconnect(id: string) {
    return this.update(id, {
      access_token: null,
      refresh_token: null,
      id_token: null,
      account_id: null,
      email: null,
      project_id: null,
      managed_project_id: null,
      expires_at: null,
      fingerprint_json: null,
      quota_json: null,
    });
  },

  hasAuthenticatedCodexAccount() {
    const row = getDb()
      .query(
        "SELECT id FROM provider_credentials WHERE kind = 'codex' AND is_active = 1 AND access_token IS NOT NULL LIMIT 1",
      )
      .get();
    return Boolean(row);
  },

  create(input: {
    provider_id: string;
    label: string;
    kind: CredentialKind;
    secret?: string;
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    account_id?: string;
    email?: string;
    project_id?: string;
    managed_project_id?: string;
    expires_at?: number;
    fingerprint_json?: string;
    quota_json?: string;
  }): ProviderCredentialPublic {
    const id = crypto.randomUUID();
    getDb()
      .query(
        "INSERT INTO provider_credentials (id, provider_id, label, kind, secret, access_token, refresh_token, id_token, account_id, email, project_id, managed_project_id, expires_at, fingerprint_json, quota_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        input.provider_id,
        input.label,
        input.kind,
        encryptSecret(input.secret),
        encryptSecret(input.access_token),
        encryptSecret(input.refresh_token),
        encryptSecret(input.id_token),
        input.account_id ?? null,
        input.email ?? null,
        input.project_id ?? null,
        input.managed_project_id ?? null,
        input.expires_at ?? null,
        encryptSecret(input.fingerprint_json),
        input.quota_json ?? null,
      );
    return toPublic(this.findById(id)!);
  },

  update(
    id: string,
    input: {
      label?: string;
      secret?: string | null;
      is_active?: number;
      access_token?: string | null;
      refresh_token?: string | null;
      id_token?: string | null;
      account_id?: string | null;
      email?: string | null;
      project_id?: string | null;
      managed_project_id?: string | null;
      expires_at?: number | null;
      fingerprint_json?: string | null;
      quota_json?: string | null;
    },
  ) {
    const updates: string[] = [];
    const values: any[] = [];
    for (const field of [
      "label",
      "secret",
      "is_active",
      "access_token",
      "refresh_token",
      "id_token",
      "account_id",
      "email",
      "project_id",
      "managed_project_id",
      "expires_at",
      "fingerprint_json",
      "quota_json",
    ] as const) {
      if (input[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(input[field]);
      }
    }
    if (!updates.length)
      return this.findById(id) ? toPublic(this.findById(id)!) : null;
    updates.push("updated_at = datetime('now')");
    values.push(id);
    getDb()
      .query(
        `UPDATE provider_credentials SET ${updates.join(", ")} WHERE id = ?`,
      )
      .run(
        ...values.map((value, index) =>
          index < values.length - 1 &&
          ["secret", "access_token", "refresh_token", "id_token"].includes(
            updates[index]?.split(" ")[0],
          )
            ? encryptSecret(value as string | null)
            : updates[index]?.startsWith("fingerprint_json ")
              ? encryptSecret(value as string | null)
              : value,
        ),
      );
    const result = this.findById(id);
    return result ? toPublic(result) : null;
  },

  remove(id: string) {
    return (
      getDb().query("DELETE FROM provider_credentials WHERE id = ?").run(id)
        .changes > 0
    );
  },

  beginRequest(providerId: string) {
    const db = getDb();
    db.query(
      "INSERT INTO provider_credential_rotation (provider_id, request_sequence, updated_at) VALUES (?, 1, datetime('now')) ON CONFLICT(provider_id) DO UPDATE SET request_sequence = request_sequence + 1, updated_at = datetime('now')",
    ).run(providerId);
    return (
      db
        .query(
          "SELECT request_sequence FROM provider_credential_rotation WHERE provider_id = ?",
        )
        .get(providerId) as { request_sequence: number }
    ).request_sequence;
  },

  select(
    providerId: string,
    mode: CredentialMode,
    fixedId?: string | null,
    requestSequence?: number,
  ): ProviderCredential | null {
    const db = getDb();
    const provider = db
      .query("SELECT protocol FROM providers WHERE id = ?")
      .get(providerId) as { protocol: string } | null;
    const eligible =
      provider?.protocol === "codex"
        ? "kind = 'codex' AND access_token IS NOT NULL"
          : provider?.protocol === "antigravity"
            ? "kind = 'antigravity' AND refresh_token IS NOT NULL"
            : provider?.protocol === "freebuff"
              ? "kind = 'freebuff' AND secret IS NOT NULL"
              : provider?.protocol === "qwen"
                ? "kind = 'qwen' AND secret IS NOT NULL"
              : "kind = 'api_key' AND secret IS NOT NULL";
    if (mode === "fixed" && fixedId) {
      const raw = db
        .query(
          `SELECT id FROM provider_credentials WHERE id = ? AND provider_id = ? AND is_active = 1 AND ${eligible}`,
        )
        .get(fixedId, providerId) as { id: string } | null;
      const row = raw ? this.findById(raw.id) : null;
      if (row)
        db.query(
          "UPDATE provider_credentials SET last_used_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
        ).run(row.id);
      return row;
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      const sequence =
        requestSequence ??
        (
          db
            .query(
              "SELECT request_sequence FROM provider_credential_rotation WHERE provider_id = ?",
            )
            .get(providerId) as { request_sequence?: number } | null
        )?.request_sequence ??
        0;
      const candidates = db
        .query(
          `SELECT c.id FROM provider_credentials c LEFT JOIN provider_credential_cooldown cooldown ON cooldown.credential_id = c.id AND cooldown.cooldown_until_sequence >= ? WHERE c.provider_id = ? AND c.is_active = 1 AND ${eligible.replaceAll("kind", "c.kind").replaceAll("access_token", "c.access_token").replaceAll("refresh_token", "c.refresh_token").replaceAll("secret", "c.secret")} AND cooldown.credential_id IS NULL ORDER BY c.created_at ASC, c.id ASC`,
        )
        .all(sequence, providerId) as { id: string }[];
      if (!candidates.length) {
        const fallback = db
          .query(
            `SELECT id FROM provider_credentials WHERE provider_id = ? AND is_active = 1 AND ${eligible} ORDER BY created_at ASC, id ASC LIMIT 1`,
          )
          .get(providerId) as { id: string } | null;
        if (!fallback) {
          db.query(
            "DELETE FROM provider_credential_rotation WHERE provider_id = ?",
          ).run(providerId);
          db.exec("COMMIT");
          return null;
        }
        db.query(
          "DELETE FROM provider_credential_cooldown WHERE credential_id = ?",
        ).run(fallback.id);
        candidates.push(fallback);
      }
      const state = db
        .query(
          "SELECT last_credential_id FROM provider_credential_rotation WHERE provider_id = ?",
        )
        .get(providerId) as { last_credential_id: string | null } | null;
      const previousIndex = state?.last_credential_id
        ? candidates.findIndex(
            (candidate) => candidate.id === state.last_credential_id,
          )
        : -1;
      const selected = candidates[(previousIndex + 1) % candidates.length];
      db.query(
        "INSERT INTO provider_credential_rotation (provider_id, last_credential_id, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(provider_id) DO UPDATE SET last_credential_id = excluded.last_credential_id, updated_at = datetime('now')",
      ).run(providerId, selected.id);
      db.query(
        "UPDATE provider_credentials SET last_used_at = strftime('%Y-%m-%d %H:%M:%f', 'now'), updated_at = datetime('now') WHERE id = ?",
      ).run(selected.id);
      db.query(
        "DELETE FROM provider_credential_cooldown WHERE provider_id = ? AND cooldown_until_sequence < ?",
      ).run(providerId, sequence);
      db.exec("COMMIT");
      return this.findById(selected.id);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  },

  markCooldown(
    id: string,
    requests = 10,
    reason?: string,
    requestSequence?: number,
  ) {
    const credential = this.findById(id);
    if (!credential) return;
    const db = getDb();
    const sequence =
      requestSequence ??
      (
        db
          .query(
            "SELECT request_sequence FROM provider_credential_rotation WHERE provider_id = ?",
          )
          .get(credential.provider_id) as { request_sequence?: number } | null
      )?.request_sequence ??
      0;
    getDb()
      .query(
        "INSERT INTO provider_credential_cooldown (credential_id, provider_id, remaining_requests, cooldown_until_sequence, reason, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(credential_id) DO UPDATE SET remaining_requests = excluded.remaining_requests, cooldown_until_sequence = excluded.cooldown_until_sequence, reason = excluded.reason, updated_at = datetime('now')",
      )
      .run(
        id,
        credential.provider_id,
        requests,
        sequence + requests,
        reason?.slice(0, 500) ?? null,
      );
    logger.warn("Credential placed on request cooldown", {
      credential_id: id,
      provider_id: credential.provider_id,
      remaining_requests: requests,
      reason,
    });
  },

  clearCooldown(id: string) {
    getDb()
      .query("DELETE FROM provider_credential_cooldown WHERE credential_id = ?")
      .run(id);
  },

  markError(id: string, message: string) {
    getDb()
      .query(
        "UPDATE provider_credentials SET last_error = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .run(message.slice(0, 500), id);
    logger.warn("Provider credential failed", {
      credential_id: id,
      error: message,
    });
  },

  clearError(id: string) {
    getDb()
      .query(
        "UPDATE provider_credentials SET last_error = NULL, updated_at = datetime('now') WHERE id = ?",
      )
      .run(id);
  },
};
