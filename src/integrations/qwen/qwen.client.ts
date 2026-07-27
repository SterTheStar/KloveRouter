import { logger } from "../../logger";

const DEFAULT_BASE_URL = "https://qwen.aikit.club";
const USER_AGENT = "Klove/1.0.0";

type QwenCredential = {
  id: string;
  secret?: string | null;
};

type QwenUsage = {
  authenticated: boolean;
  status: string;
  model?: string;
  access_token?: string | null;
  expires_at?: string | null;
};

export function cleanQwenContent(text: string): string {
  const stripped = text.replace(/<details>[\s\S]*?<\/details>/g, "").trim();
  return stripped || text;
}

function tokenOf(credential: QwenCredential) {
  if (!credential.secret) throw new Error("Qwen token is not configured");
  return credential.secret;
}

function baseUrl(url?: string) {
  return (url || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function headers(credential: QwenCredential, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${tokenOf(credential)}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": USER_AGENT,
    ...extra,
  };
}

async function jsonError(response: Response, action: string) {
  const text = await response.text().catch(() => "");
  throw new Error(`${action} failed (${response.status}): ${text.slice(0, 1000)}`);
}

export async function qwenResponses(
  body: any,
  model: string,
  credential: QwenCredential,
  endpoint?: string,
): Promise<Response> {
  const upstream = baseUrl(endpoint);
  const payload = {
    ...body,
    model,
    stream: body.stream ?? false,
  };

  const requestStarted = performance.now();
  const response = await fetch(`${upstream}/v1/chat/completions`, {
    method: "POST",
    headers: headers(credential),
    body: JSON.stringify(payload),
  });

  logger.debug("Qwen response headers received", {
    model,
    duration_ms: Math.round(performance.now() - requestStarted),
    status: response.status,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Qwen chat failed (${response.status}): ${text.slice(0, 1000)}`);
  }

  const cloned = response.clone();
  const preview = await cloned.text().catch(() => "");
  logger.debug("Qwen response body preview", {
    preview: preview.slice(0, 200),
  });

  return response;
}

export async function qwenModels(
  credential: QwenCredential,
  endpoint?: string,
): Promise<
  { id: string; display_name: string; is_thinking_model?: boolean }[]
> {
  const upstream = baseUrl(endpoint);
  const response = await fetch(`${upstream}/v1/models`, {
    headers: { ...headers(credential), Accept: "application/json" },
  });

  if (!response.ok) await jsonError(response, "Qwen models");
  const data = await response.json().catch(() => null);
  const raw = data?.data ?? data?.models ?? data ?? [];
  const entries = Array.isArray(raw)
    ? raw
    : Object.entries(raw).map(([id, m]: any) => ({
        id: id.replace(/^models\//, ""),
        ...m,
      }));

  return entries
    .filter((m: any) => m.id)
    .map((m: any) => ({
      id: m.id,
      display_name: m.display_name || m.id,
      is_thinking_model: m.info?.meta?.think_skip?.enable === false,
    }));
}

export async function qwenValidate(
  credential: QwenCredential,
  endpoint?: string,
): Promise<QwenUsage> {
  const upstream = baseUrl(endpoint);
  const response = await fetch(`${upstream}/v1/validate`, {
    method: "POST",
    headers: headers(credential),
    body: JSON.stringify({ token: credential.secret }),
  });

  if (!response.ok) await jsonError(response, "Qwen validate");
  const data = await response.json().catch(() => null);
  return {
    authenticated: true,
    status: "ok",
    access_token: data?.access_token ?? null,
    expires_at: data?.expires_at ? new Date(data.expires_at * 1000).toISOString() : null,
  };
}

export async function qwenRefresh(
  credential: QwenCredential,
  endpoint?: string,
): Promise<{ access_token: string; expires_at: string }> {
  const upstream = baseUrl(endpoint);
  const response = await fetch(`${upstream}/v1/refresh`, {
    method: "POST",
    headers: headers(credential),
    body: JSON.stringify({ token: credential.secret }),
  });

  if (!response.ok) await jsonError(response, "Qwen refresh");
  const data = await response.json().catch(() => null);
  if (!data?.access_token) throw new Error("Qwen refresh did not return an access_token");

  return {
    access_token: data.access_token,
    expires_at: data.expires_at
      ? new Date(data.expires_at * 1000).toISOString()
      : new Date(Date.now() + 5 * 24 * 3600_000).toISOString(),
  };
}

export async function qwenTest(
  model: string,
  credential: QwenCredential,
  endpoint?: string,
): Promise<any> {
  const response = await qwenResponses(
    {
      model,
      messages: [{ role: "user", content: "Say 'ok' and nothing else." }],
      max_tokens: 10,
      stream: false,
    },
    model,
    credential,
    endpoint,
  );

  if (!response.ok) {
    throw new Error(`Qwen test failed (${response.status})`);
  }
  return response.json();
}

export async function qwenUsage(
  credential: QwenCredential,
  endpoint?: string,
  model = "qwen-max-latest",
): Promise<QwenUsage> {
  try {
    const result = await qwenValidate(credential, endpoint);
    return { ...result, model };
  } catch (error: any) {
    logger.warn("Qwen usage check failed", { error: error.message });
    return {
      authenticated: false,
      status: "error",
      model,
    };
  }
}
