export type ChatGptCredential = {
  token?: string;
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
    const token = tokenFrom(value);
    return token ? { token } : {};
  }
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const token = tokenFrom(record.secret);
  const accountId = typeof record.accountId === "string" && record.accountId.trim()
    ? record.accountId.trim()
    : typeof record.account_id === "string" && record.account_id.trim()
      ? record.account_id.trim()
      : undefined;
  return {
    ...(token ? { token } : {}),
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
  if (auth.accountId) headers["ChatGPT-Account-Id"] = auth.accountId;
  return headers;
}
