import type { Provider } from "../services/provider.service";
import { parseDataImage, openAIImageUrl } from "../services/multimodal";

export type AnthropicMessage = {
  role: "user" | "assistant" | "system" | "developer" | "tool";
  content: unknown;
  tool_calls?: unknown[];
  tool_call_id?: string;
};

function anthropicContent(content: any): any {
  if (!Array.isArray(content)) return content;
  return content.flatMap((part: any) => {
    if (part?.type === "image_url" || part?.type === "input_image") {
      const source = openAIImageUrl(part);
      const data = source ? parseDataImage(source) : null;
      if (data)
        return [{ type: "image", source: { type: "base64", media_type: data.mimeType, data: data.data } }];
      if (source?.startsWith("https://"))
        return [{ type: "image", source: { type: "url", url: source } }];
      return [];
    }
    if (part?.type === "text") return [{ type: "text", text: part.text ?? "" }];
    return [part];
  });
}

function anthropicToolUse(call: any): Record<string, unknown> {
  const input = call?.function?.arguments ?? call?.input ?? {};
  let parsedInput = input;
  if (typeof input === "string") {
    try { parsedInput = JSON.parse(input); } catch { parsedInput = {}; }
  }
  return {
    type: "tool_use",
    id: call?.id ?? `call_${crypto.randomUUID()}`,
    name: call?.function?.name ?? call?.name ?? "",
    input: parsedInput,
  };
}

function anthropicToolResult(message: AnthropicMessage): Record<string, unknown> {
  return {
    type: "tool_result",
    tool_use_id: message.tool_call_id ?? "",
    content: anthropicContent(message.content),
  };
}

export type AnthropicResponse = {
  id: string;
  type: "message";
  role: "assistant";
  content: {
    type: string;
    text?: string;
    thinking?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }[];
  model: string;
  stop_reason: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
};

export function anthropicEndpoint(provider: Provider, resource: "messages" | "models" = "messages"): string {
  const baseUrl = provider.base_url.replace(/\/+$/, "");
  return `${baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`}/${resource}`;
}

function headers(
  provider: Provider,
  apiKey = provider.api_key,
  stream = false,
): Record<string, string> {
  return {
    Accept: stream ? "text/event-stream" : "application/json",
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
}

export function splitAnthropicMessages(messages: AnthropicMessage[]) {
  const systemMessages = messages.filter(
    (message) => (message as { role: string }).role === "system" || message.role === "developer",
  );
  return {
    system:
      systemMessages.length > 0
        ? systemMessages.map((message) => message.content).join("\n")
        : undefined,
    messages: messages
      .filter(
        (message) => message.role === "user" || message.role === "assistant" || message.role === "tool",
      )
      .map((message) => {
        if (message.role === "tool") return { role: "user", content: [anthropicToolResult(message)] };
        const toolUses = message.role === "assistant" ? (message.tool_calls ?? []).map(anthropicToolUse) : [];
        if (!Array.isArray(message.content) && toolUses.length === 0) {
          return { role: message.role, content: message.content };
        }
        const content = [
          ...((Array.isArray(message.content) ? message.content : message.content == null ? [] : [{ type: "text", text: String(message.content) }]) as any[]),
          ...toolUses,
        ];
        return { role: message.role, content: anthropicContent(content) };
      }),
  };
}

export class AnthropicRequestError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    const message = (body as any)?.error?.message ?? (body as any)?.message ?? `Anthropic request failed (${status})`;
    super(message);
    this.name = "AnthropicRequestError";
    this.status = status;
    this.body = body;
  }
}

export async function createAnthropicMessage(
  provider: Provider,
  payload: Record<string, unknown>,
  apiKey?: string,
  signal?: AbortSignal,
): Promise<AnthropicResponse> {
  const response = await fetch(anthropicEndpoint(provider), {
    method: "POST",
    headers: headers(provider, apiKey),
    body: JSON.stringify(payload),
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new AnthropicRequestError(response.status, data);
  return data as AnthropicResponse;
}

export async function createAnthropicStream(
  provider: Provider,
  payload: Record<string, unknown>,
  apiKey?: string,
  signal?: AbortSignal,
): Promise<Response> {
  const response = await fetch(anthropicEndpoint(provider), {
    method: "POST",
    headers: headers(provider, apiKey, true),
    body: JSON.stringify({ ...payload, stream: true }),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new AnthropicRequestError(response.status, data);
  }
  return response;
}

export function toOpenAICompletion(response: AnthropicResponse) {
  const text =
    response.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("") ?? "";
  const toolCalls =
    response.content
      ?.filter((block) => block.type === "tool_use")
      .map((block, index) => ({
        index,
        id: block.id ?? `call_${crypto.randomUUID()}`,
        type: "function",
        function: {
          name: block.name ?? "",
          arguments: JSON.stringify(block.input ?? {}),
        },
      })) ?? [];
  const message: Record<string, unknown> = {
    role: "assistant",
    content: text || null,
  };
  const reasoning =
    response.content
      ?.filter((block) => block.type === "thinking")
      .map((block) => block.thinking ?? "")
      .join("") ?? "";
  if (reasoning) message.reasoning_content = reasoning;
  if (toolCalls.length) message.tool_calls = toolCalls;
  const promptTokens = response.usage?.input_tokens ?? 0;
  const completionTokens = response.usage?.output_tokens ?? 0;
  return {
    id: response.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: response.model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: toolCalls.length
          ? "tool_calls"
          : (response.stop_reason ?? "stop"),
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      cache_read_input_tokens: response.usage?.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens:
        response.usage?.cache_creation_input_tokens ?? 0,
    },
  };
}
