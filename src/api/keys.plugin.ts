import { Elysia, t } from "elysia";
import { keyService } from "../services/key.service";

export const keysPlugin = (app: Elysia) =>
  app
    .get("/api/keys", () => {
      return keyService.findAll();
    })
    .post(
      "/api/keys",
      ({ body }) => {
        const result = keyService.create(body.name);
        return {
          ...result.record,
          raw_key: result.key,
          warning: "Store this key securely. You can reveal it later from the API keys page.",
        };
      },
      {
        body: t.Object({
          name: t.String({ minLength: 1 }),
        }),
      }
    )
    .get("/api/keys/:id/secret", ({ params: { id }, set }) => {
      const key = keyService.findById(id);
      if (!key) {
        set.status = 404;
        return { error: "API key not found" };
      }
      const secret = keyService.reveal(id);
      if (!secret) {
        set.status = 410;
        return { error: "This API key cannot be revealed because its secret is unavailable." };
      }
      return { secret };
    })
    .delete("/api/keys/:id", ({ params: { id }, set }) => {
      const removed = keyService.remove(id);
      if (!removed) {
        set.status = 404;
        return { error: "API key not found" };
      }
      return { success: true };
    });
