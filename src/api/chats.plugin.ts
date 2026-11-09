import { Elysia, t } from "elysia";
import { chatService } from "../services/chat.service";
import { chatGenerationService } from "../services/chat-generation.service";

async function waitForChatGeneration(chatId: string) {
  await Promise.all(chatGenerationService.activeMessageIds(chatId)
    .map((messageId) => chatGenerationService.waitForIdle(chatId, messageId)));
}

const chatIdParams = t.Object({ id: t.String({ minLength: 1 }) });

/** Routing ids of the models that have a response in flight right now. */
function liveGeneratingModels(): string[] {
  return chatService
    .listHints()
    .filter((chat) => chat.model && chatGenerationService.activeMessageIds(chat.id).length > 0)
    .map((chat) => chat.model);
}

export const chatsPlugin = (app: Elysia) =>
  app
    // `fields=summary` (sidebar) returns counts only and skips message bodies.
    .get(
      "/api/chats",
      ({ query }) => (query.fields === "summary" ? chatService.listSummaries() : chatService.list()),
      { query: t.Object({ fields: t.Optional(t.String()) }) },
    )
    // Compact model hints for every chat: lets the client resolve models for
    // conversations it has not loaded yet, so opening one needs no big fetch.
    .get("/api/chats/hints", () => chatService.listHints())
    // Chats with a response streaming in the background.
    .get("/api/chats/streaming", () => ({ models: liveGeneratingModels() }))
    .get(
      "/api/chats/search",
      ({ query }) => chatService.search(query.q ?? ""),
      { query: t.Object({ q: t.String({ minLength: 1 }) }) },
    )
    .patch(
      "/api/chats/:id/messages/:messageId",
      async ({ params, body, set }) => {
        await waitForChatGeneration(params.id);
        if (!chatService.findMessageInChat(params.id, params.messageId)) {
          set.status = 404;
          return { error: "Message not found" };
        }
        const updated = chatService.updateMessageContent(params.messageId, {
          content: body.content,
          attachments: body.attachments,
          truncateAfter: body.truncate_after,
          reasoning: body.reasoning,
        });
        if (!updated || updated.chat_id !== params.id) {
          set.status = 404;
          return { error: "Message not found" };
        }
        return updated;
      },
      {
        params: t.Object({ id: t.String({ minLength: 1 }), messageId: t.String({ minLength: 1 }) }),
        body: t.Object({
          content: t.Any(),
          attachments: t.Optional(t.Array(t.Any())),
          truncate_after: t.Optional(t.Boolean()),
          reasoning: t.Optional(t.String()),
        }),
      },
    )
    .delete(
      "/api/chats/:id/messages/:messageId",
      async ({ params, set }) => {
        await waitForChatGeneration(params.id);
        if (!chatService.findMessageInChat(params.id, params.messageId) || !chatService.deleteMessage(params.messageId)) {
          set.status = 404;
          return { error: "Message not found" };
        }
        return { success: true };
      },
      {
        params: t.Object({ id: t.String({ minLength: 1 }), messageId: t.String({ minLength: 1 }) }),
      },
    )
    .post(
      "/api/chats",
      ({ body }) => chatService.create(body),
      { body: t.Object({ title: t.Optional(t.String()), model: t.Optional(t.String()) }) },
    )
    .get(
      "/api/chats/:id",
      ({ params, query, set }) => {
        // `since` reloads only the tail (messages that changed during a
        // stream) instead of the whole conversation.
        const since = query.since === undefined ? undefined : Number(query.since);
        const chat = chatService.get(params.id, Number.isFinite(since) ? { since: since as number } : {});
        if (!chat) {
          set.status = 404;
          return { error: "Chat not found" };
        }
        return chat;
      },
      {
        params: chatIdParams,
        query: t.Object({ since: t.Optional(t.String()) }),
      },
    )
    .patch(
      "/api/chats/:id",
      async ({ params, body, set }) => {
        await waitForChatGeneration(params.id);
        const chat = chatService.update(params.id, body);
        if (!chat) {
          set.status = 404;
          return { error: "Chat not found" };
        }
        return chat;
      },
      {
        params: chatIdParams,
        body: t.Object({ title: t.Optional(t.String()), model: t.Optional(t.String()) }),
      },
    )
    .delete("/api/chats", () => ({
      success: true,
      removed: chatService.deleteAll(),
    }))
    .delete(
      "/api/chats/:id",
      ({ params, set }) => {
        if (!chatService.delete(params.id)) {
          set.status = 404;
          return { error: "Chat not found" };
        }
        return { success: true };
      },
      { params: chatIdParams },
    );
