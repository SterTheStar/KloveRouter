import { Elysia, t } from "elysia";
import { keyService } from "../services/key.service";
import { providerPrefix, providerService } from "../services/provider.service";
import { modelService } from "../services/model.service";
import { usageService } from "../services/usage.service";
import { createOpenAIClient, parseModelName } from "../clients/openai";
import { createAnthropicMessage, createAnthropicStream, splitAnthropicMessages, toOpenAICompletion } from "../clients/anthropic";
import { codexResponses, codexStreamToOpenAI } from "../integrations/codex";
import { credentialService } from "../services/credential.service";
import { logger } from "../logger";
import { antigravityResponses } from "../integrations/antigravity";
import { isBlockedAntigravityModel } from "../integrations/antigravity";

function anthropicPayload(body: any, modelId: string, stream = false) {
  const messages = splitAnthropicMessages(body.messages);
  return {
    model: modelId,
    messages: messages.messages,
    ...(messages.system ? { system: messages.system } : {}),
    max_tokens: body.max_tokens ?? 1024,
    ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
    ...(body.top_p !== undefined ? { top_p: body.top_p } : {}),
    ...(body.stop !== undefined ? { stop_sequences: Array.isArray(body.stop) ? body.stop : [body.stop] } : {}),
    ...(body.tools?.length ? { tools: body.tools.map((tool: any) => ({ name: tool.function?.name, description: tool.function?.description, input_schema: tool.function?.parameters ?? { type: "object", properties: {} } })) } : {}),
    ...(body.tool_choice !== undefined ? { tool_choice: body.tool_choice === "auto" || body.tool_choice === "none" ? { type: body.tool_choice } : body.tool_choice === "required" ? { type: "any" } : { type: "tool", name: body.tool_choice?.function?.name } } : {}),
    stream,
  };
}

const forwardedChatFields = [
  "max_tokens", "max_completion_tokens", "temperature", "top_p", "n", "stop", "modalities", "prediction", "audio",
  "presence_penalty", "frequency_penalty", "logit_bias", "user", "tools", "tool_choice", "parallel_tool_calls",
  "response_format", "seed", "service_tier", "reasoning_effort", "metadata", "store", "web_search_options",
  "stream_options", "logprobs", "top_logprobs", "functions", "function_call", "prompt_cache_key",
] as const;

function buildChatPayload(body: any, model: string, stream: boolean) {
  const payload: Record<string, unknown> = { model, messages: body.messages, stream };
  for (const field of forwardedChatFields) {
    if (body[field] !== undefined) payload[field] = body[field];
  }
  return payload;
}

function anthropicStreamResponse(
  response: Response,
  onUsage: (promptTokens: number, completionTokens: number, durationMs: number, generationDurationMs?: number) => void,
  start: number,
  model: string
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Anthropic returned an empty stream");
  const decoder = new TextDecoder();
  let buffer = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let index = 0;
  let firstTokenAt: number | null = null;

  return new Response(new ReadableStream({
    async start(controller) {
      const emit = (chunk: Record<string, unknown>) => {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const event of events) {
            const dataLine = event.split("\n").find((line) => line.startsWith("data:"));
            if (!dataLine) continue;
            const data = JSON.parse(dataLine.slice(5).trim());
            if (data.type === "message_start") {
              promptTokens = data.message?.usage?.input_tokens ?? 0;
            } else if (data.type === "content_block_delta" && data.delta?.text) {
              firstTokenAt ??= performance.now();
              emit({ id: data.index ?? `chatcmpl-${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index, delta: { content: data.delta.text }, finish_reason: null }] });
            } else if (data.type === "content_block_start" && data.content_block?.type === "tool_use") {
              emit({ id: `chatcmpl-${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index, delta: { tool_calls: [{ index: data.index ?? 0, id: data.content_block.id, type: "function", function: { name: data.content_block.name, arguments: "" } }] }, finish_reason: null }] });
            } else if (data.type === "content_block_delta" && data.delta?.type === "input_json_delta") {
              emit({ id: `chatcmpl-${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index, delta: { tool_calls: [{ index: data.index ?? 0, type: "function", function: { arguments: data.delta.partial_json ?? "" } }] }, finish_reason: null }] });
            } else if (data.type === "message_delta") {
              completionTokens = data.usage?.output_tokens ?? completionTokens;
              emit({ id: `chatcmpl-${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index, delta: {}, finish_reason: data.delta?.stop_reason ?? "stop" }], usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens } });
            }
          }
          if (done) break;
        }
         onUsage(promptTokens, completionTokens, Math.round(performance.now() - start), Math.round(performance.now() - (firstTokenAt ?? start)));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      } catch (error: any) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ error: { message: error.message } })}\n\n`));
      } finally {
        controller.close();
      }
    },
  }), { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
}

function recordSseUsageResponse(
  response: Response,
  onUsage: (promptTokens: number, completionTokens: number, durationMs: number, generationDurationMs?: number) => void,
  start: number,
) {
  const reader = response.body?.getReader();
  if (!reader) return response;
  const decoder = new TextDecoder();
  let buffer = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let recorded = false;
  let firstTokenAt: number | null = null;
  const record = () => {
    if (recorded) return;
    recorded = true;
    onUsage(promptTokens, completionTokens, Math.round(performance.now() - start), Math.round(performance.now() - (firstTokenAt ?? start)));
  };

  return new Response(new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (value) {
            const text = decoder.decode(value, { stream: !done });
            controller.enqueue(new TextEncoder().encode(text));
            firstTokenAt ??= performance.now();
            buffer += text;
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";
            for (const event of events) {
              const line = event.split("\n").find((item) => item.startsWith("data:"));
              if (!line) continue;
              const raw = line.slice(5).trim();
              if (raw === "[DONE]") continue;
              try {
                const data = JSON.parse(raw);
                const usage = data.usage ?? data.response?.usage ?? data.response?.response?.usage;
                if (usage) {
                  promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokenCount ?? promptTokens);
                  completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? usage.candidatesTokenCount ?? completionTokens);
                }
              } catch { /* Ignore non-JSON SSE events. */ }
            }
          }
          if (done) break;
        }
        record();
      } catch {
        record();
      } finally {
        controller.close();
      }
    },
  }), { headers: response.headers });
}

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
            id: provider ? `${providerPrefix(provider.name)}/${m.model_id}` : m.model_id,
            object: "model",
            created: Math.floor(new Date(m.created_at).getTime() / 1000),
            owned_by: provider?.name.toLowerCase() ?? "unknown",
          };
        }),
      };
    })
    .post(
      "/v1/chat/completions",
      async ({ body, set, headers, request }) => {
        if (!body || typeof body !== "object" || typeof body.model !== "string" || !Array.isArray(body.messages)) {
          set.status = 400;
          return { error: "Invalid request", message: "model and messages are required" };
        }
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

        if (provider.protocol === "antigravity" && isBlockedAntigravityModel(parsed.modelId)) {
          set.status = 403;
          return { error: "Model blocked", message: `Model "${parsed.modelId}" is not available through Antigravity` };
        }

        const credential = credentialService.select(provider.id, provider.credential_mode, provider.fixed_credential_id) || credentialService.select(provider.id, "round_robin");
        if (!credential) {
          set.status = 503;
          return { error: "No active provider credential", message: `Provider "${provider.name}" has no active credential` };
        }
        const credentialProvider = { ...provider, api_key: credential.secret ?? "" };
        logger.debug("Credential selected", { provider: provider.name, mode: provider.credential_mode, credential_id: credential.id, kind: credential.kind });
        const client = provider.protocol === "anthropic" ? null : createOpenAIClient(credentialProvider);

        // Build request payload for the provider
        const payload: any = buildChatPayload(body, parsed.modelId, body.stream ?? false);

        if (provider.protocol === "anthropic") {
          try {
            const start = performance.now();
            const modelRecord = modelService.findByProviderAndModel(provider.id, parsed.modelId);
            if (body.stream) {
              const response = await createAnthropicStream(credentialProvider, anthropicPayload(body, parsed.modelId), credential.secret ?? undefined);
              return anthropicStreamResponse(
                response,
                (promptTokens, completionTokens, durationMs) => {
                  usageService.record(provider.id, modelRecord?.id ?? parsed.modelId, parsed.modelId, promptTokens, completionTokens, durationMs);
                },
                start,
                parsed.modelId
              );
            }

            const completion = await createAnthropicMessage(credentialProvider, anthropicPayload(body, parsed.modelId), credential.secret ?? undefined);
            usageService.record(
              provider.id,
              modelRecord?.id ?? parsed.modelId,
              parsed.modelId,
              completion.usage?.input_tokens ?? 0,
              completion.usage?.output_tokens ?? 0,
              Math.round(performance.now() - start)
            );
            return toOpenAICompletion(completion);
          } catch (error: any) {
            set.status = 502;
            return { error: "Provider request failed", message: error.message };
          }
        }

        if (provider.protocol === "codex") {
          try {
            const start = performance.now();
            const response = codexStreamToOpenAI(await codexResponses(body, parsed.modelId, credential), parsed.modelId);
            const modelRecord = modelService.findByProviderAndModel(provider.id, parsed.modelId);
            return recordSseUsageResponse(response, (promptTokens, completionTokens, durationMs, generationDurationMs) => {
              usageService.record(provider.id, modelRecord?.id ?? parsed.modelId, parsed.modelId, promptTokens, completionTokens, durationMs, generationDurationMs);
            }, start);
          } catch (error: any) {
            credentialService.markError(credential.id, error.message);
            set.status = error.message.includes("limit") ? 429 : 502;
            return { error: "Codex request failed", message: error.message };
          }
        }

        if (provider.protocol === "antigravity") {
          try {
            const start = performance.now();
            const response = await antigravityResponses(body, parsed.modelId, credential);
            const modelRecord = modelService.findByProviderAndModel(provider.id, parsed.modelId);
            return recordSseUsageResponse(response, (promptTokens, completionTokens, durationMs, generationDurationMs) => {
              usageService.record(provider.id, modelRecord?.id ?? parsed.modelId, parsed.modelId, promptTokens, completionTokens, durationMs, generationDurationMs);
            }, start);
          }
          catch (error: any) { credentialService.markError(credential.id, error.message); set.status = error.message.includes("429") ? 429 : 502; return { error: "Antigravity request failed", message: error.message }; }
        }

        // Handle streaming
        if (body.stream) {
          try {
            const start = performance.now();
            const modelRecord = modelService.findByProviderAndModel(provider.id, parsed.modelId);
            const stream = await client!.chat.completions.create({
              ...payload,
              stream: true,
              stream_options: { include_usage: true },
            }) as any;

            let promptTokens = 0;
            let completionTokens = 0;
            let firstTokenAt: number | null = null;

            return new Response(
              new ReadableStream({
                async start(controller) {
                  try {
                    for await (const chunk of stream) {
                      const usage = chunk.usage;
                      firstTokenAt ??= performance.now();
                      if (usage) {
                        promptTokens = Number(usage.prompt_tokens ?? 0);
                        completionTokens = Number(usage.completion_tokens ?? 0);
                      }
                      const data = `data: ${JSON.stringify(chunk)}\n\n`;
                      controller.enqueue(new TextEncoder().encode(data));
                    }
                    const endedAt = performance.now();
                    usageService.record(provider.id, modelRecord?.id ?? parsed.modelId, parsed.modelId, promptTokens, completionTokens, Math.round(endedAt - start), Math.round(endedAt - (firstTokenAt ?? start)));
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
          const completion = await client!.chat.completions.create(payload);
          const durationMs = Math.round(performance.now() - start);

          // Record token usage
          const modelRecord = modelService.findByProviderAndModel(provider.id, parsed.modelId);
          usageService.record(
            provider.id,
            modelRecord?.id ?? parsed.modelId,
            parsed.modelId,
            completion.usage?.prompt_tokens ?? 0,
            completion.usage?.completion_tokens ?? 0,
            durationMs,
            durationMs
          );

            credentialService.clearError(credential.id);
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
        // Keep the proxy forward-compatible with new OpenAI fields. The
        // payload is validated at runtime below for the required fields and
        // all optional fields are forwarded without being dropped.
        body: t.Any(),
      }
    );
