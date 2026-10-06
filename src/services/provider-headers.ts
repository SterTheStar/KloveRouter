import { createHash } from "node:crypto";
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

/** Client identity the Zen free-tier gate expects as the User-Agent leading token. */
export const OPENCODE_USER_AGENT = "opencode/1.18.31";

const HEX = "0123456789abcdef";
const ALNUM = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randomFrom(alphabet: string, length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

/**
 * Shape the Zen free-tier gate accepts (`ses_<12 lowercase hex><14 alnum>`).
 * Anything else (e.g. UUIDs) is rejected with FreeTierError.
 */
export const OPENCODE_SESSION_RE = /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/;

/**
 * Mint a Zen-accepted session id. The gateway only shape-checks this value;
 * nothing is registered server-side.
 */
export function mintOpencodeSessionId(): string {
  return `ses_${randomFrom(HEX, 12)}${randomFrom(ALNUM, 14)}`;
}

/**
 * Coerce any session value into the gate-accepted shape, deterministically:
 * already-valid ids pass through, anything else is hashed so the same input
 * keeps mapping to the same session (stable routing/caching) instead of
 * fragmenting with a fresh random id per call.
 */
export function coerceOpencodeSessionId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (OPENCODE_SESSION_RE.test(value)) return value;
  const digest = createHash("sha256").update(value).digest();
  const hex = digest.toString("hex").slice(0, 12);
  const alnum = Buffer.from(digest.subarray(12))
    .toString("base64url")
    .replace(/[^0-9A-Za-z]/g, "")
    .padEnd(14, "0")
    .slice(0, 14);
  return `ses_${hex}${alnum}`;
}

export function opencodeSessionId(providerId: string, sessionKey: string): string {
  const key = `${providerId}:${sessionKey}`;
  const now = Date.now();
  let session = opencodeSessions.get(key);
  if (!session || now - session.lastUsed > SESSION_TTL_MS) {
    session = { id: mintOpencodeSessionId(), lastUsed: now };
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
  if (forceOpenCodeSession || (provider.name ? isOpenCodeProvider(provider.name) : false) || openCodeEndpoint) {
    const resolved =
      coerceOpencodeSessionId(explicitSessionId) ??
      coerceOpencodeSessionId(sessionId) ??
      mintOpencodeSessionId();
    merge({ "x-opencode-session": resolved, "X-Session-ID": resolved });
    // The free-tier gate reads only the leading UA token; keep an explicit
    // custom User-Agent untouched so user config always wins.
    if (!result.has("user-agent")) merge({ "User-Agent": OPENCODE_USER_AGENT });
  }
  return Object.fromEntries([...result.values()].map(({ name, value }) => [name, value]));
}
