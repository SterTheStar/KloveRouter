import { Elysia, t } from "elysia";
import { providerService } from "../services/provider.service";

export const providersPlugin = (app: Elysia) =>
  app
    .get("/api/providers", () => {
      return providerService.findAll();
    })
    .get("/api/providers/:id", ({ params: { id }, set }) => {
      const provider = providerService.findById(id);
      if (!provider) {
        set.status = 404;
        return { error: "Provider not found" };
      }
      const pub = providerService.findPublicById(id)!;
      return {
        ...pub,
        api_key: provider.api_key
          ? provider.api_key.slice(0, 6) + "..." + provider.api_key.slice(-4)
          : null,
      };
    })
    .post(
      "/api/providers",
      ({ body, set }) => {
        const existing = providerService.findByName(body.name);
        if (existing) {
          set.status = 409;
          return { error: "Provider name already exists" };
        }
        return providerService.create(body);
      },
      {
        body: t.Object({
          name: t.String({ minLength: 1 }),
          base_url: t.String({ minLength: 1 }),
          api_key: t.String({ minLength: 1 }),
          avatar: t.Optional(t.String()),
        }),
      }
    )
    .put(
      "/api/providers/:id",
      ({ params: { id }, body, set }) => {
        const existing = providerService.findById(id);
        if (!existing) {
          set.status = 404;
          return { error: "Provider not found" };
        }
        const updated = providerService.update(id, body);
        return updated;
      },
      {
        body: t.Object({
          name: t.Optional(t.String({ minLength: 1 })),
          base_url: t.Optional(t.String({ minLength: 1 })),
          api_key: t.Optional(t.String({ minLength: 1 })),
          avatar: t.Optional(t.Union([t.String(), t.Null()])),
          is_active: t.Optional(t.Numeric()),
        }),
      }
    )
    .delete("/api/providers/:id", ({ params: { id }, set }) => {
      const removed = providerService.remove(id);
      if (!removed) {
        set.status = 404;
        return { error: "Provider not found" };
      }
      return { success: true };
    })
    .post("/api/providers/:id/toggle", ({ params: { id }, set }) => {
      const provider = providerService.toggleActive(id);
      if (!provider) {
        set.status = 404;
        return { error: "Provider not found" };
      }
      return provider;
    });
