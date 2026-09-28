import { isOpenCodeProvider } from "./provider-appearance";

export type ProviderHeaderSource = {
  name?: string;
  base_url?: string;
  custom_headers?: Record<string, string> | string | null;
  protocol?: string;
};

const opencodeSessions = new Map<string, { id: string; lastUsed: number }>();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 10_000;

export function opencodeSessionId(providerId: string, sessionKey: string): string {
  const key = `${providerId}:${sessionKey}`;
  const now = Date.now();
  let session = opencodeSessions.get(key);
  if (!session || now - session.lastUsed > SESSION_TTL_MS) {
    session = { id: crypto.randomUUID(), lastUsed: now };
    opencodeSessions.set(key, session);
  } else {
    session.lastUsed = now;
  }
  if (opencodeSessions.size > MAX_SESSIONS) {
    const oldestKey = opencodeSessions.keys().next().value;
    if (oldestKey) opencodeSessions.delete(oldestKey);
  }
  return session.id;
}

/** Merge configured headers with protected protocol headers and OpenCode's session identity. */
export function upstreamProviderHeaders(
  provider: ProviderHeaderSource,
  standard: Record<string, string> = {},
  sessionId?: string,
  explicitSessionId?: string,
  forceOpenCodeSession = false,
): Record<string, string> {
  const result = new Map<string, { name: string; value: string }>();
  const merge = (headers: Record<string, string>) => {
    for (const [name, value] of Object.entries(headers))
      result.set(name.toLowerCase(), { name, value });
  };
  let configured: Record<string, string> = {};
  if (typeof provider.custom_headers === "string") {
    try {
      const parsed = JSON.parse(provider.custom_headers);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) configured = parsed;
    } catch {
      configured = {};
    }
  } else configured = provider.custom_headers ?? {};
  merge(configured);
  merge(standard);
  const openCodeEndpoint = (() => {
    try {
      const url = new URL(provider.base_url ?? "");
      return url.hostname === "opencode.ai" && /\/zen(?:\/go)?(?:\/|$)/.test(url.pathname);
    } catch {
      return false;
    }
  })();
  if (forceOpenCodeSession || (provider.name ? isOpenCodeProvider(provider.name) : false) || openCodeEndpoint)
    merge({ "x-opencode-session": explicitSessionId ?? sessionId ?? crypto.randomUUID() });
  return Object.fromEntries([...result.values()].map(({ name, value }) => [name, value]));
}
