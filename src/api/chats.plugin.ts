import { Elysia, t } from "elysia";
import { chatService } from "../services/chat.service";

const chatIdParams = t.Object({ id: t.String({ minLength: 1 }) });

export const chatsPlugin = (app: Elysia) =>
  app
    .get("/api/chats", () => chatService.list())
    .get(
      "/api/chats/search",
      ({ query }) => chatService.search(query.q ?? ""),
      { query: t.Object({ q: t.String({ minLength: 1 }) }) },
    )
    .patch(
      "/api/chats/:id/messages/:messageId",
      ({ params, body, set }) => {
        const updated = chatService.updateMessageContent(params.messageId, {
          content: body.content,
          attachments: body.attachments,
          truncateAfter: body.truncate_after,
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
        }),
      },
    )
    .delete(
      "/api/chats/:id/messages/:messageId",
      ({ params, set }) => {
        if (!chatService.deleteMessage(params.messageId)) {
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
      ({ params, set }) => {
        const chat = chatService.get(params.id);
        if (!chat) {
          set.status = 404;
          return { error: "Chat not found" };
        }
        return chat;
      },
      { params: chatIdParams },
    )
    .patch(
      "/api/chats/:id",
      ({ params, body, set }) => {
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
