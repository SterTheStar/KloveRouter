import { randomBytes, timingSafeEqual } from "node:crypto";
import { credentialService } from "../../services/credential.service";
import { providerService } from "../../services/provider.service";

const ORIGIN = "https://api.deepai.org";
const pending = new Map<string, { credentialId: string; server: ReturnType<typeof Bun.serve>; expiresAt: number; busy: boolean }>();

function sameSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function exchange(code: string) {
  const response = await fetch(`${ORIGIN}/deepai_code/desktop_auth/exchange/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(response.status === 429 ? "Too many sign-in attempts. Wait and try again." : "DeepAI sign-in code expired or was already used. Start again.");
  const data = await response.json().catch(() => null);
  if (!data || typeof data.api_key !== "string" || !data.api_key || /[\r\n]/.test(data.api_key)) throw new Error("DeepAI returned an invalid sign-in response.");
  return { apiKey: data.api_key, username: typeof data.username === "string" ? data.username : "", isPro: data.is_pro === true };
}

function html(message: string) {
  const safeMessage = message.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DeepAI Code</title><body style="font:16px system-ui;max-width:36rem;margin:15vh auto;padding:1rem"><h1>${safeMessage}</h1><p>You can close this tab and return to SaturnRouter.</p></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export const deepaiAuthService = {
  startLogin(credentialId: string) {
    const credential = credentialService.findById(credentialId);
    if (!credential || credential.kind !== "api_key" || providerService.findById(credential.provider_id)?.protocol !== "deepai") throw new Error("DeepAI credential not found");
    for (const [state, login] of pending) {
      if (login.credentialId === credentialId || login.expiresAt < Date.now()) {
        login.server.stop(true);
        pending.delete(state);
      }
    }
    const state = randomBytes(32).toString("hex");
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname !== "/auth-callback" || request.method !== "GET") return new Response("Not Found", { status: 404 });
        const code = url.searchParams.get("code") ?? "";
        const receivedState = url.searchParams.get("state") ?? "";
        const login = pending.get(state);
        if (!login || login.expiresAt < Date.now() || !sameSecret(receivedState, state) || !code || code.length > 4096) return html("Sign-in failed");
        if (login.busy) return new Response("Sign-in is already being completed", { status: 409 });
        login.busy = true;
        try {
          await deepaiAuthService.completeLogin(credentialId, code, receivedState);
          pending.delete(state);
          setTimeout(() => server.stop(true), 500);
          return html("Signed in to DeepAI Code");
        } catch (error) {
          pending.delete(state);
          setTimeout(() => server.stop(true), 500);
          return html(error instanceof Error ? error.message : "Sign-in failed");
        }
      },
    });
    pending.set(state, { credentialId, server, expiresAt: Date.now() + 10 * 60_000, busy: false });
    const url = new URL("/deepai_code/desktop_auth/", ORIGIN);
    url.search = new URLSearchParams({ state, port: String(server.port) }).toString();
    setTimeout(() => {
      const login = pending.get(state);
      if (login) { login.server.stop(true); pending.delete(state); }
    }, 10 * 60_000).unref?.();
    return { auth_url: url.href, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() };
  },

  async completeLogin(credentialId: string, code: string, state: string) {
    const login = pending.get(state);
    if (!login || login.credentialId !== credentialId || login.expiresAt < Date.now()) throw new Error("Invalid or expired DeepAI sign-in state");
    if (!code || code.length > 4096) throw new Error("Invalid DeepAI sign-in code");
    const credential = credentialService.findById(credentialId);
    if (!credential || credential.kind !== "api_key" || providerService.findById(credential.provider_id)?.protocol !== "deepai") throw new Error("DeepAI credential not found");
    const result = await exchange(code);
    credentialService.update(credentialId, { label: result.username || "DeepAI Code account", secret: result.apiKey });
    pending.delete(state);
    setTimeout(() => login.server.stop(true), 500);
    return { authenticated: true, username: result.username, is_pro: result.isPro };
  },
};
