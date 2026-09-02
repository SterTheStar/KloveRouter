process.env.DB_PATH = ":memory:";

import { describe, expect, test } from "bun:test";
const { getDb } = await import("../db/connection");
const { chatService } = await import("./chat.service");

getDb(); // initialize the in-memory database before touching the service

describe("chat service", () => {
  test("indexes messages for full-text search and keeps accents optional", () => {
    const chat = chatService.create({ title: "Search test" });
    chatService.addMessage({
      chatId: chat.id,
      role: "user",
      content: "como funciona o reasoning effort? coração e ação",
    });
    const hits = chatService.search("reasoning");
    expect(hits.length).toBe(1);
    expect(hits[0].chat_id).toBe(chat.id);
    expect(hits[0].snippet).toContain("reasoning");
    expect(chatService.search("coracao").length).toBe(1);
    expect(chatService.search("açãOOOO").length).toBe(0);
    chatService.delete(chat.id);
  });

  test("treats query punctuation as literal text", () => {
    const chat = chatService.create({ title: "Punctuation" });
    chatService.addMessage({
      chatId: chat.id,
      role: "user",
      content: 'the "quoted" OR (nested) AND term stays searchable',
    });
    expect(chatService.search('"quoted" OR (nested)').length).toBe(1);
    expect(chatService.search("quoted nested").length).toBe(1);
    chatService.delete(chat.id);
  });

  test("updateMessageContent reindexes and truncates following messages", () => {
    const chat = chatService.create({ title: "Truncate" });
    const first = chatService.addMessage({ chatId: chat.id, role: "user", content: "original question" })!;
    chatService.addMessage({ chatId: chat.id, role: "assistant", content: "first answer" });
    chatService.addMessage({ chatId: chat.id, role: "user", content: "follow up" });

    const updated = chatService.updateMessageContent(first.id, {
      content: "edited question",
      truncateAfter: true,
    });
    expect(updated?.content).toBe("edited question");

    const messages = chatService.get(chat.id)!.messages;
    expect(messages.length).toBe(1);
    expect(chatService.search("follow up").length).toBe(0);
    expect(chatService.search("first answer").length).toBe(0);
    expect(chatService.search("edited question").length).toBe(1);
    chatService.delete(chat.id);
  });

  test("deleteMessage removes the row and its search index", () => {
    const chat = chatService.create({ title: "Delete" });
    const message = chatService.addMessage({ chatId: chat.id, role: "user", content: "delete me soon" })!;
    expect(chatService.deleteMessage(message.id)).toBe(true);
    expect(chatService.deleteMessage(message.id)).toBe(false);
    expect(chatService.get(chat.id)!.messages.length).toBe(0);
    expect(chatService.search("delete me soon").length).toBe(0);
    chatService.delete(chat.id);
  });

  test("deleting a chat clears its search index", () => {
    const chat = chatService.create({ title: "Cleanup" });
    chatService.addMessage({ chatId: chat.id, role: "user", content: "orphaned searchable text" });
    chatService.delete(chat.id);
    expect(chatService.search("orphaned searchable text").length).toBe(0);
  });
});
