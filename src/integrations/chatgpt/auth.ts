import {
  browserLikeHeaders,
  randomSessionId,
  stableDeviceId,
} from "./browser-headers";

export type ChatGptCredential = {
  token?: string;
  cookieHeader?: string;
  accountId?: string;
};

function tokenFrom(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const token = value.trim();
  if (!token || token.startsWith("{") || token.startsWith("[")) return undefined;
  if (/^(?:cookie:|# Netscape HTTP Cookie File|__Secure-next-auth\.session-token(?:\.|=))/i.test(token)) return undefined;
  if (/[\r\n]/.test(token) || /(?:^|\s)Cookie\s*:/i.test(token)) return undefined;
  return /^Bearer\s+/i.test(token) ? token.replace(/^Bearer\s+/i, "").trim() || undefined : token;
}

export function normalizeChatGptAuth(value: unknown): ChatGptCredential {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") return normalizeChatGptAuth(parsed);
    } catch {
      // Legacy values are plain session tokens.
    }
    const token = tokenFrom(value);
    return token ? { token } : {};
  }
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  let nested: ChatGptCredential = {};
  if (typeof record.secret === "string" && record.secret.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(record.secret);
      if (parsed && typeof parsed === "object") nested = normalizeChatGptAuth(parsed);
    } catch {
      // Treat malformed stored values as unauthenticated.
    }
  }
  const cookieHeader = typeof record.cookieHeader === "string" && record.cookieHeader.trim()
    ? record.cookieHeader.trim()
    : typeof record.cookie_header === "string" && record.cookie_header.trim()
      ? record.cookie_header.trim()
      : nested.cookieHeader;
  const token = tokenFrom(record.secret) ?? nested.token;
  const accountId = typeof record.accountId === "string" && record.accountId.trim()
    ? record.accountId.trim()
    : typeof record.account_id === "string" && record.account_id.trim()
      ? record.account_id.trim()
      : undefined;
  return {
    ...(token ? { token } : {}),
    ...(cookieHeader ? { cookieHeader } : {}),
    ...(accountId ? { accountId } : {}),
  };
}

export function chatgptSessionToken(value: unknown): string | undefined {
  return normalizeChatGptAuth(value).token;
}

export function chatgptAuthHeaders(value: unknown, accept = "application/json") {
  const auth = normalizeChatGptAuth(value);
  const headers: Record<string, string> = { Accept: accept };
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  if (auth.cookieHeader) headers.Cookie = auth.cookieHeader;
  if (auth.accountId) headers["ChatGPT-Account-Id"] = auth.accountId;
  return headers;
}

/**
 * Like `chatgptAuthHeaders` but includes browser-like headers (User-Agent,
 * Sec-Fetch-*, oai-*, etc.) and a stable device ID derived from the
 * credential seed.  The session ID is regenerated per call unless
 * `opts.sessionId` is provided.
 */
export async function chatgptRequestHeaders(
  value: unknown,
  opts: { accept?: string; sessionId?: string } = {},
): Promise<Record<string, string>> {
  const auth = normalizeChatGptAuth(value);
  const seed = auth.cookieHeader ?? auth.token ?? "";
  const deviceId = await stableDeviceId(seed);
  const sessionId = opts.sessionId ?? randomSessionId();
  const headers = browserLikeHeaders({
    deviceId,
    sessionId,
    accept: opts.accept,
  });
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  if (auth.cookieHeader) headers.Cookie = auth.cookieHeader;
  if (auth.accountId) headers["ChatGPT-Account-Id"] = auth.accountId;
  return headers;
}
