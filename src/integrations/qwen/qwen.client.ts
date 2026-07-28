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

export function extractQwenContent(text: string): {
  content: string;
  reasoningContent?: string;
} {
  const reasoning = [...text.matchAll(/<details[^>]*>([\s\S]*?)<\/details>/gi)]
    .map((match) => match[1].replace(/<[^>]+>/g, "").trim())
    .filter(Boolean)
    .join("\n\n");
  const content = removeQwenFooter(
    text.replace(/<details[^>]*>[\s\S]*?<\/details>/gi, "").trim(),
  );
  return {
    content: content || (reasoning ? "" : text),
    ...(reasoning ? { reasoningContent: reasoning } : {}),
  };
}

function removeQwenFooter(text: string): string {
  return text
    .replace(
      /\s*Howu\s*\n+\s*[A-Z][a-z]+ \d{1,2}, \d{4}\s*$/i,
      "",
    )
    .trim();
}

export function cleanQwenContent(text: string): string {
  return extractQwenContent(text).content;
}

export function cleanQwenStream(response: Response): Response {
  const reader = response.body?.getReader();
  if (!reader) return response;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return new Response(
    new ReadableStream({
      async start(controller) {
        const emit = (event: string) => {
          const lines = event.split(/\r?\n/);
          const dataLine = lines.find((line) => line.startsWith("data:"));
          if (!dataLine) {
            controller.enqueue(encoder.encode(`${event}\n\n`));
            return;
          }
          const raw = dataLine.slice(5).trim();
          if (!raw || raw === "[DONE]") {
            controller.enqueue(encoder.encode(`${event}\n\n`));
            return;
          }
          try {
            const data = JSON.parse(raw);
            for (const choice of data.choices ?? []) {
              if (typeof choice.delta?.content === "string")
                choice.delta.content = cleanQwenContent(choice.delta.content);
              if (typeof choice.message?.content === "string")
                choice.message.content = cleanQwenContent(choice.message.content);
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
            );
          } catch {
            controller.enqueue(encoder.encode(`${event}\n\n`));
          }
        };
        try {
          while (true) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
            const events = buffer.split(/\r?\n\r?\n/);
            buffer = events.pop() ?? "";
            for (const event of events) emit(event);
            if (done) {
              if (buffer.trim()) emit(buffer);
              break;
            }
          }
        } finally {
          controller.close();
        }
      },
    }),
    { headers: response.headers },
  );
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
  { id: string; display_name: string; is_thinking_model?: boolean; [key: string]: any }[]
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
      ...m,
      id: m.id,
      display_name: m.display_name || m.id,
      is_thinking_model: m.info?.meta?.think_skip?.enable === false,
      capabilities: {
        ...(m.capabilities && typeof m.capabilities === "object" ? m.capabilities : {}),
        ...(m.info?.meta?.think_skip?.enable === false ? { reasoning: true } : {}),
      },
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
