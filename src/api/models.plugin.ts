import { Elysia, t } from "elysia";
import { modelService } from "../services/model.service";
import { providerService } from "../services/provider.service";
import { createOpenAIClient } from "../clients/openai";

export const modelsPlugin = (app: Elysia) =>
  app
    .get("/api/models", () => {
      return modelService.findAllActiveWithProvider();
    })
    .get("/api/providers/:id/models", ({ params: { id }, set }) => {
      const provider = providerService.findById(id);
      if (!provider) {
        set.status = 404;
        return { error: "Provider not found" };
      }
      return modelService.findByProvider(id);
    })
    .post(
      "/api/providers/:id/models",
      ({ params: { id }, body, set }) => {
        const provider = providerService.findById(id);
        if (!provider) {
          set.status = 404;
          return { error: "Provider not found" };
        }
        const model = modelService.create({
          provider_id: id,
          model_id: body.model_id,
          display_name: body.display_name,
          is_manual: 1,
        });
        return model;
      },
      {
        body: t.Object({
          model_id: t.String({ minLength: 1 }),
          display_name: t.Optional(t.String()),
        }),
      }
    )
    .post("/api/providers/:id/sync", async ({ params: { id }, set }) => {
      const provider = providerService.findById(id);
      if (!provider) {
        set.status = 404;
        return { error: "Provider not found" };
      }

      try {
        const url = provider.base_url.replace(/\/+$/, "") + "/models";
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${provider.api_key}`,
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          set.status = 502;
          return {
            error: "Provider returned an error",
            message: `HTTP ${res.status}: ${text || res.statusText}`,
          };
        }

        const body = await res.json();

        // Handle multiple response formats:
        // OpenAI: { data: [{ id, object, created, owned_by }] }
        // Others: [{ id, ... }] or { models: [{ id, ... }] } or { data: [...] }
        let models: { id: string }[] = [];

        if (Array.isArray(body)) {
          models = body;
        } else if (Array.isArray(body.data)) {
          models = body.data;
        } else if (Array.isArray(body.models)) {
          models = body.models;
        }

        let added = 0;
        for (const model of models) {
          if (model.id) {
            modelService.upsert({
              provider_id: id,
              model_id: model.id,
              display_name: model.id,
              is_manual: 0,
            });
            added++;
          }
        }

        return {
          success: true,
          models_found: added,
          message: `Synced ${added} models from ${provider.name}`,
        };
      } catch (error: any) {
        set.status = 502;
        return {
          error: "Failed to sync models",
          message: error.message || "Unknown error",
        };
      }
    })
    .put("/api/models/:id/toggle", ({ params: { id }, set }) => {
      const model = modelService.toggleActive(id);
      if (!model) {
        set.status = 404;
        return { error: "Model not found" };
      }
      return model;
    })
    .put(
      "/api/models/:id",
      ({ params: { id }, body, set }) => {
        const model = modelService.update(id, body);
        if (!model) {
          set.status = 404;
          return { error: "Model not found" };
        }
        return model;
      },
      {
        body: t.Object({
          model_id: t.Optional(t.String({ minLength: 1 })),
          display_name: t.Optional(t.Union([t.String(), t.Null()])),
        }),
      }
    )
    .delete("/api/models/:id", ({ params: { id }, set }) => {
      const removed = modelService.remove(id);
      if (!removed) {
        set.status = 404;
        return { error: "Model not found" };
      }
      return { success: true };
    })
    .delete("/api/providers/:id/models", ({ params: { id }, set }) => {
      const provider = providerService.findById(id);
      if (!provider) {
        set.status = 404;
        return { error: "Provider not found" };
      }
      const count = modelService.removeByProvider(id);
      return { success: true, removed: count };
    });
