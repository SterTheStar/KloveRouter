import type { CredentialKind } from "./credential.service";
import type { ProviderProtocol } from "./provider-appearance";

const protocolKinds: Record<ProviderProtocol, CredentialKind> = {
  openai: "api_key",
  anthropic: "api_key",
  codex: "codex",
  chatgpt: "chatgpt",
  antigravity: "antigravity",
  freebuff: "freebuff",
  qwen: "qwen",
  atomesus: "atomesus",
  conol: "conol",
};

const secretKinds = new Set<CredentialKind>([
  "api_key",
  "chatgpt",
  "freebuff",
  "qwen",
  "atomesus",
  "conol",
]);

export class CredentialValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialValidationError";
  }
}

export function credentialKindForProtocol(protocol: ProviderProtocol): CredentialKind {
  return protocolKinds[protocol];
}

export function validateCredential(
  protocol: ProviderProtocol,
  kind: CredentialKind,
  secret?: string | null,
  fields: { accessToken?: string | null; refreshToken?: string | null; accountId?: string | null; allowIncompleteOAuth?: boolean } = {},
): { valid: true; protocol: ProviderProtocol; kind: CredentialKind } {
  const expected = protocolKinds[protocol];
  if (expected !== kind) {
    throw new CredentialValidationError(
      `Credential kind '${kind}' is incompatible with provider protocol '${protocol}'; expected '${expected}'`,
    );
  }
  if (secretKinds.has(kind) && !secret?.trim()) {
    throw new CredentialValidationError(`Credential kind '${kind}' requires a non-empty secret`);
  }
  if (!fields.allowIncompleteOAuth && kind === "codex" && !fields.accessToken?.trim()) {
    throw new CredentialValidationError("Credential kind 'codex' requires a non-empty access_token");
  }
  if (!fields.allowIncompleteOAuth && kind === "antigravity" && (!fields.accessToken?.trim() || !fields.refreshToken?.trim())) {
    throw new CredentialValidationError("Credential kind 'antigravity' requires non-empty access_token and refresh_token");
  }
  if (!fields.allowIncompleteOAuth && kind === "conol" && !fields.accountId?.trim()) {
    throw new CredentialValidationError("Credential kind 'conol' requires a non-empty account_id");
  }
  return { valid: true, protocol, kind };
}
