type CacheEntry = { conversationId: string; expiresAt: number };
export type ConversationCacheOptions = { maxEntries?: number; ttlMs?: number };

export class ConversationIdCache {
  private readonly entries = new Map<string, CacheEntry>();
  readonly maxEntries: number;
  readonly ttlMs: number;
  constructor(options: ConversationCacheOptions = {}) {
    this.maxEntries = Math.max(1, options.maxEntries ?? 256);
    this.ttlMs = Math.max(1, options.ttlMs ?? 30 * 60_000);
  }
  get(key: string, now = Date.now()) {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.conversationId;
  }
  set(key: string, conversationId: string, now = Date.now()) {
    this.entries.delete(key);
    this.entries.set(key, { conversationId, expiresAt: now + this.ttlMs });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
  }
  delete(key: string) { this.entries.delete(key); }
  clear() { this.entries.clear(); }
  get size() { return this.entries.size; }
}

export const conversationIdCache = new ConversationIdCache();

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value as object).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])]));
  return value;
}

export async function conversationFingerprint(body: any, model: string, accountId?: string): Promise<string> {
  const messages = (body?.messages ?? []).map((message: any) => ({ role: message.role, content: message.content, name: message.name, tool_calls: message.tool_calls, tool_call_id: message.tool_call_id }));
  const canonical = JSON.stringify(stable({ messages, model, account_id: accountId ?? "" }));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
