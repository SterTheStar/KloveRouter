import type { ChatStats } from "../types";

/**
 * Builds the provider-prefixed model id used by the routing proxy, matching
 * `providerPrefix()` on the backend: "googleantigravity/gemini-3-flash".
 */
export function modelApiId(providerName: string, modelId: string, prettyId?: string | null): string {
  return `${providerName.toLowerCase().replace(/\s+/g, "")}/${prettyId || modelId}`;
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatTps(tps: number): string {
  return `${tps.toFixed(1)} tok/s`;
}

/**
 * Splits a raw SSE text stream into complete events on blank lines,
 * tolerating LF, CRLF and CR line endings. Incomplete trailing events are
 * carried over to the next call.
 */
export function createSseSplitter(): (chunk: string) => string[] {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk;
    const events = buffer.split(/\r\n\r\n|\n\n|\r\r/);
    buffer = events.pop() ?? "";
    return events;
  };
}

/**
 * Extracts the `data:` payload of one SSE event, joining multiline data
 * per the SSE spec and ignoring comment/keep-alive lines.
 */
export function extractSseData(event: string): string {
  return event
    .split(/\r\n|\r|\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n")
    .trim();
}

export interface ChatStreamDelta {
  content?: string;
  reasoning_content?: string;
}

export interface ChatStreamChunk {
  type?: string;
  chat_id?: string;
  title?: string;
  error?: { message?: string } | string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  choices?: Array<{ delta?: ChatStreamDelta }>;
  [key: string]: unknown;
}

export interface ChatStreamUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
}

export interface ChatStreamHandlers {
  onContent: (delta: string) => void;
  onReasoning: (delta: string) => void;
  onUsage: (usage: ChatStreamUsage) => void;
  onStats: (stats: ChatStats) => void;
  onTitle: (title: { chat_id: string; title: string }) => void;
  onError: (message: string) => void;
}

function handleChunk(raw: string, handlers: ChatStreamHandlers): void {
  let chunk: ChatStreamChunk;
  try {
    chunk = JSON.parse(raw);
  } catch {
    return;
  }
  if (chunk.type === "klove_chat_title") {
    handlers.onTitle({ chat_id: String(chunk.chat_id), title: String(chunk.title) });
    return;
  }
  if (chunk.type === "klove_usage") {
    // Values are passed through as-is: absent fields must stay undefined so
    // the caller keeps its current values instead of zeroing them out.
    handlers.onUsage({
      prompt_tokens: chunk.prompt_tokens as number | undefined,
      completion_tokens: chunk.completion_tokens as number | undefined,
      total_tokens: chunk.total_tokens as number | undefined,
      cache_read_tokens: (chunk as any).cache_read_tokens as number | undefined,
      cache_write_tokens: (chunk as any).cache_write_tokens as number | undefined,
    });
    return;
  }
  if (chunk.type === "klove_stats") {
    handlers.onStats({
      model: (chunk.model as string | null) ?? null,
      prompt_tokens: Number(chunk.prompt_tokens ?? 0),
      completion_tokens: Number(chunk.completion_tokens ?? 0),
      total_tokens: Number(chunk.total_tokens ?? 0),
      duration_ms: Number(chunk.duration_ms ?? 0),
      cache_read_tokens: Number(chunk.cache_read_tokens ?? 0),
      cache_write_tokens: Number(chunk.cache_write_tokens ?? 0),
      tps: Number(chunk.tps ?? 0),
    });
    return;
  }
  if (chunk.error) {
    handlers.onError(
      typeof chunk.error === "string"
        ? chunk.error
        : chunk.error.message ?? "Chat request failed",
    );
    return;
  }
  if (chunk.usage) {
    handlers.onUsage({
      prompt_tokens: chunk.usage.prompt_tokens,
      completion_tokens: chunk.usage.completion_tokens,
      total_tokens: chunk.usage.total_tokens,
    });
  }
  const delta = chunk.choices?.[0]?.delta;
  if (typeof delta?.content === "string") handlers.onContent(delta.content);
  if (typeof delta?.reasoning_content === "string")
    handlers.onReasoning(delta.reasoning_content);
}

/**
 * Reads an OpenAI-compatible SSE stream from the panel chat endpoint and
 * dispatches each chunk to the handlers. `[DONE]` and the custom
 * `klove_stats`/`klove_usage`/`klove_chat_title` events are handled internally.
 */
export async function readChatStream(
  response: Response,
  handlers: ChatStreamHandlers,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Chat returned an empty stream");

  const decoder = new TextDecoder();
  const splitEvent = createSseSplitter();

  while (true) {
    const { done, value } = await reader.read();
    const events = splitEvent(decoder.decode(value ?? new Uint8Array(), { stream: !done }));
    for (const event of events) {
      const raw = extractSseData(event);
      if (!raw || raw === "[DONE]") continue;
      handleChunk(raw, handlers);
    }
    if (done) break;
  }
}
