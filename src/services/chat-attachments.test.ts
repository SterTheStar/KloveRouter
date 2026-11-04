process.env.DB_PATH = ":memory:";

import { describe, expect, test } from "bun:test";
const { getDb } = await import("../db/connection");
const { chatService } = await import("./chat.service");
const { initSchema } = await import("../db/schema");
const { summarizeAttachment } = await import("./chat-attachments");

getDb();

const bigImage = (fill: number, bytes = 1_600_000) =>
  `data:image/png;base64,${Buffer.alloc(bytes, fill).toString("base64")}`;

describe("chat attachments", () => {
  test("heavy payloads leave the message JSON and load on demand", () => {
    const db = getDb();
    const chat = chatService.create({ title: "Attachments" });
    const data = bigImage(1);
    const message = chatService.addMessage({
      chatId: chat.id,
      role: "user",
      content: [{ type: "text", text: "see this" }],
      attachments: [{ id: "img", kind: "image", name: "a.png", mimeType: "image/png", data, preview: data }],
    })!;

    const stored = db.query("SELECT attachments FROM chat_messages WHERE id = ?").get(message.id) as { attachments: string };
    expect(stored.attachments.length).toBeLessThan(1000);
    expect(stored.attachments).not.toContain("base64");

    // The listing never carries the payload.
    const listed = chatService.get(chat.id)!.messages[0].attachments as any[];
    expect(listed[0].id).toBe("img");
    expect(listed[0].data).toBeUndefined();
    expect(listed[0].preview).toBeUndefined();

    // Chunked on the side and reassembled byte-for-byte.
    const components = db.query("SELECT component FROM message_attachments WHERE message_id = ? ORDER BY component").all(message.id) as { component: number }[];
    expect(components.length).toBe(2);
    expect(chatService.getAttachment(chat.id, message.id, "img")!.payload.data_url).toBe(data);
    chatService.delete(chat.id);
  });

  test("small text attachments stay inline", () => {
    const chat = chatService.create({ title: "Inline" });
    const message = chatService.addMessage({
      chatId: chat.id,
      role: "user",
      content: "read this",
      attachments: [{ id: "txt", kind: "text", name: "a.txt", mimeType: "text/plain", data: "hello" }],
    })!;
    const listed = chatService.get(chat.id)!.messages[0].attachments as any[];
    expect(listed[0].data_url).toBe("hello");
    expect(chatService.getAttachment(chat.id, message.id, "txt")!.row).toBeNull();
    chatService.delete(chat.id);
  });

  test("editing with summary attachments keeps the stored payload", () => {
    const chat = chatService.create({ title: "Edit" });
    const data = bigImage(2);
    const message = chatService.addMessage({
      chatId: chat.id,
      role: "user",
      content: "original",
      attachments: [{ id: "img", kind: "image", name: "a.png", mimeType: "image/png", data }],
    })!;
    const summary = chatService.get(chat.id)!.messages[0].attachments;
    chatService.updateMessageContent(message.id, { content: "edited", attachments: summary });
    expect(chatService.getAttachment(chat.id, message.id, "img")!.payload.data_url).toBe(data);
    // Dropping the attachment from the edit drops its payload.
    chatService.updateMessageContent(message.id, { content: "edited", attachments: [] });
    expect(chatService.getAttachment(chat.id, message.id, "img")!.row).toBeNull();
    chatService.delete(chat.id);
  });

  test("payload lookup is scoped to the owning chat", () => {
    const owner = chatService.create({ title: "Owner" });
    const other = chatService.create({ title: "Other" });
    const message = chatService.addMessage({
      chatId: owner.id,
      role: "user",
      content: "x",
      attachments: [{ id: "img", kind: "image", data: bigImage(3) }],
    })!;
    expect(chatService.getAttachment(other.id, message.id, "img")).toBeNull();
    chatService.delete(owner.id);
    chatService.delete(other.id);
  });

  test("messages without payloads are not treated as removed attachments", () => {
    const chat = chatService.create({ title: "Payloadless" });
    const data = bigImage(4);
    const message = chatService.addMessage({
      chatId: chat.id,
      role: "user",
      content: "x",
      attachments: [{ id: "img", kind: "image", data }],
    })!;
    chatService.updateMessageContent(message.id, { content: "y", attachments: [{ id: "img", kind: "image", name: "renamed.png" }] });
    expect(chatService.getAttachment(chat.id, message.id, "img")!.payload.data_url).toBe(data);
    chatService.delete(chat.id);
  });

  test("legacy inline payloads are migrated out of the message JSON", () => {
    const db = getDb();
    const chat = chatService.create({ title: "Legacy" });
    const message = chatService.addMessage({ chatId: chat.id, role: "user", content: "old" })!;
    const data = bigImage(5);
    db.query("UPDATE chat_messages SET attachments = ? WHERE id = ?").run(
      JSON.stringify([{ id: "old", name: "old.png", kind: "image", mimeType: "image/png", data, preview: data }]),
      message.id,
    );
    initSchema(db);
    const stored = db.query("SELECT attachments FROM chat_messages WHERE id = ?").get(message.id) as { attachments: string };
    expect(stored.attachments.length).toBeLessThan(1000);
    expect(chatService.getAttachment(chat.id, message.id, "old")!.payload.data_url).toBe(data);
    // Running again is a no-op.
    initSchema(db);
    expect((db.query("SELECT COUNT(*) AS n FROM message_attachments WHERE message_id = ?").get(message.id) as { n: number }).n).toBe(2);
    chatService.delete(chat.id);
  });

  test("summaries never expose a preview that is the full payload", () => {
    const data = bigImage(6);
    const summary = summarizeAttachment({ id: "a", kind: "image", data, preview: data });
    expect(summary.preview).toBeUndefined();
    expect(JSON.stringify(summary)).not.toContain("base64");
  });
});

describe("chat listing helpers", () => {
  test("summaries carry counts and hints carry models", () => {
    const chat = chatService.create({ title: "Counted", model: "Pool/x" });
    chatService.addMessage({ chatId: chat.id, role: "user", content: "a" });
    chatService.addMessage({ chatId: chat.id, role: "assistant", content: "b" });
    const summary = chatService.listSummaries().find((item) => item.id === chat.id)!;
    expect(summary.message_count).toBe(2);
    expect(chatService.listHints().find((hint) => hint.id === chat.id)!.model).toBe("Pool/x");
    // Tail load: only the second message.
    const since = chatService.get(chat.id, { since: 1 })!.messages;
    expect(since.map((message) => message.sequence)).toEqual([1]);
    chatService.delete(chat.id);
  });
});
