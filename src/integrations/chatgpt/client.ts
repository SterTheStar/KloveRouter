import { chatgptAuthHeaders, normalizeChatGptAuth } from "./auth";
import { conversationFingerprint, conversationIdCache } from "./cache";
import { chatGptRequestBody } from "./transform";

const BASE = "https://chatgpt.com/backend-api";

function headers(credential: unknown, accept = "application/json") {
  return {
    ...chatgptAuthHeaders(credential, accept),
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
    const line = event.split(/\r?\n/).find((item) => item.startsWith("data:"));
    const raw = line?.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { continue; }
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
) {
  const auth = normalizeChatGptAuth(credential);
  const fingerprint = await conversationFingerprint(body, model, auth.accountId);
  const conversationId = conversationIdCache.get(fingerprint);
  const response = await fetch(`${BASE}/conversation`, {
    method: "POST",
    headers: headers(credential, body?.stream ? "text/event-stream" : "application/json"),
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

export async function chatgptTest(model: string, credential?: unknown) {
  const response = await chatgptResponses(
    {
      messages: [{ role: "user", content: "Say 'ok' and nothing else." }],
      stream: true,
    },
    model,
    credential,
  );
  const text = await response.text();
  const values: string[] = [];
  for (const event of text.split(/\n\n|\r\n\r\n/)) {
    const line = event.split(/\r?\n/).find((item) => item.startsWith("data:"));
    if (!line) continue;
    const raw = line.slice(5).trim();
    if (raw === "[DONE]") continue;
    try {
      const data = JSON.parse(raw);
      const part =
        data.message?.content?.parts?.join("") ??
        data.message?.content?.text ??
        data.choices?.[0]?.delta?.content ??
        data.delta ?? data.text;
      if (typeof part === "string") values.push(part);
    } catch {
      // Ignore non-JSON SSE keepalive events.
    }
  }
  const output = values.join("").trim();
  if (!output) throw new Error("ChatGPT returned an empty response");
  return output;
}

export { chatgptStreamToOpenAI } from "./transform";
