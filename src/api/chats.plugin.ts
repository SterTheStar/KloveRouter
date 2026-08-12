import { Elysia, t } from "elysia";
import { chatService } from "../services/chat.service";

const chatIdParams = t.Object({ id: t.String({ minLength: 1 }) });

export const chatsPlugin = (app: Elysia) =>
  app
    .get("/api/chats", () => chatService.list())
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
