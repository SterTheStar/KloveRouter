import type { ChatStats } from "../types";

/**
 * Builds the provider-prefixed model id used by the routing proxy, matching
 * `providerPrefix()` on the backend: "googleantigravity/gemini-3-flash".
 */
export function modelApiId(providerName: string, modelId: string): string {
  return `${providerName.toLowerCase().replace(/\s+/g, "")}/${modelId}`;
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

export interface ChatStreamHandlers {
  onContent: (delta: string) => void;
  onReasoning: (delta: string) => void;
  onUsage: (usage: { prompt_tokens?: number; completion_tokens?: number }) => void;
  onStats: (stats: ChatStats) => void;
  onError: (message: string) => void;
}

/**
 * Reads an OpenAI-compatible SSE stream from the panel chat endpoint and
 * dispatches each chunk to the handlers. `[DONE]` and the custom
 * `klove_stats` event are handled internally.
 */
export async function readChatStream(
  response: Response,
  handlers: ChatStreamHandlers,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Chat returned an empty stream");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const dataLine = event
        .split("\n")
        .find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      const raw = dataLine.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;

      let chunk: any;
      try {
        chunk = JSON.parse(raw);
      } catch {
        continue;
      }
      if (chunk.type === "klove_stats") {
        handlers.onStats({
          model: chunk.model ?? null,
          prompt_tokens: Number(chunk.prompt_tokens ?? 0),
          completion_tokens: Number(chunk.completion_tokens ?? 0),
          total_tokens: Number(chunk.total_tokens ?? 0),
          duration_ms: Number(chunk.duration_ms ?? 0),
          tps: Number(chunk.tps ?? 0),
        });
        continue;
      }
      if (chunk.error) {
        handlers.onError(
          typeof chunk.error === "string"
            ? chunk.error
            : chunk.error.message ?? "Chat request failed",
        );
        continue;
      }
      if (chunk.usage) {
        handlers.onUsage({
          prompt_tokens: chunk.usage.prompt_tokens,
          completion_tokens: chunk.usage.completion_tokens,
        });
      }
      const delta = chunk.choices?.[0]?.delta;
      if (typeof delta?.content === "string") handlers.onContent(delta.content);
      if (typeof delta?.reasoning_content === "string")
        handlers.onReasoning(delta.reasoning_content);
    }
    if (done) break;
  }
}