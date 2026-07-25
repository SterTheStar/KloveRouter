import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const ISSUER = "https://auth.openai.com";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CALLBACK = "http://localhost:1455/auth/callback";

type TokenFile = {
  OPENAI_API_KEY?: string | null;
  tokens?: { id_token?: string; access_token?: string; refresh_token?: string; account_id?: string };
  last_refresh?: string;
};

type PendingLogin = { state: string; verifier: string; createdAt: number };

const pending = new Map<string, PendingLogin>();

function codexHome() {
  return process.env.CODEX_HOME || join(process.env.HOME || ".", ".codex");
}

function authPath() {
  return join(codexHome(), "auth.json");
}

function base64Url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

export const codexAuthService = {
  async read(): Promise<TokenFile | null> {
    try { return JSON.parse(await readFile(authPath(), "utf8")) as TokenFile; } catch { return null; }
  },

  async status() {
    const auth = await this.read();
    const tokens = auth?.tokens;
    return {
      authenticated: Boolean(tokens?.access_token),
      account_id: tokens?.account_id ?? null,
      auth_path: authPath(),
      last_refresh: auth?.last_refresh ?? null,
      warning: "Unofficial OAuth integration. It relies on private Codex/ChatGPT endpoints and may stop working without notice.",
    };
  },

  async logout() {
    try {
      await unlink(authPath());
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
    }
    return this.status();
  },

  async startLogin() {
    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const challenge = base64Url(new Uint8Array(digest));
    const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    pending.set(state, { state, verifier, createdAt: Date.now() });
    const params = new URLSearchParams({ response_type: "code", client_id: CLIENT_ID, redirect_uri: CALLBACK, scope: "openid profile email offline_access", code_challenge: challenge, code_challenge_method: "S256", id_token_add_organizations: "true", codex_cli_simplified_flow: "true", state });
    return { auth_url: `${ISSUER}/oauth/authorize?${params}`, warning: "Unofficial OAuth integration. Do not share your Codex credentials or auth.json." };
  },

  async completeLogin(code: string, state: string) {
    const login = pending.get(state);
    pending.delete(state);
    if (!login || Date.now() - login.createdAt > 10 * 60_000) throw new Error("Invalid or expired OAuth state");
    const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: CALLBACK, client_id: CLIENT_ID, code_verifier: login.verifier });
    const response = await fetch(`${ISSUER}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error_description || data?.error || `OAuth token exchange failed (${response.status})`);
    const payload: TokenFile = { OPENAI_API_KEY: data.access_token ?? null, tokens: { id_token: data.id_token, access_token: data.access_token, refresh_token: data.refresh_token, account_id: readAccountId(data.id_token) }, last_refresh: new Date().toISOString() };
    await mkdir(dirname(authPath()), { recursive: true });
    await writeFile(authPath(), JSON.stringify(payload, null, 2), { mode: 0o600 });
    return this.status();
  },

  async refresh() {
    const auth = await this.read();
    const refreshToken = auth?.tokens?.refresh_token;
    if (!refreshToken) throw new Error("No Codex refresh token found");
    const body = new URLSearchParams({ client_id: CLIENT_ID, grant_type: "refresh_token", refresh_token: refreshToken, scope: "openid profile email" });
    const response = await fetch(`${ISSUER}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error_description || data?.error || `Token refresh failed (${response.status})`);
    const next = { ...auth, OPENAI_API_KEY: data.access_token ?? auth.OPENAI_API_KEY, tokens: { ...auth.tokens, id_token: data.id_token ?? auth.tokens?.id_token, access_token: data.access_token ?? auth.tokens?.access_token, refresh_token: data.refresh_token ?? refreshToken, account_id: readAccountId(data.id_token) ?? auth.tokens?.account_id }, last_refresh: new Date().toISOString() };
    await writeFile(authPath(), JSON.stringify(next, null, 2), { mode: 0o600 });
    return this.status();
  },

  async accessToken() {
    const auth = await this.read();
    if (!auth?.tokens?.access_token) throw new Error("Codex is not authenticated");
    return auth.tokens.access_token;
  },

  accountId: async () => (await codexAuthService.read())?.tokens?.account_id ?? null,
};

function readAccountId(idToken?: string) {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
    return payload["https://api.openai.com/auth"]?.chatgpt_account_id ?? null;
  } catch { return null; }
}

export const CODEX_CALLBACK_HTML = "<!doctype html><html><body><h1>Codex connected</h1><p>You can close this window and return to Klove.</p></body></html>";
