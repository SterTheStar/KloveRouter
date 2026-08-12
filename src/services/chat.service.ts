import { getDb } from "../db/connection";

export type ChatRole = "user" | "assistant";

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  role: ChatRole;
  content: unknown;
  attachments: unknown[];
  reasoning?: string;
  stats: Record<string, unknown> | null;
  error: string | null;
  sequence: number;
  created_at: string;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeTitle(title: string | undefined, fallback = "New chat") {
  const value = title?.trim().replace(/\s+/g, " ");
  return value ? value.slice(0, 120) : fallback;
}

function rowToMessage(row: any): ChatMessage {
  return {
    id: row.id,
    chat_id: row.chat_id,
    role: row.role,
    content: parseJson(row.content, row.content),
    attachments: parseJson(row.attachments, []),
    reasoning: row.reasoning ?? undefined,
    stats: parseJson(row.stats, null),
    error: row.error ?? null,
    sequence: row.sequence,
    created_at: row.created_at,
  };
}

export const chatService = {
  list(): ChatSession[] {
    return getDb()
      .query("SELECT * FROM chat_sessions ORDER BY updated_at DESC, created_at DESC")
      .all() as ChatSession[];
  },

  findById(id: string): ChatSession | null {
    return (getDb().query("SELECT * FROM chat_sessions WHERE id = ?").get(id) as ChatSession | null) ?? null;
  },

  get(id: string): { session: ChatSession; messages: ChatMessage[] } | null {
    const session = this.findById(id);
    if (!session) return null;
    const rows = getDb()
      .query("SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY sequence ASC")
      .all(id);
    return { session, messages: (rows as any[]).map(rowToMessage) };
  },

  create(input: { title?: string; model?: string } = {}): ChatSession {
    const id = crypto.randomUUID();
    getDb()
      .query("INSERT INTO chat_sessions (id, title, model) VALUES (?, ?, ?)")
      .run(id, normalizeTitle(input.title), input.model?.trim() ?? "");
    return this.findById(id)!;
  },

  update(id: string, input: { title?: string; model?: string }): ChatSession | null {
    const current = this.findById(id);
    if (!current) return null;
    const title = input.title === undefined ? current.title : normalizeTitle(input.title);
    const model = input.model === undefined ? current.model : input.model.trim();
    getDb()
      .query("UPDATE chat_sessions SET title = ?, model = ?, updated_at = datetime('now') WHERE id = ?")
      .run(title, model, id);
    return this.findById(id);
  },

  delete(id: string): boolean {
    return getDb().query("DELETE FROM chat_sessions WHERE id = ?").run(id).changes > 0;
  },

  addMessage(input: {
    chatId: string;
    id?: string;
    role: ChatRole;
    content: unknown;
    attachments?: unknown[];
    reasoning?: string;
    stats?: Record<string, unknown> | null;
    error?: string | null;
  }): ChatMessage | null {
    const session = this.findById(input.chatId);
    if (!session) return null;
    const db = getDb();
    const id = input.id ?? crypto.randomUUID();
    const next = db
      .query("SELECT COALESCE(MAX(sequence), -1) + 1 AS sequence FROM chat_messages WHERE chat_id = ?")
      .get(input.chatId) as { sequence: number };
    db.query(
      "INSERT INTO chat_messages (id, chat_id, role, content, attachments, reasoning, stats, error, sequence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      input.chatId,
      input.role,
      JSON.stringify(input.content ?? ""),
      input.attachments?.length ? JSON.stringify(input.attachments) : null,
      input.reasoning ?? null,
      input.stats ? JSON.stringify(input.stats) : null,
      input.error ?? null,
      next.sequence,
    );
    db.query("UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?").run(input.chatId);
    return rowToMessage(db.query("SELECT * FROM chat_messages WHERE id = ?").get(id));
  },

  updateMessage(id: string, input: { content?: unknown; reasoning?: string; stats?: Record<string, unknown> | null; error?: string | null }): ChatMessage | null {
    const db = getDb();
    const current = db.query("SELECT * FROM chat_messages WHERE id = ?").get(id) as any;
    if (!current) return null;
    db.query(
      "UPDATE chat_messages SET content = ?, reasoning = ?, stats = ?, error = ? WHERE id = ?",
    ).run(
      JSON.stringify(input.content === undefined ? parseJson(current.content, current.content) : input.content),
      input.reasoning === undefined ? current.reasoning : input.reasoning || null,
      input.stats === undefined ? current.stats : input.stats ? JSON.stringify(input.stats) : null,
      input.error === undefined ? current.error : input.error,
      id,
    );
    db.query("UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?").run(current.chat_id);
    return rowToMessage(db.query("SELECT * FROM chat_messages WHERE id = ?").get(id));
  },

  setTitleFromMessage(id: string, content: string) {
    const session = this.findById(id);
    if (!session || session.title !== "New chat") return session;
    return this.update(id, { title: content.trim().replace(/\s+/g, " ").slice(0, 80) });
  },
};
