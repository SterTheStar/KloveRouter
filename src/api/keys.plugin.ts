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
          warning: "Save this key now. It will not be shown again.",
        };
      },
      {
        body: t.Object({
          name: t.String({ minLength: 1 }),
        }),
      }
    )
    .delete("/api/keys/:id", ({ params: { id }, set }) => {
      const removed = keyService.remove(id);
      if (!removed) {
        set.status = 404;
        return { error: "API key not found" };
      }
      return { success: true };
    });
