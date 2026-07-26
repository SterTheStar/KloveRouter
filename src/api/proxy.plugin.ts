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
import { requestLogService } from "../services/request-log.service";
import { openAIStreamResponse } from "./openai-stream";

function anthropicPayload(body: any, modelId: string, stream = false) {
  const messages = splitAnthropicMessages(body.messages);
  const effort = body.reasoning?.effort ?? body.reasoning_effort;
  const maxTokens = body.max_tokens ?? body.max_completion_tokens ?? (effort && effort !== "none" ? 8192 : 1024);
  const budgets: Record<string, number> = { minimal: 1024, low: 2048, medium: 4096, high: 6144, xhigh: 8192, max: 8192 };
  const budget = effort && effort !== "none" && maxTokens > 1024 ? Math.min(budgets[effort] ?? 4096, maxTokens - 1) : undefined;
  return {
    model: modelId,
    messages: messages.messages,
    ...(messages.system ? { system: messages.system } : {}),
    max_tokens: maxTokens,
    ...(body.thinking ? { thinking: body.thinking } : budget ? { thinking: { type: "enabled", budget_tokens: budget } } : {}),
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
  "response_format", "seed", "service_tier", "reasoning", "reasoning_effort", "metadata", "store", "web_search_options",
  "stream_options", "logprobs", "top_logprobs", "functions", "function_call", "prompt_cache_key",
] as const;

function buildChatPayload(body: any, model: string, stream: boolean) {
  const payload: Record<string, unknown> = { model, messages: body.messages, stream };
  for (const field of forwardedChatFields) {
    if (body[field] !== undefined) payload[field] = body[field];
  }
  return payload;
}

function isQuotaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /429|quota|resource_exhausted|too many requests|rate.?limit/i.test(message);
}

function isModelNotFoundError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /"code"\s*:\s*404|\bNOT_FOUND\b|requested entity was not found/i.test(message);
}

function tokenDetails(usage: any) {
  return {
    cacheRead: Number(usage?.prompt_tokens_details?.cached_tokens ?? usage?.input_tokens_details?.cached_tokens ?? usage?.cache_read_input_tokens ?? usage?.cache_read_tokens ?? usage?.cachedContentTokenCount ?? usage?.cached_content_token_count ?? usage?.cached_tokens ?? 0),
    cacheWrite: Number(usage?.cache_creation_input_tokens ?? usage?.cache_creation_input_tokens_details?.cached_tokens ?? usage?.cache_write_tokens ?? usage?.cache_write_input_tokens ?? 0),
  };
}

function clientIp(request: Request, headers: Record<string, string | undefined>, server?: { requestIP?: (request: Request) => { address?: string } | null }) {
  const forwarded = headers["x-forwarded-for"]?.split(",")[0]?.trim();
  const direct = server?.requestIP?.(request)?.address;
  return forwarded || headers["x-real-ip"] || request.headers.get("cf-connecting-ip") || direct || "unknown";
}

function streamingHeaders(headers?: HeadersInit) {
  const result = new Headers(headers);
  result.set("Content-Type", "text/event-stream; charset=utf-8");
  result.set("Cache-Control", "no-cache, no-transform");
  result.set("Connection", "keep-alive");
  result.set("X-Accel-Buffering", "no");
  return result;
}

function anthropicStreamResponse(
  response: Response,
  onUsage: (promptTokens: number, completionTokens: number, durationMs: number, generationDurationMs?: number, details?: { cacheRead: number; cacheWrite: number }) => void,
  start: number,
  model: string
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Anthropic returned an empty stream");
  const decoder = new TextDecoder();
  let buffer = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
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
              ({ cacheRead, cacheWrite } = tokenDetails(data.message?.usage));
            } else if (data.type === "content_block_delta" && data.delta?.type === "thinking_delta") {
              firstTokenAt ??= performance.now();
              emit({ id: data.index ?? `chatcmpl-${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index, delta: { reasoning_content: data.delta.thinking ?? "" }, finish_reason: null }] });
            } else if (data.type === "content_block_delta" && data.delta?.text) {
              firstTokenAt ??= performance.now();
              emit({ id: data.index ?? `chatcmpl-${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index, delta: { content: data.delta.text }, finish_reason: null }] });
            } else if (data.type === "content_block_start" && data.content_block?.type === "tool_use") {
              emit({ id: `chatcmpl-${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index, delta: { tool_calls: [{ index: data.index ?? 0, id: data.content_block.id, type: "function", function: { name: data.content_block.name, arguments: "" } }] }, finish_reason: null }] });
            } else if (data.type === "content_block_delta" && data.delta?.type === "input_json_delta") {
              emit({ id: `chatcmpl-${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index, delta: { tool_calls: [{ index: data.index ?? 0, type: "function", function: { arguments: data.delta.partial_json ?? "" } }] }, finish_reason: null }] });
            } else if (data.type === "message_delta") {
              completionTokens = data.usage?.output_tokens ?? completionTokens;
              ({ cacheRead, cacheWrite } = tokenDetails({ ...data.usage, ...data.message?.usage }));
              emit({ id: `chatcmpl-${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index, delta: {}, finish_reason: data.delta?.stop_reason ?? "stop" }], usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens } });
            }
          }
          if (done) break;
        }
          onUsage(promptTokens, completionTokens, Math.round(performance.now() - start), Math.round(performance.now() - (firstTokenAt ?? start)), { cacheRead, cacheWrite });
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      } catch (error: any) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ error: { message: error.message } })}\n\n`));
      } finally {
        controller.close();
      }
    },
  }), { headers: streamingHeaders() });
}

function recordSseUsageResponse(
  response: Response,
  onUsage: (promptTokens: number, completionTokens: number, durationMs: number, generationDurationMs?: number, details?: { cacheRead: number; cacheWrite: number }) => void,
  start: number,
) {
  const reader = response.body?.getReader();
  if (!reader) return response;
  const decoder = new TextDecoder();
  let buffer = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let recorded = false;
  let firstTokenAt: number | null = null;
  const record = () => {
    if (recorded) return;
    recorded = true;
    onUsage(promptTokens, completionTokens, Math.round(performance.now() - start), Math.round(performance.now() - (firstTokenAt ?? start)), { cacheRead, cacheWrite });
  };

  return new Response(new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(": connected\n\n"));
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
                  ({ cacheRead, cacheWrite } = tokenDetails(usage));
                }
              } catch { /* Ignore non-JSON SSE events. */ }
            }
          }
          if (done) break;
        }
        record();
      } catch (error: any) {
        record();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { message: error?.message ?? "Upstream stream disconnected" } })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
      }
    },
  }), { headers: streamingHeaders(response.headers) });
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
      async ({ body, set, headers, request, server }) => {
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

         const requestLogId = requestLogService.start({ providerId: provider.id, providerName: provider.name, modelName: parsed.modelId, clientIp: clientIp(request, headers, server as any), requesterName: apiKey.name });

        const requestSequence = provider.credential_mode === "round_robin" ? credentialService.beginRequest(provider.id) : undefined;
        let credential = credentialService.select(provider.id, provider.credential_mode, provider.fixed_credential_id, requestSequence) || credentialService.select(provider.id, "round_robin", null, requestSequence);
         if (!credential) {
           requestLogService.complete(requestLogId, { status: "error", statusCode: 503, error: "No active provider credential" });
           set.status = 503;
          return { error: "No active provider credential", message: `Provider "${provider.name}" has no active credential` };
         }
         requestLogService.setCredential(requestLogId, credential);
        logger.debug("Credential selected", { provider: provider.name, mode: provider.credential_mode, credential_id: credential.id, kind: credential.kind });

        // Build request payload for the provider
        const payload: any = buildChatPayload(body, parsed.modelId, body.stream ?? false);

        if (provider.protocol === "anthropic") {
          const attempted = new Set<string>(); const failures: string[] = [];
          while (credential && !attempted.has(credential.id)) {
            attempted.add(credential.id);
            try {
              const start = performance.now(); const modelRecord = modelService.findByProviderAndModel(provider.id, parsed.modelId); const credentialProvider = { ...provider, api_key: credential.secret ?? "" };
              if (body.stream) return anthropicStreamResponse(await createAnthropicStream(credentialProvider, anthropicPayload(body, parsed.modelId), credential.secret ?? undefined), (promptTokens, completionTokens, durationMs, _generationDurationMs, details) => { const usage = usageService.record(provider.id, modelRecord?.id ?? parsed.modelId, parsed.modelId, promptTokens, completionTokens, durationMs, durationMs, details); requestLogService.complete(requestLogId, { promptTokens, completionTokens, cacheRead: details?.cacheRead, cacheWrite: details?.cacheWrite, cost: usage.estimated_cost_usd, durationMs }); }, start, parsed.modelId);
              const completion = await createAnthropicMessage(credentialProvider, anthropicPayload(body, parsed.modelId), credential.secret ?? undefined);
              const details = tokenDetails(completion.usage); const durationMs = Math.round(performance.now() - start); const usage = usageService.record(provider.id, modelRecord?.id ?? parsed.modelId, parsed.modelId, completion.usage?.input_tokens ?? 0, completion.usage?.output_tokens ?? 0, durationMs, undefined, details); requestLogService.complete(requestLogId, { promptTokens: completion.usage?.input_tokens, completionTokens: completion.usage?.output_tokens, cacheRead: details.cacheRead, cacheWrite: details.cacheWrite, cost: usage.estimated_cost_usd, durationMs }); credentialService.clearError(credential.id); credentialService.clearCooldown(credential.id); return toOpenAICompletion(completion);
            } catch (error: any) {
              failures.push(error.message); credentialService.markError(credential.id, error.message);
              if (provider.credential_mode !== "round_robin") break;
              credentialService.markCooldown(credential.id, 10, error.message, requestSequence); const next = credentialService.select(provider.id, "round_robin", null, requestSequence); if (!next || attempted.has(next.id)) break; credential = next; requestLogService.setCredential(requestLogId, credential);
            }
          }
          const statusCode = failures.every(isQuotaError) ? 429 : 502; requestLogService.complete(requestLogId, { status: "error", statusCode, error: failures.at(-1) }); set.status = statusCode; return { error: "Provider request failed", message: `All ${attempted.size} available credentials failed. ${failures.at(-1)}` };
        }

        if (provider.protocol === "codex") {
          const attempted = new Set<string>(); const failures: string[] = [];
          while (credential && !attempted.has(credential.id)) {
            attempted.add(credential.id);
            try {
              const start = performance.now(); const response = codexStreamToOpenAI(await codexResponses(body, parsed.modelId, credential), parsed.modelId); const modelRecord = modelService.findByProviderAndModel(provider.id, parsed.modelId); credentialService.clearError(credential.id); credentialService.clearCooldown(credential.id);
              return recordSseUsageResponse(response, (promptTokens, completionTokens, durationMs, generationDurationMs, details) => { const usage = usageService.record(provider.id, modelRecord?.id ?? parsed.modelId, parsed.modelId, promptTokens, completionTokens, durationMs, generationDurationMs, details); requestLogService.complete(requestLogId, { promptTokens, completionTokens, cacheRead: details?.cacheRead, cacheWrite: details?.cacheWrite, cost: usage.estimated_cost_usd, durationMs }); }, start);
            } catch (error: any) {
              failures.push(error.message); credentialService.markError(credential.id, error.message);
              if (provider.credential_mode !== "round_robin") break;
              credentialService.markCooldown(credential.id, 10, error.message, requestSequence); const next = credentialService.select(provider.id, "round_robin", null, requestSequence); if (!next || attempted.has(next.id)) break; credential = next; requestLogService.setCredential(requestLogId, credential);
            }
          }
          const statusCode = failures.every(isQuotaError) ? 429 : 502; requestLogService.complete(requestLogId, { status: "error", statusCode, error: failures.at(-1) }); set.status = statusCode; return { error: "Codex request failed", message: `All ${attempted.size} available credentials failed. ${failures.at(-1)}` };
        }

        if (provider.protocol === "antigravity") {
          const attempted = new Set<string>();
          const failures: string[] = [];
          while (credential && !attempted.has(credential.id)) {
            attempted.add(credential.id);
            try {
              const start = performance.now();
              const response = await antigravityResponses(body, parsed.modelId, credential);
              credentialService.clearError(credential.id);
              credentialService.clearCooldown(credential.id);
              const modelRecord = modelService.findByProviderAndModel(provider.id, parsed.modelId);
              return recordSseUsageResponse(response, (promptTokens, completionTokens, durationMs, generationDurationMs, details) => {
                 const usage = usageService.record(provider.id, modelRecord?.id ?? parsed.modelId, parsed.modelId, promptTokens, completionTokens, durationMs, generationDurationMs, details); requestLogService.complete(requestLogId, { promptTokens, completionTokens, cacheRead: details?.cacheRead, cacheWrite: details?.cacheWrite, cost: usage.estimated_cost_usd, durationMs });
              }, start);
            } catch (error: any) {
              if (isModelNotFoundError(error)) {
                failures.push(error.message);
                if (provider.credential_mode !== "round_robin") break;
                const next = credentialService.select(provider.id, "round_robin", null, requestSequence);
                if (!next || attempted.has(next.id)) break;
                credential = next;
                requestLogService.setCredential(requestLogId, credential);
                continue;
              }
              credentialService.markError(credential.id, error.message);
              failures.push(error.message);
              if (provider.credential_mode !== "round_robin") {
                const statusCode = isQuotaError(error) ? 429 : 502; requestLogService.complete(requestLogId, { status: "error", statusCode, error: error.message }); set.status = statusCode;
                return { error: "Antigravity request failed", message: error.message };
              }
              credentialService.markCooldown(credential.id, 10, error.message, requestSequence);
              const next = credentialService.select(provider.id, "round_robin", null, requestSequence);
              if (!next || attempted.has(next.id)) {
                break;
              }
              logger.info("Retrying Antigravity request with next credential", { provider: provider.name, failed_credential_id: credential.id, next_credential_id: next.id });
              credential = next;
              requestLogService.setCredential(requestLogId, credential);
            }
          }
          const allQuotaLimited = failures.length > 0 && failures.every((message) => isQuotaError(message));
          const allNotFound = failures.length > 0 && failures.every((message) => isModelNotFoundError(message));
          const statusCode = allNotFound ? 404 : allQuotaLimited ? 429 : failures.length ? 502 : 503; requestLogService.complete(requestLogId, { status: "error", statusCode, error: failures.at(-1) }); set.status = statusCode;
          return {
            error: allNotFound ? "Antigravity model not found" : allQuotaLimited ? "Antigravity quota exhausted" : "Antigravity request failed",
            message: failures.length
              ? allNotFound ? `Model "${parsed.modelId}" was not found for the available Antigravity accounts.` : `All ${attempted.size} available Antigravity credential${attempted.size === 1 ? "" : "s"} failed. ${failures.at(-1)}`
              : "No credential is currently available for this request.",
          };
        }

        // Handle streaming
        if (body.stream) {
          const attempted = new Set<string>(); const failures: string[] = [];
          while (credential && !attempted.has(credential.id)) try {
            attempted.add(credential.id);
            const credentialId = credential.id;
            const start = performance.now();
            const modelRecord = modelService.findByProviderAndModel(provider.id, parsed.modelId);
            const client = createOpenAIClient({ ...provider, api_key: credential.secret ?? "" });
            const stream = await client!.chat.completions.create({
              ...payload,
              stream: true,
              stream_options: { include_usage: true },
            }) as any;

             return openAIStreamResponse(stream, {
               start,
               tokenDetails,
               onComplete: ({ promptTokens, completionTokens, cacheRead, cacheWrite, durationMs, generationDurationMs }) => {
                 const usage = usageService.record(provider.id, modelRecord?.id ?? parsed.modelId, parsed.modelId, promptTokens, completionTokens, durationMs, generationDurationMs, { cacheRead, cacheWrite });
                 requestLogService.complete(requestLogId, { promptTokens, completionTokens, cacheRead, cacheWrite, cost: usage.estimated_cost_usd, durationMs });
                 credentialService.clearError(credentialId);
                 credentialService.clearCooldown(credentialId);
               },
               onError: (error, stats) => {
                 credentialService.markError(credentialId, error.message);
                 requestLogService.complete(requestLogId, { status: "error", statusCode: 502, promptTokens: stats.promptTokens, completionTokens: stats.completionTokens, cacheRead: stats.cacheRead, cacheWrite: stats.cacheWrite, durationMs: stats.durationMs, error: error.message });
               },
               onCancel: (stats) => {
                 requestLogService.complete(requestLogId, { status: "error", statusCode: 499, promptTokens: stats.promptTokens, completionTokens: stats.completionTokens, cacheRead: stats.cacheRead, cacheWrite: stats.cacheWrite, durationMs: stats.durationMs, error: "Client disconnected" });
               },
             });
           } catch (error: any) {
             failures.push(error.message); credentialService.markError(credential.id, error.message);
             if (provider.credential_mode !== "round_robin") break;
             credentialService.markCooldown(credential.id, 10, error.message, requestSequence); const next = credentialService.select(provider.id, "round_robin", null, requestSequence); if (!next || attempted.has(next.id)) break; credential = next; requestLogService.setCredential(requestLogId, credential);
           }
           const statusCode = failures.every(isQuotaError) ? 429 : 502; requestLogService.complete(requestLogId, { status: "error", statusCode, error: failures.at(-1) }); set.status = statusCode; return { error: "Provider request failed", message: `All ${attempted.size} available credentials failed. ${failures.at(-1)}` };
        }

        // Non-streaming
        { const attempted = new Set<string>(); const failures: string[] = []; while (credential && !attempted.has(credential.id)) try {
          attempted.add(credential.id);
          const start = performance.now();
          const completion = await createOpenAIClient({ ...provider, api_key: credential.secret ?? "" }).chat.completions.create(payload);
          const durationMs = Math.round(performance.now() - start);

          // Record token usage
          const modelRecord = modelService.findByProviderAndModel(provider.id, parsed.modelId);
           const usage = usageService.record(
            provider.id,
            modelRecord?.id ?? parsed.modelId,
            parsed.modelId,
            completion.usage?.prompt_tokens ?? 0,
             completion.usage?.completion_tokens ?? 0,
             durationMs,
             durationMs,
             tokenDetails(completion.usage)
           );
           const details = tokenDetails(completion.usage); requestLogService.complete(requestLogId, { promptTokens: completion.usage?.prompt_tokens, completionTokens: completion.usage?.completion_tokens, cacheRead: details.cacheRead, cacheWrite: details.cacheWrite, cost: usage.estimated_cost_usd, durationMs });

            credentialService.clearError(credential.id);
            return completion;
        } catch (error: any) {
          failures.push(error.message); credentialService.markError(credential.id, error.message);
          if (provider.credential_mode !== "round_robin") break;
           credentialService.markCooldown(credential.id, 10, error.message, requestSequence); const next = credentialService.select(provider.id, "round_robin", null, requestSequence); if (!next || attempted.has(next.id)) break; credential = next; requestLogService.setCredential(requestLogId, credential);
        }
         const statusCode = failures.every(isQuotaError) ? 429 : 502; requestLogService.complete(requestLogId, { status: "error", statusCode, error: failures.at(-1) }); set.status = statusCode; return { error: "Provider request failed", message: `All ${attempted.size} available credentials failed. ${failures.at(-1)}` }; }
      },
      {
        // Keep the proxy forward-compatible with new OpenAI fields. The
        // payload is validated at runtime below for the required fields and
        // all optional fields are forwarded without being dropped.
        body: t.Any(),
      }
    );
