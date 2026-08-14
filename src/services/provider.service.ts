import { getDb } from "../db/connection";
import type { CredentialKind, CredentialMode } from "./credential.service";
import { providerAvatarSources, resolveProviderAvatar, type ProviderProtocol } from "./provider-appearance";
import { decryptSecret, encryptSecret } from "./secret.service";
import { credentialKindForProtocol, validateCredential } from "./credential-validation";

export interface Provider {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  avatar: string | null;
  protocol: ProviderProtocol;
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
  avatar_sources: string[];
  avatar_override: string | null;
  protocol: ProviderProtocol;
  credential_mode: CredentialMode;
  fixed_credential_id: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export type CreateProviderInput = {
  name: string;
  base_url: string;
  api_key?: string;
  account_id?: string;
  avatar?: string;
  protocol?: ProviderProtocol;
  credential_mode?: CredentialMode;
  fixed_credential_id?: string | null;
};

export type UpdateProviderInput = {
  name?: string;
  base_url?: string;
  api_key?: string;
  avatar?: string | null;
  protocol?: ProviderProtocol;
  credential_mode?: CredentialMode;
  fixed_credential_id?: string | null;
  is_active?: number;
};

export function providerPrefix(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "");
}

function toPublic(p: Provider): ProviderPublic {
  return {
    id: p.id,
    name: p.name,
    base_url: p.base_url,
    avatar: resolveProviderAvatar(p.avatar, p.protocol, p.base_url),
    avatar_sources: providerAvatarSources(p.avatar, p.protocol, p.base_url),
    avatar_override: p.avatar,
    protocol: p.protocol ?? "openai",
    credential_mode: p.credential_mode ?? "fixed",
    fixed_credential_id: p.fixed_credential_id ?? null,
    is_active: p.is_active,
    created_at: p.created_at,
    updated_at: p.updated_at,
  };
}

function withDecryptedApiKey(provider: Provider | null): Provider | null {
  if (!provider) return null;
  return {
    ...provider,
    api_key: decryptSecret(provider.api_key) ?? "",
  };
}

export const providerService = {
  findAll(): ProviderPublic[] {
    const db = getDb();
    return (
      db
        .query("SELECT * FROM providers ORDER BY created_at DESC")
        .all() as Provider[]
    ).map(toPublic);
  },

  findById(id: string): Provider | null {
    const db = getDb();
    return withDecryptedApiKey(
      db.query("SELECT * FROM providers WHERE id = ?").get(id) as Provider | null,
    );
  },

  findPublicById(id: string): ProviderPublic | null {
    const p = this.findById(id);
    return p ? toPublic(p) : null;
  },

  findByName(name: string): Provider | null {
    const db = getDb();
    return withDecryptedApiKey(
      db
        .query(
          "SELECT * FROM providers WHERE LOWER(REPLACE(name, ' ', '')) = LOWER(?)",
        )
        .get(providerPrefix(name.trim())) as Provider | null,
    );
  },

  create(input: CreateProviderInput): ProviderPublic {
    const db = getDb();
    const protocol = input.protocol ?? "openai";
    const kind = credentialKindForProtocol(protocol);
    validateCredential(protocol, kind, protocol === "codex" || protocol === "antigravity" ? undefined : input.api_key, {
      accountId: input.account_id,
      allowIncompleteOAuth: protocol === "codex" || protocol === "antigravity",
    });
    const id = crypto.randomUUID();
    const encryptedApiKey = input.api_key
      ? encryptSecret(input.api_key)
      : null;
    db.query(
      "INSERT INTO providers (id, name, base_url, api_key, avatar, protocol) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      input.name,
      input.base_url.replace(/\/+$/, ""),
      encryptedApiKey ?? "",
      input.avatar ?? null,
      protocol,
    );
    const credentialId = crypto.randomUUID();
    db.query(
      "INSERT INTO provider_credentials (id, provider_id, label, kind, secret, account_id) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      credentialId,
      id,
      protocol === "codex"
        ? "Codex session"
        : protocol === "chatgpt"
          ? "ChatGPT session"
          : protocol === "antigravity"
          ? "Google account"
          : protocol === "freebuff"
            ? "Freebuff token"
             : protocol === "qwen"
               ? "Qwen token"
               : protocol === "atomesus"
                 ? "Atomesus token"
               : protocol === "conol"
                 ? "Conol cookie"
               : "Default API key",
      protocol === "codex"
        ? "codex"
        : protocol === "chatgpt"
          ? "chatgpt"
          : protocol === "antigravity"
          ? "antigravity"
          : protocol === "freebuff"
            ? "freebuff"
             : protocol === "qwen"
               ? "qwen"
               : protocol === "atomesus"
                 ? "atomesus"
               : protocol === "conol"
                 ? "conol"
               : "api_key",
      protocol === "antigravity" ? null : encryptedApiKey,
      input.account_id ?? null,
    );
    db.query("UPDATE providers SET fixed_credential_id = ? WHERE id = ?").run(
      credentialId,
      id,
    );
    return this.findPublicById(id)!;
  },

  update(id: string, input: UpdateProviderInput): ProviderPublic | null {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: any[] = [];
    const protocol = input.protocol ?? existing.protocol;
    if (input.api_key !== undefined && (protocol === "codex" || protocol === "antigravity")) {
      throw new Error(`Provider protocol '${protocol}' does not accept api_key credentials`);
    }
    if (input.protocol !== undefined || input.api_key !== undefined) {
      const automatic = db.query("SELECT kind, secret FROM provider_credentials WHERE provider_id = ? AND id = COALESCE(?, id) LIMIT 1").get(id, existing.fixed_credential_id) as { kind: CredentialKind; secret: string | null } | null;
      if (automatic && input.protocol !== undefined) {
        validateCredential(protocol, automatic.kind, input.api_key !== undefined ? input.api_key : decryptSecret(automatic.secret));
      } else {
        validateCredential(protocol, credentialKindForProtocol(protocol), input.api_key !== undefined ? input.api_key : existing.api_key);
      }
    }

    if (input.name !== undefined) {
      updates.push("name = ?");
      values.push(input.name);
    }
    if (input.base_url !== undefined) {
      updates.push("base_url = ?");
      values.push(input.base_url.replace(/\/+$/, ""));
    }
    if (input.api_key !== undefined) {
      const encryptedApiKey = encryptSecret(input.api_key)!;
      updates.push("api_key = ?");
      values.push(encryptedApiKey);
      db.query(
        "UPDATE provider_credentials SET secret = ?, updated_at = datetime('now') WHERE provider_id = ? AND id = COALESCE((SELECT fixed_credential_id FROM providers WHERE id = ?), id) AND kind IN ('api_key', 'codex', 'chatgpt', 'freebuff', 'qwen', 'atomesus')",
      ).run(encryptedApiKey, id, id);
    }
    if (input.avatar !== undefined) {
      updates.push("avatar = ?");
      values.push(input.avatar);
    }
    if (input.protocol !== undefined) {
      updates.push("protocol = ?");
      values.push(input.protocol);
    }
    if (input.credential_mode !== undefined) {
      updates.push("credential_mode = ?");
      values.push(input.credential_mode);
    }
    if (input.fixed_credential_id !== undefined) {
      if (input.fixed_credential_id !== null) {
        const fixed = db
          .query("SELECT kind FROM provider_credentials WHERE id = ? AND provider_id = ?")
          .get(input.fixed_credential_id, id) as { kind: CredentialKind } | null;
        if (!fixed) {
          throw new Error("fixed_credential_id must reference a credential belonging to this provider");
        }
        validateCredential(protocol, fixed.kind, undefined, { allowIncompleteOAuth: true });
      }
      updates.push("fixed_credential_id = ?");
      values.push(input.fixed_credential_id);
    }
    if (input.is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(input.is_active);
    }

    if (updates.length === 0) return this.findPublicById(id);

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.query(`UPDATE providers SET ${updates.join(", ")} WHERE id = ?`).run(
      ...values,
    );

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
