import { chatgptRequestHeaders, normalizeChatGptAuth } from "./auth";
import { conversationFingerprint, conversationIdCache } from "./cache";
import { chatGptRequestBody } from "./transform";

export const DEFAULT_CHATGPT_BASE_URL = "https://chatgpt.com/backend-api";

export function normalizeChatGptBaseUrl(value?: unknown): string {
  const base = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_CHATGPT_BASE_URL;
  return base.replace(/\/+$/, "");
}

async function headers(credential: unknown, accept = "application/json") {
  return {
    ...(await chatgptRequestHeaders(credential, { accept })),
    "Content-Type": "application/json",
  };
}

function errorMessage(data: any, status: number) {
  return (
    data?.detail ??
    data?.message ??
    data?.error?.message ??
    `ChatGPT request failed (${status})`
  );
}

function sseConversation(text: string) {
  let conversationId: string | undefined;
  let output = "";
  for (const event of text.split(/\n\n|\r\n\r\n|\r\r/)) {
    const raw = event.split(/\r?\n/).filter((item) => item.startsWith("data:")).map((item) => item.slice(5).trim()).join("\n");
    if (!raw || raw === "[DONE]") continue;
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { continue; }
    if (parsed.error) continue;
    const id = parsed.conversation_id ?? parsed.conversation?.id;
    if (typeof id === "string" && id) conversationId = id;
    const cumulative = parsed.message?.content?.parts?.join("") ?? parsed.message?.content?.text;
    if (typeof cumulative === "string") output = cumulative;
    else if (typeof parsed.delta === "string" || typeof parsed.text === "string") output += parsed.delta ?? parsed.text;
  }
  return { conversationId, text: output };
}

function openAICompletion(model: string, text: string, usage?: unknown) {
  return Response.json({
    id: `chatcmpl-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage,
  });
}

export async function chatgptResponses(
  body: any,
  model: string,
  credential?: unknown,
  baseUrl?: string,
) {
  const auth = normalizeChatGptAuth(credential);
  const base = normalizeChatGptBaseUrl(baseUrl);
  const fingerprint = await conversationFingerprint(body, model, auth.accountId);
  const conversationId = conversationIdCache.get(fingerprint);
  const response = await fetch(`${base}/conversation`, {
    method: "POST",
    headers: await headers(credential, body?.stream ? "text/event-stream" : "application/json"),
    body: JSON.stringify(chatGptRequestBody(body, model, conversationId)),
  });
  if (body?.stream) {
    if (!response.ok) {
      const data = await response.clone().json().catch(() => null);
      throw new Error(errorMessage(data, response.status));
    }
    return response;
  }
  const raw = await response.text();
  let data: any;
  try { data = JSON.parse(raw); } catch { data = null; }
  if (!response.ok) throw new Error(errorMessage(data, response.status));
  const sse = data ? undefined : sseConversation(raw);
  const id = data?.conversation_id ?? data?.conversation?.id ?? sse?.conversationId;
  if (typeof id === "string" && id) conversationIdCache.set(fingerprint, id);
  const text = data
    ? data?.message?.content?.parts?.join("") ??
      data?.message?.content?.text ??
      data?.response?.message?.content?.parts?.join("") ??
      data?.text ?? ""
    : sse?.text ?? "";
  return openAICompletion(model, text, data?.usage);
}

export async function chatgptTest(model: string, credential?: unknown, baseUrl?: string) {
  const response = await chatgptResponses(
    {
      messages: [{ role: "user", content: "Say 'ok' and nothing else." }],
      stream: true,
    },
    model,
    credential,
    baseUrl,
  );
  const text = await response.text();
  let output = "";
  for (const event of text.split(/\n\n|\r\n\r\n|\r\r/)) {
    const raw = event.split(/\r?\n/).filter((item) => item.startsWith("data:")).map((item) => item.slice(5).trim()).join("\n");
    if (!raw || raw === "[DONE]") continue;
    try {
      const data = JSON.parse(raw);
      if (data.error) throw new Error(data.error.message ?? data.error.detail ?? String(data.error));
      const cumulative = data.message?.content?.parts?.filter((part: unknown) => typeof part === "string").join("") ?? data.message?.content?.text;
      const part = cumulative ?? data.choices?.[0]?.delta?.content ?? data.delta ?? data.text;
      if (typeof part === "string") output = typeof cumulative === "string" ? cumulative : output + part;
    } catch (error) {
      if (error instanceof Error && error.message !== "Unexpected end of JSON input") throw error;
    }
  }
  output = output.trim();
  if (!output) throw new Error("ChatGPT returned an empty response");
  return output;
}

export { chatgptStreamToOpenAI } from "./transform";
