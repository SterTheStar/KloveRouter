import type { Provider } from "../services/provider.service";

export type AnthropicMessage = {
  role: "user" | "assistant" | "system";
  content: unknown;
};

export type AnthropicResponse = {
  id: string;
  type: "message";
  role: "assistant";
  content: { type: string; text?: string; id?: string; name?: string; input?: unknown }[];
  model: string;
  stop_reason: string | null;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
};

function endpoint(provider: Provider): string {
  const baseUrl = provider.base_url.replace(/\/+$/, "");
  return baseUrl.endsWith("/v1") ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`;
}

function headers(provider: Provider, apiKey = provider.api_key): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
}

export function splitAnthropicMessages(messages: AnthropicMessage[]) {
  const systemMessages = messages.filter((message) => (message as { role: string }).role === "system");
  return {
    system: systemMessages.length > 0 ? systemMessages.map((message) => message.content).join("\n") : undefined,
    messages: messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({ role: message.role, content: message.content })),
  };
}

export async function createAnthropicMessage(
  provider: Provider,
  payload: Record<string, unknown>,
  apiKey?: string
): Promise<AnthropicResponse> {
  const response = await fetch(endpoint(provider), {
    method: "POST",
    headers: headers(provider, apiKey),
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message ?? data?.message ?? `Anthropic request failed (${response.status})`);
  }
  return data as AnthropicResponse;
}

export async function createAnthropicStream(
  provider: Provider,
  payload: Record<string, unknown>,
  apiKey?: string
): Promise<Response> {
  const response = await fetch(endpoint(provider), {
    method: "POST",
    headers: headers(provider, apiKey),
    body: JSON.stringify({ ...payload, stream: true }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message ?? data?.message ?? `Anthropic request failed (${response.status})`);
  }
  return response;
}

export function toOpenAICompletion(response: AnthropicResponse) {
  const text = response.content?.filter((block) => block.type === "text").map((block) => block.text ?? "").join("") ?? "";
  const toolCalls = response.content?.filter((block) => block.type === "tool_use").map((block, index) => ({
    index,
    id: block.id ?? `call_${crypto.randomUUID()}`,
    type: "function",
    function: { name: block.name ?? "", arguments: JSON.stringify(block.input ?? {}) },
  })) ?? [];
  const message: Record<string, unknown> = { role: "assistant", content: text || null };
  if (toolCalls.length) message.tool_calls = toolCalls;
  const promptTokens = response.usage?.input_tokens ?? 0;
  const completionTokens = response.usage?.output_tokens ?? 0;
  return {
    id: response.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: response.model,
    choices: [{ index: 0, message, finish_reason: toolCalls.length ? "tool_calls" : response.stop_reason ?? "stop" }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens, cache_read_input_tokens: response.usage?.cache_read_input_tokens ?? 0, cache_creation_input_tokens: response.usage?.cache_creation_input_tokens ?? 0 },
  };
}
