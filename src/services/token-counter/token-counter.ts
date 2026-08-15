import { get_encoding } from "tiktoken";
import { resolveEncoding } from "./encoding-resolver";
import { normalizeMessages, serializeMessages } from "./message-normalizer";
import type { TokenCount, TokenCounterContext } from "./types";

const encoders = new Map<string, ReturnType<typeof get_encoding>>();

function encoderFor(context: TokenCounterContext) {
  const resolution = resolveEncoding(context.model, context.provider);
  const key = resolution.encoding;
  const cached = encoders.get(key);
  if (cached) return { encoder: cached, estimated: resolution.estimated };
  try {
    const encoder = get_encoding("cl100k_base");
    encoders.set(key, encoder);
    return { encoder, estimated: resolution.estimated };
  } catch {
    return { encoder: null, estimated: true };
  }
}

export function countText(text: string, context: TokenCounterContext = {}): number {
  if (!text) return 0;
  const { encoder } = encoderFor(context);
  if (!encoder) return Math.max(1, Math.ceil(text.length / 4));
  try {
    return encoder.encode(text).length;
  } catch {
    return Math.max(1, Math.ceil(text.length / 4));
  }
}

export function countMessages(messages: unknown, context: TokenCounterContext = {}): number {
  const normalized = normalizeMessages(messages);
  if (!normalized.length) return 0;
  return countText(serializeMessages(normalized), context) + normalized.length * 3;
}

export function countCompletion(text: string, context: TokenCounterContext = {}): number {
  return countText(text, context);
}

export function estimateUsage(messages: unknown, completion: string, context: TokenCounterContext = {}): TokenCount {
  const prompt = countMessages(messages, context);
  const output = countCompletion(completion, context);
  const { estimated } = encoderFor(context);
  return { prompt, completion: output, total: prompt + output, cacheRead: 0, cacheWrite: 0, source: estimated ? "tiktoken" : "tiktoken", estimated: true };
}

export function disposeTokenCounter(): void {
  for (const encoder of encoders.values()) encoder.free();
  encoders.clear();
}
