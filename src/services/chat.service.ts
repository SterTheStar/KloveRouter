import { getDb } from "../db/connection";
import { textContentOf } from "./chat-content";

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

export interface ChatSearchResult {
  chat_id: string;
  message_id: string;
  title: string;
  role: ChatRole;
  snippet: string;
  updated_at: string;
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
      .query("SELECT * FROM chat_sessions ORDER BY updated_at DESC, created_at DESC, id ASC")
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
    const db = getDb();
    // The FTS table has no foreign keys, so its rows are cleaned up here.
    db.query("DELETE FROM chat_messages_fts WHERE chat_id = ?").run(id);
    return db.query("DELETE FROM chat_sessions WHERE id = ?").run(id).changes > 0;
  },

  deleteMessage(id: string): boolean {
    const db = getDb();
    const row = db.query("SELECT chat_id FROM chat_messages WHERE id = ?").get(id) as
      | { chat_id: string }
      | undefined;
    if (!row) return false;
    db.query("DELETE FROM chat_messages_fts WHERE message_id = ?").run(id);
    const deleted = db.query("DELETE FROM chat_messages WHERE id = ?").run(id).changes > 0;
    if (deleted)
      db.query("UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?").run(row.chat_id);
    return deleted;
  },

  /**
   * Updates a message's content and optionally truncates everything after it
   * (used by "edit message and resend").
   */
  updateMessageContent(
    id: string,
    input: { content?: unknown; attachments?: unknown[]; truncateAfter?: boolean },
  ): ChatMessage | null {
    const db = getDb();
    const current = db.query("SELECT * FROM chat_messages WHERE id = ?").get(id) as any;
    if (!current) return null;
    db.query("UPDATE chat_messages SET content = ?, attachments = ? WHERE id = ?").run(
      JSON.stringify(input.content === undefined ? parseJson(current.content, current.content) : input.content ?? ""),
      input.attachments === undefined
        ? current.attachments
        : input.attachments?.length
          ? JSON.stringify(input.attachments)
          : null,
      id,
    );
    if (input.truncateAfter) {
      db.query("DELETE FROM chat_messages_fts WHERE message_id IN (SELECT id FROM chat_messages WHERE chat_id = ? AND sequence > ?)").run(
        current.chat_id,
        current.sequence,
      );
      db.query("DELETE FROM chat_messages WHERE chat_id = ? AND sequence > ?").run(
        current.chat_id,
        current.sequence,
      );
    }
    db.query("UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?").run(current.chat_id);
    const updated = rowToMessage(db.query("SELECT * FROM chat_messages WHERE id = ?").get(id));
    this.indexMessage(updated);
    return updated;
  },

  search(query: string, limit = 20): ChatSearchResult[] {
    const trimmed = query.trim();
    if (!trimmed) return [];
    // Quote each whitespace-separated term so FTS syntax in the query is
    // treated as literal text; terms are combined with implicit AND.
    const match = trimmed
      .split(/\s+/)
      .map((term) => `"${term.replace(/"/g, "")}"`)
      .join(" ");
    return getDb()
      .query(
        `
        SELECT m.chat_id,
               m.id AS message_id,
               s.title,
               m.role,
               snippet(chat_messages_fts, 2, '«', '»', '…', 12) AS snippet,
               s.updated_at
        FROM chat_messages_fts
        JOIN chat_messages m ON m.id = chat_messages_fts.message_id
        JOIN chat_sessions s ON s.id = m.chat_id
        WHERE chat_messages_fts MATCH ?
        ORDER BY s.updated_at DESC, m.sequence ASC
        LIMIT ?
        `,
      )
      .all(match, limit) as ChatSearchResult[];
  },

  indexMessage(message: ChatMessage) {
    const db = getDb();
    db.query("DELETE FROM chat_messages_fts WHERE message_id = ?").run(message.id);
    db.query("INSERT INTO chat_messages_fts (message_id, chat_id, content) VALUES (?, ?, ?)").run(
      message.id,
      message.chat_id,
      textContentOf(message.content),
    );
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
    const created = rowToMessage(db.query("SELECT * FROM chat_messages WHERE id = ?").get(id));
    if (created) this.indexMessage(created);
    return created;
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
    const updated = rowToMessage(db.query("SELECT * FROM chat_messages WHERE id = ?").get(id));
    if (updated) this.indexMessage(updated);
    return updated;
  },

  setTitleFromMessage(id: string, content: string) {
    const session = this.findById(id);
    if (!session || session.title !== "New chat") return session;
    return this.update(id, { title: content.trim().replace(/\s+/g, " ").slice(0, 80) });
  },

  setGeneratedTitle(id: string, title: string): ChatSession | null {
    const db = getDb();
    const result = db.query(
      "UPDATE chat_sessions SET title = ?, updated_at = datetime('now') WHERE id = ? AND title = 'New chat'",
    ).run(normalizeTitle(title), id);
    return result.changes > 0 ? this.findById(id) : null;
  },
};
