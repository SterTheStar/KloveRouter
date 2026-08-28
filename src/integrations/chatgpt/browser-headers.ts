/**
 * Browser-like request headers for the ChatGPT Web integration.
 *
 * These mirror the headers a real browser (Firefox 152) and the ChatGPT web
 * client send to chatgpt.com, including OpenAI-specific fields. The device ID
 * is derived deterministically from the credential so the same session always
 * yields the same ID; the session ID is unique per request/conversation.
 *
 * This only emulates HTTP headers. It does not implement Cloudflare challenge
 * solving, Proof-of-Work, fingerprint spoofing, stealth, or proxies.
 */

export const FIREFOX_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:152.0) Gecko/20100101 Firefox/152.0";

export const OAI_CLIENT_VERSION =
  "prod-81e0c5cdf6140e8c5db714d613337f4aeab94029";

export const OAI_CLIENT_BUILD_NUMBER = "6128297";

export const CHATGPT_ORIGIN = "https://chatgpt.com";

/** SHA-256 of the credential seed, truncated to the first 32 hex chars. */
export async function stableDeviceId(seed: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(seed),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/** Random UUID used as the OpenAI session ID for a conversation. */
export function randomSessionId(): string {
  return crypto.randomUUID();
}

export function browserLikeHeaders(opts: {
  deviceId: string;
  sessionId: string;
  includeOai?: boolean;
  accept?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": FIREFOX_USER_AGENT,
    Accept: opts.accept ?? "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    Origin: CHATGPT_ORIGIN,
    Referer: `${CHATGPT_ORIGIN}/`,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  };
  if (opts.includeOai !== false) {
    headers["oai-language"] = "en-US";
    headers["oai-device-id"] = opts.deviceId;
    headers["oai-client-version"] = OAI_CLIENT_VERSION;
    headers["oai-client-build-number"] = OAI_CLIENT_BUILD_NUMBER;
    headers["oai-session-id"] = opts.sessionId;
  }
  return headers;
}
