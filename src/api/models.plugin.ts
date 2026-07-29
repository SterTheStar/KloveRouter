import { Elysia, t } from "elysia";
import {
  DuplicateProviderModelError,
  InvalidModelMetadataError,
  type ModelMetadataInput,
  modelService,
} from "../services/model.service";
import { providerService } from "../services/provider.service";
import { createOpenAIClient } from "../clients/openai";
import {
  createAnthropicMessage,
  toOpenAICompletion,
} from "../clients/anthropic";
import { codexModels, codexTest } from "../integrations/codex";
import { credentialService } from "../services/credential.service";
import {
  antigravityModels,
  antigravityTest,
  isBlockedAntigravityModel,
} from "../integrations/antigravity";
import { logger } from "../logger";
import { generateDisplayName } from "../services/model-name";
import { freebuffModels, freebuffResponses } from "../integrations/freebuff";
import { qwenModels, qwenResponses } from "../integrations/qwen";
import { atomesusModels, atomesusTest } from "../integrations/atomesus";
import { parseRawModelMetadata, resolveModelMetadata } from "../services/model-metadata";
import { assertSafeRemoteUrl } from "../services/ssrf";

const nullableBoolean = t.Union([t.Boolean(), t.Null()]);
const capabilitiesSchema = t.Object({
  reasoning: nullableBoolean,
  tools: nullableBoolean,
  vision: nullableBoolean,
  attachments: nullableBoolean,
  streaming: nullableBoolean,
  non_streaming: nullableBoolean,
});
const reasoningEffortsSchema = t.Array(
  t.Object({
    effort: t.String({ minLength: 1 }),
    display_name: t.String({ minLength: 1 }),
    upstream_value: t.String({ minLength: 1 }),
    sort_order: t.Integer(),
    is_default: t.Boolean(),
  }),
);

export const parseGenericModelMetadata = parseRawModelMetadata;

async function freebuffTest(
  model: string,
  credential: { id: string; secret?: string | null },
  endpoint: string,
) {
  const response = await freebuffResponses(
    {
      model,
      messages: [{ role: "user", content: "Say 'ok' and nothing else." }],
      max_tokens: 10,
      stream: false,
    },
    model,
    credential,
    endpoint,
  );
  if (!response.ok) {
    throw new Error(`Freebuff test failed (${response.status})`);
  }
  return response.json();
}

async function qwenTest(
  model: string,
  credential: { id: string; secret?: string | null },
  endpoint: string,
) {
  const response = await qwenResponses(
    {
      model,
      messages: [{ role: "user", content: "Say 'ok' and nothing else." }],
      max_tokens: 10,
      stream: false,
    },
    model,
    credential,
    endpoint,
  );
  if (!response.ok) {
    throw new Error(`Qwen test failed (${response.status})`);
  }
  return response.json();
}

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
        if (
          provider.protocol === "antigravity" &&
          isBlockedAntigravityModel(body.model_id)
        ) {
          set.status = 400;
          return { error: "This model is blocked for Antigravity" };
        }
        const model = modelService.create({
          provider_id: id,
          model_id: body.model_id,
          display_name: body.display_name || generateDisplayName(body.model_id),
          pricing_tiers: body.pricing_tiers,
          context_window: body.context_window,
          max_output_tokens: body.max_output_tokens,
          capabilities: body.capabilities,
          reasoning_efforts: body.reasoning_efforts,
          is_manual: 1,
        });
        return model;
      },
      {
        body: t.Object({
          model_id: t.String({ minLength: 1 }),
          display_name: t.Optional(t.String()),
          context_window: t.Optional(t.Union([t.Integer({ minimum: 1 }), t.Null()])),
          max_output_tokens: t.Optional(t.Union([t.Integer({ minimum: 1 }), t.Null()])),
          capabilities: t.Optional(capabilitiesSchema),
          reasoning_efforts: t.Optional(reasoningEffortsSchema),
          pricing_tiers: t.Optional(
            t.Array(
              t.Object({
                threshold_tokens: t.Number({ minimum: 0 }),
                input_per_million: t.Number({ minimum: 0 }),
                output_per_million: t.Number({ minimum: 0 }),
                cache_read_per_million: t.Number({ minimum: 0 }),
                cache_write_per_million: t.Number({ minimum: 0 }),
              }),
            ),
          ),
        }),
      },
    )
    .post(
      "/api/providers/:id/sync",
      async ({ params: { id }, query, set }) => {
        const provider = providerService.findById(id);
        if (!provider) {
          set.status = 404;
          return { error: "Provider not found" };
        }

        const freeOnly = query.free_only === true;
        const existingOnly = query.existing_only === true;
        const resetExisting = query.reset_existing === true;
        const existingIds = new Set(
          modelService.findByProvider(id).map((model) => model.model_id),
        );
        const saveSyncedModel = (input: Parameters<typeof modelService.upsert>[0]) =>
          resetExisting
            ? modelService.resetExisting(input)
            : modelService.upsert(input);
        const selectModels = <T extends { id: string }>(available: T[]) => {
          const freeSelected = freeOnly
            ? available.filter((model) => /(?:^|[:-])free(?:$|\b)/i.test(model.id))
            : available;
          return existingOnly
            ? freeSelected.filter((model) => existingIds.has(model.id))
            : freeSelected;
        };
        const preview = (
          available: { id: string; display_name?: string }[],
        ) => {
          const freeModels = available.filter((model) =>
            /(?:^|[:-])free(?:$|\b)/i.test(model.id),
          );
          const selected = freeOnly ? freeModels : available;
          const existingModels = selected.filter((model) =>
            existingIds.has(model.id),
          ).length;
          const freeExisting = freeModels.filter((model) =>
            existingIds.has(model.id),
          ).length;
          return {
            preview: true,
            models_found: selected.length,
            existing_models: existingModels,
            models_to_add: selected.length - existingModels,
            free_models_found: freeModels.length,
            free_existing_models: freeExisting,
            free_models_to_add: freeModels.length - freeExisting,
            free_only: freeOnly,
            existing_only: existingOnly,
          };
        };
        try {
          if (provider.protocol === "codex") {
            const credential =
              credentialService.select(
                provider.id,
                provider.credential_mode,
                provider.fixed_credential_id,
              ) || credentialService.select(provider.id, "round_robin");
            if (!credential) {
              set.status = 503;
              return { error: "No active Codex account" };
            }
            const available = await codexModels(credential);
            if (query.preview === true) return preview(available);
            const selected = selectModels(available);
            for (const model of selected) {
              saveSyncedModel({
                provider_id: id,
                model_id: model.id,
                display_name: model.display_name,
                is_manual: 0,
                ...await resolveModelMetadata(provider.protocol, model.id, model),
              });
            }
            return {
              success: true,
              models_found: selected.length,
              message: `Synced ${selected.length} Codex models from ${provider.name}`,
            };
          }

          if (provider.protocol === "antigravity") {
            const credential =
              credentialService.select(
                provider.id,
                provider.credential_mode,
                provider.fixed_credential_id,
              ) || credentialService.select(provider.id, "round_robin");
            if (!credential) {
              set.status = 503;
              return { error: "No active Antigravity account" };
            }
            const available = await antigravityModels(credential);
            if (query.preview === true) return preview(available);
            const selected = selectModels(available);
            for (const model of selected)
              saveSyncedModel({
                provider_id: id,
                model_id: model.id,
                display_name: model.display_name,
                is_manual: 0,
                ...await resolveModelMetadata(provider.protocol, model.id, model),
              });
            return {
              success: true,
              models_found: selected.length,
              message: `Synced ${selected.length} Antigravity models from ${provider.name}`,
            };
          }

           if (provider.protocol === "freebuff") {
            const available = await freebuffModels();
            if (query.preview === true) return preview(available);
            const selected = selectModels(available);
            for (const model of selected)
              saveSyncedModel({
                provider_id: id,
                model_id: model.id,
                display_name: model.display_name,
                is_manual: 0,
                ...await resolveModelMetadata(provider.protocol, model.id, model),
              });
            return { success: true, models_found: selected.length, message: `Synced ${selected.length} Freebuff models from ${provider.name}` };
          }

          if (provider.protocol === "qwen") {
            const credential =
              credentialService.select(
                provider.id,
                provider.credential_mode,
                provider.fixed_credential_id,
              ) || credentialService.select(provider.id, "round_robin");
            if (!credential) {
              set.status = 503;
              return { error: "No active Qwen credential" };
            }
            const available = await qwenModels(credential, provider.base_url);
            if (query.preview === true) return preview(available);
            const selected = selectModels(available);
            for (const model of selected)
              saveSyncedModel({
                provider_id: id,
                model_id: model.id,
                display_name: model.display_name,
                is_manual: 0,
                is_active: 1,
                ...await resolveModelMetadata(provider.protocol, model.id, model),
              });
            return { success: true, models_found: selected.length, message: `Synced ${selected.length} Qwen models from ${provider.name}` };
          }

          if (provider.protocol === "atomesus") {
            const available = atomesusModels();
            if (query.preview === true) return preview(available);
            const selected = selectModels(available);
            for (const model of selected)
              saveSyncedModel({
                provider_id: id,
                model_id: model.id,
                display_name: model.display_name,
                is_manual: 0,
                ...await resolveModelMetadata(provider.protocol, model.id, model),
              });
            return { success: true, models_found: selected.length, message: `Synced ${selected.length} Atomesus models from ${provider.name}` };
          }

          const credential =
            credentialService.select(
              provider.id,
              provider.credential_mode,
              provider.fixed_credential_id,
            ) || credentialService.select(provider.id, "round_robin");
          if (!credential?.secret) {
            set.status = 503;
            return {
              error: "No active API key configured",
              message: `Provider "${provider.name}" has no active API key`,
            };
          }
          const url =
            provider.protocol === "anthropic"
              ? provider.base_url.replace(/\/+$/, "") + "/models"
              : provider.base_url.replace(/\/+$/, "") + "/models";
          await assertSafeRemoteUrl(url);
          const res = await fetch(url, {
            headers: {
              "Content-Type": "application/json",
              ...(provider.protocol === "anthropic"
                ? {
                    "x-api-key": credential.secret,
                    "anthropic-version": "2023-06-01",
                  }
                : { Authorization: `Bearer ${credential.secret}` }),
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
          let models: { id: string; display_name?: string }[] = [];

          if (Array.isArray(body)) {
            models = body;
          } else if (Array.isArray(body.data)) {
            models = body.data;
          } else if (Array.isArray(body.models)) {
            models = body.models;
          }

          if (query.preview === true) return preview(models);
          models = selectModels(models);

          let added = 0;
          for (const model of models) {
            if (model.id) {
              saveSyncedModel({
                provider_id: id,
                model_id: model.id,
                display_name:
                  model.display_name || generateDisplayName(model.id),
                is_manual: 0,
                ...await resolveModelMetadata(provider.protocol, model.id, model),
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
          logger.error("Model sync failed", {
            provider: provider.name,
            protocol: provider.protocol,
            error: error.message,
          });
          set.status = 502;
          return {
            error: "Failed to sync models",
            message: error.message || "Unknown error",
          };
        }
      },
      {
        query: t.Object({
          preview: t.Optional(t.Boolean()),
          free_only: t.Optional(t.Boolean()),
          existing_only: t.Optional(t.Boolean()),
          reset_existing: t.Optional(t.Boolean()),
        }),
      },
    )
    .post("/api/models/:id/test", async ({ params: { id }, set }) => {
      const model = modelService.findById(id);
      if (!model) {
        set.status = 404;
        return { error: "Model not found" };
      }
      const provider = providerService.findById(model.provider_id);
      if (!provider || !provider.is_active) {
        set.status = 400;
        return { error: "Provider not found or inactive" };
      }

      let credential: ReturnType<typeof credentialService.select> = null;
      try {
        const start = performance.now();
        credential =
          credentialService.select(
            provider.id,
            provider.credential_mode,
            provider.fixed_credential_id,
          ) || credentialService.select(provider.id, "round_robin");
        if (!credential) {
          set.status = 503;
          return { success: false, error: "No active provider credential" };
        }
        const credentialProvider = {
          ...provider,
          api_key: credential.secret ?? "",
        };
        if (
          provider.protocol === "antigravity" &&
          isBlockedAntigravityModel(model.model_id)
        ) {
          set.status = 400;
          return {
            success: false,
            error: "This model is blocked for Antigravity",
          };
        }
        const completion =
          provider.protocol === "codex"
            ? {
                choices: [
                  {
                    message: {
                      content: await codexTest(model.model_id, credential),
                    },
                  },
                ],
                usage: null,
              }
            : provider.protocol === "antigravity"
              ? {
                  choices: [
                    {
                      message: {
                        content: await antigravityTest(
                          model.model_id,
                          credential,
                        ),
                      },
                    },
                  ],
                  usage: null,
                }
              : provider.protocol === "anthropic"
                ? toOpenAICompletion(
                    await createAnthropicMessage(
                      credentialProvider,
                      {
                        model: model.model_id,
                        max_tokens: 10,
                        messages: [
                          {
                            role: "user",
                            content: "Say 'ok' and nothing else.",
                          },
                        ],
                      },
                      credential.secret ?? undefined,
                    ),
                  )
                : provider.protocol === "freebuff"
                   ? await freebuffTest(model.model_id, credential, provider.base_url)
                 : provider.protocol === "qwen"
                   ? await qwenTest(model.model_id, credential, provider.base_url)
                   : provider.protocol === "atomesus"
                     ? await atomesusTest(model.model_id, credential, provider.base_url)
                   : await createOpenAIClient(
                    credentialProvider,
                  ).chat.completions.create({
                    model: model.model_id,
                    messages: [
                      { role: "user", content: "Say 'ok' and nothing else." },
                    ],
                    max_tokens: 10,
                  });
        const durationMs = Math.round(performance.now() - start);
        const reply =
          typeof completion.choices?.[0]?.message?.content === "string"
            ? completion.choices[0].message.content.trim()
            : "";

        return {
          success: true,
          duration_ms: durationMs,
          reply,
          usage: completion.usage ?? null,
        };
      } catch (error: any) {
        if (credential)
          credentialService.markError(
            credential.id,
            error.message || "Test failed",
          );
        set.status = 502;
        return {
          success: false,
          error: error.message || "Test failed",
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
        try {
          const model = modelService.update(id, body);
          if (!model) {
            set.status = 404;
            return { error: "Model not found" };
          }
          return model;
        } catch (error) {
          if (error instanceof DuplicateProviderModelError) {
            set.status = 409;
            return {
              error: "Duplicate model",
              message: error.message,
              model_id: error.modelId,
            };
          }
          if (error instanceof InvalidModelMetadataError) {
            set.status = 400;
            return { error: "Invalid model metadata", message: error.message };
          }
          throw error;
        }
      },
      {
        body: t.Object({
          model_id: t.Optional(t.String({ minLength: 1 })),
          display_name: t.Optional(t.Union([t.String(), t.Null()])),
          context_window: t.Optional(t.Union([t.Integer({ minimum: 1 }), t.Null()])),
          max_output_tokens: t.Optional(t.Union([t.Integer({ minimum: 1 }), t.Null()])),
          capabilities: t.Optional(capabilitiesSchema),
          reasoning_efforts: t.Optional(reasoningEffortsSchema),
          pricing_tiers: t.Optional(
            t.Array(
              t.Object({
                threshold_tokens: t.Number({ minimum: 0 }),
                input_per_million: t.Number({ minimum: 0 }),
                output_per_million: t.Number({ minimum: 0 }),
                cache_read_per_million: t.Number({ minimum: 0 }),
                cache_write_per_million: t.Number({ minimum: 0 }),
              }),
            ),
          ),
        }),
      },
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
