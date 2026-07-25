import { Elysia, t } from "elysia";
import { keyService } from "../services/key.service";
import { providerService } from "../services/provider.service";
import { modelService } from "../services/model.service";
import { usageService } from "../services/usage.service";
import { createOpenAIClient, parseModelName } from "../clients/openai";

async function verifyApiKey(headers: Record<string, string | undefined>) {
  const auth = headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return null;
  }
  const key = auth.slice(7);
  return keyService.verify(key);
}

export const proxyPlugin = (app: Elysia) =>
  app
    .get("/v1/models", async ({ set, headers }) => {
      const apiKey = await verifyApiKey(headers);
      if (!apiKey) {
        set.status = 401;
        return { error: "Unauthorized", message: "Valid API key required" };
      }

      const models = modelService.findAllActive();
      const providers = providerService.findAll();

      return {
        object: "list",
        data: models.map((m) => {
          const provider = providers.find((p) => p.id === m.provider_id);
          return {
            id: provider ? `${provider.name}/${m.model_id}` : m.model_id,
            object: "model",
            created: Math.floor(new Date(m.created_at).getTime() / 1000),
            owned_by: provider?.name ?? "unknown",
          };
        }),
      };
    })
    .post(
      "/v1/chat/completions",
      async ({ body, set, headers, request }) => {
        const apiKey = await verifyApiKey(headers);
        if (!apiKey) {
          set.status = 401;
          return { error: "Unauthorized", message: "Valid API key required" };
        }

        // Parse providername/modelname
        const parsed = parseModelName(body.model);
        if (!parsed) {
          set.status = 400;
          return {
            error: "Invalid model format",
            message:
              'Model must be in format "providername/modelname" (e.g. "openai/gpt-4")',
          };
        }

        // Find provider
        const provider = providerService.findByName(parsed.providerName);
        if (!provider || !provider.is_active) {
          set.status = 404;
          return {
            error: "Provider not found or inactive",
            message: `No active provider named "${parsed.providerName}"`,
          };
        }

        // Create OpenAI client
        const client = createOpenAIClient(provider);

        // Build request payload for the provider
        const payload: any = {
          model: parsed.modelId,
          messages: body.messages,
          stream: body.stream ?? false,
        };

        if (body.temperature !== undefined) payload.temperature = body.temperature;
        if (body.max_tokens !== undefined) payload.max_tokens = body.max_tokens;
        if (body.top_p !== undefined) payload.top_p = body.top_p;
        if (body.frequency_penalty !== undefined)
          payload.frequency_penalty = body.frequency_penalty;
        if (body.presence_penalty !== undefined)
          payload.presence_penalty = body.presence_penalty;
        if (body.stop !== undefined) payload.stop = body.stop;

        // Handle streaming
        if (body.stream) {
          try {
            const stream = await client.chat.completions.create({
              ...payload,
              stream: true,
            });

            return new Response(
              new ReadableStream({
                async start(controller) {
                  try {
                    for await (const chunk of stream) {
                      const data = `data: ${JSON.stringify(chunk)}\n\n`;
                      controller.enqueue(new TextEncoder().encode(data));
                    }
                    controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                  } catch (err: any) {
                    const errorData = `data: ${JSON.stringify({
                      error: { message: err.message },
                    })}\n\n`;
                    controller.enqueue(new TextEncoder().encode(errorData));
                  } finally {
                    controller.close();
                  }
                },
              }),
              {
                headers: {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  Connection: "keep-alive",
                },
              }
            );
          } catch (error: any) {
            set.status = 502;
            return {
              error: "Provider request failed",
              message: error.message,
            };
          }
        }

        // Non-streaming
        try {
          const start = performance.now();
          const completion = await client.chat.completions.create(payload);
          const durationMs = Math.round(performance.now() - start);

          // Record token usage
          if (completion.usage) {
            const modelRecord = modelService.findByProviderAndModel(provider.id, parsed.modelId);
            usageService.record(
              provider.id,
              modelRecord?.id ?? parsed.modelId,
              parsed.modelId,
              completion.usage.prompt_tokens ?? 0,
              completion.usage.completion_tokens ?? 0,
              durationMs
            );
          }

          return completion;
        } catch (error: any) {
          set.status = 502;
          return {
            error: "Provider request failed",
            message: error.message,
          };
        }
      },
      {
        body: t.Object({
          model: t.String(),
          messages: t.Array(
            t.Object({
              role: t.String(),
              content: t.Any(),
            })
          ),
          stream: t.Optional(t.Boolean()),
          temperature: t.Optional(t.Number()),
          max_tokens: t.Optional(t.Number()),
          top_p: t.Optional(t.Number()),
          frequency_penalty: t.Optional(t.Number()),
          presence_penalty: t.Optional(t.Number()),
          stop: t.Optional(
            t.Union([t.String(), t.Array(t.String())])
          ),
        }),
      }
    );
