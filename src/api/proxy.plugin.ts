import { Elysia, t } from "elysia";
import { keyService } from "../services/key.service";
import { providerService } from "../services/provider.service";
import { modelService, providerModelPublicId } from "../services/model.service";
import { usageService } from "../services/usage.service";
import { createOpenAIClient, openAIEndpoint, parseModelName } from "../clients/openai";
import {
  AnthropicRequestError,
  createAnthropicMessage,
  createAnthropicStream,
  toOpenAICompletion,
} from "../clients/anthropic";
import { codexResponses, codexStreamToOpenAI } from "../integrations/codex";
import { credentialService } from "../services/credential.service";
import { logger } from "../logger";
import { antigravityResponses } from "../integrations/antigravity";
import { isBlockedAntigravityModel } from "../integrations/antigravity";
import { requestLogService } from "../services/request-log.service";
import { modelPoolService, poolSlugFromModelId, poolTokenLimitError, routeModelPool, validatePoolMemberCompatibility } from "../services/model-pool.service";
import { openAIStreamResponse } from "./openai-stream";
import { openAICompletionFromSse } from "./openai-completion";
import { freebuffResponses } from "../integrations/freebuff";
import { cleanQwenStream, extractQwenContent, qwenResponses } from "../integrations/qwen";
import { atomesusResponses } from "../integrations/atomesus";
import { conolContent, conolModelMetadataFromId, conolResponses } from "../integrations/conol";
import {
  chatgptResponses,
  chatgptStreamToOpenAI,
  conversationFingerprint,
  conversationIdCache,
  normalizeChatGptAuth,
} from "../integrations/chatgpt";
import { injectCavemanPrompt } from "../plugins/caveman";
import { customSkillsProxy } from "../plugins/custom-skills";
import { rtkManager } from "../plugins/rtk";
import { filterLastToolMessage } from "../plugins/rtk/rtk.messages";
import {
  applyResolvedReasoning,
  ReasoningRequestError,
} from "../services/reasoning";
import {
  ModelRequestError,
  validateModelRequest,
} from "../services/request-validation";
import { MultimodalRequestError } from "../services/multimodal";
import { countMessages, countCompletion } from "../services/token-counter/token-counter";
import { config } from "../config";
import { assertSafeRemoteUrl } from "../services/ssrf";
import { isOpenAICompatibleProtocol } from "../services/provider-appearance";
import { opencodeSessionId, upstreamProviderHeaders } from "../services/provider-headers";
import { validateChatCompletionRequest } from "./openai-request";
import { normalizeToolDefinitions, normalizeToolName } from "./tool-names";
import {
  chatCompletionToAnthropic,
  chatCompletionToResponse as convertChatCompletionToResponse,
  convertResponse,
  requestFromChat,
  requestToChat,
  convertStream,
  responsesSseToChat,
  rewriteResponsesStreamModel,
} from "../sdk/protocol-converter";
import {
  fixMissingThinkOpeningTag,
  fixThinkTagAsyncIterable,
  fixThinkTagSseResponse,
} from "./think-tag-fix";

function anthropicPayload(body: any, modelId: string, stream = false) {
  const converted = requestFromChat("anthropic", { ...body, model: modelId, stream });
  const effort = body.__klove_reasoning?.effort;
  const maxTokens =
    body.max_output_tokens ??
    body.max_tokens ??
    body.max_completion_tokens ??
    (effort && effort !== "none" ? 8192 : 1024);
  const budgets: Record<string, number> = {
    minimal: 1024,
    low: 2048,
    medium: 4096,
    high: 6144,
    xhigh: 8192,
    max: 8192,
  };
  const configuredBudget = effort ? budgets[effort] : undefined;
  const budget =
    effort !== "none" && configuredBudget !== undefined && maxTokens > 1024
      ? Math.min(configuredBudget, maxTokens - 1)
      : undefined;
  return {
    ...converted,
    model: modelId,
    max_tokens: maxTokens,
    ...(body.top_k !== undefined ? { top_k: body.top_k } : {}),
    ...(body.response_format?.type === "json_schema"
      ? { output_config: { ...(effort ? { effort } : {}), format: { type: "json_schema", name: body.response_format.json_schema?.name ?? "response", schema: body.response_format.json_schema?.schema } } }
      : body.response_format?.type === "json_object"
        ? { output_config: { ...(effort ? { effort } : {}), format: { type: "json_object" } } }
        : {}),
    ...(effort === "none"
      ? { thinking: { type: "disabled" } }
      : body.thinking
      ? { thinking: body.thinking }
      : budget
        ? { thinking: { type: "enabled", budget_tokens: budget } }
        : {}),
    stream,
  };
}

const forwardedChatFields = [
  "max_output_tokens",
  "max_tokens",
  "max_completion_tokens",
  "temperature",
  "top_p",
  "n",
  "stop",
  "modalities",
  "prediction",
  "audio",
  "presence_penalty",
  "frequency_penalty",
  "logit_bias",
  "user",
  "tools",
  "tool_choice",
  "parallel_tool_calls",
  "max_tool_calls",
  "response_format",
  "seed",
  "service_tier",
  "reasoning",
  "reasoning_effort",
  "effort",
  "metadata",
  "store",
  "web_search_options",
  "stream_options",
  "logprobs",
  "top_logprobs",
  "functions",
  "function_call",
  "prompt_cache_key",
] as const;

function normalizeOpenAIMessages(messages: unknown) {
  if (!Array.isArray(messages)) return messages;
  return messages.map((message) =>
    message && typeof message === "object" && (message as any).role === "developer"
      ? { ...(message as any), role: "system" }
      : message,
  );
}

export function buildChatPayload(body: any, model: string, stream: boolean) {
  const payload: Record<string, unknown> = {
    model,
    messages: normalizeOpenAIMessages(body.messages),
    stream,
  };
  for (const field of forwardedChatFields) {
    if (body[field] !== undefined) payload[field] = body[field];
  }
  if (body.tools !== undefined) payload.tools = normalizeToolDefinitions(body.tools);
  if (body.functions !== undefined) payload.functions = normalizeToolDefinitions(body.functions);
  if (body.tool_choice && typeof body.tool_choice === "object" && body.tool_choice.function?.name) {
    payload.tool_choice = {
      ...body.tool_choice,
      function: {
        ...body.tool_choice.function,
        name: normalizeToolName("", body.tool_choice.function.name),
      },
    };
  }
  return payload;
}

function isQuotaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /429|quota|resource_exhausted|too many requests|rate.?limit/i.test(
    message,
  );
}

const sensitiveErrorKey = /token|secret|password|authorization|api.?key|cookie/i;

function safeErrorDetail(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value instanceof Error) return value.message;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeErrorDetail(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, item]) => [
      key,
      sensitiveErrorKey.test(key) ? "[redacted]" : safeErrorDetail(item, depth + 1),
    ]));
  }
  return typeof value === "string" && value.length > 4000 ? `${value.slice(0, 4000)}…` : value;
}

function errorMessage(error: unknown, fallback = "Provider request failed") {
  const value = (error as any)?.body ?? (error as any)?.error ?? error;
  const nested = (value as any)?.error;
  const message =
    (typeof nested === "object" ? nested?.message : nested) ??
    (value as any)?.message ??
    (error as any)?.message;
  return typeof message === "string" && message ? message : fallback;
}

export function proxyErrorBody(error: unknown, fallback = "Provider request failed"): { error: Record<string, unknown> } {
  const raw = (error as any)?.body ?? (error as any)?.error;
  const detail = safeErrorDetail(raw);
  const message = errorMessage(error, fallback);
  const source = detail && typeof detail === "object" ? detail as Record<string, unknown> : {};
  const nested = source.error && typeof source.error === "object" ? source.error as Record<string, unknown> : {};
  return {
    error: {
      ...nested,
      ...source,
      message,
      type: nested.type ?? source.type ?? "server_error",
      code: nested.code ?? source.code ?? null,
    },
  };
}

export function proxyErrorStatus(error: unknown, fallback = 502) {
  const status = errorStatus(error);
  if (status !== undefined && status >= 400 && status <= 599) return status;
  return isQuotaError(error) ? 429 : fallback;
}

function failureStatus(failures: unknown[], fallback = 502) {
  const statuses = failures.map((failure) => errorStatus(failure)).filter((status): status is number => status !== undefined && status >= 400 && status <= 599);
  if (statuses.length) return statuses.at(-1)!;
  if (failures.length && failures.every(isQuotaError)) return 429;
  const match = failures.map((failure) => String(failure).match(/(?:HTTP|status|failed\s*\()\s*(4\d\d|5\d\d)/i)?.[1]).find(Boolean);
  return match ? Number(match) : fallback;
}

function isModelNotFoundError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /"code"\s*:\s*404|\bNOT_FOUND\b|requested entity was not found/i.test(
    message,
  );
}

function errorStatus(error: unknown): number | undefined {
  return error instanceof AnthropicRequestError
    ? error.status
    : typeof (error as any)?.status === "number"
      ? (error as any).status
      : undefined;
}

function isTransientProviderError(error: unknown) {
  if (isAbortError(error)) return false;
  const status = errorStatus(error);
  return status === undefined || status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function canRetry(error: unknown, signal?: AbortSignal) {
  return !signal?.aborted && isTransientProviderError(error);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError" ||
    (error as any)?.name === "AbortError";
}

function retryDelay(attempt: number) {
  return Math.min(1000, 100 * 2 ** attempt);
}

function tokenDetails(usage: any) {
           return {
    cacheRead: Number(
      usage?.prompt_tokens_details?.cached_tokens ??
        usage?.input_tokens_details?.cached_tokens ??
        usage?.cache_read_input_tokens ??
        usage?.cache_read_tokens ??
        usage?.cached_input_tokens ??
        usage?.cachedContentTokenCount ??
        usage?.cached_content_token_count ??
        usage?.cached_tokens ??
        0,
    ),
    cacheWrite: Number(
      usage?.cache_creation_input_tokens ??
        usage?.cache_creation_input_tokens_details?.cached_tokens ??
        usage?.cache_write_tokens ??
        usage?.cache_write_input_tokens ??
        0,
    ),
  };
}

function clientIp(
  request: Request,
  headers: Record<string, string | undefined>,
  server?: { requestIP?: (request: Request) => { address?: string } | null },
) {
  const direct = server?.requestIP?.(request)?.address;
  const trusted = Boolean(direct && config.trustedProxyIps.has(direct));
  if (trusted) {
    return (
      headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      headers["x-real-ip"] ||
      request.headers.get("cf-connecting-ip") ||
      direct ||
      "unknown"
    );
  }
  return direct || "unknown";
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
  onUsage: (
    promptTokens: number,
    completionTokens: number,
    durationMs: number,
    generationDurationMs?: number,
    details?: { cacheRead: number; cacheWrite: number },
  ) => void,
  start: number,
  model: string,
  onCancel?: () => void,
) {
  return recordSseUsageResponse(convertStream("anthropic", "chat_completions", response, model, onCancel), onUsage, start, undefined, { model });
}

export function recordSseUsageResponse(
  response: Response,
  onUsage: (
    promptTokens: number,
    completionTokens: number,
    durationMs: number,
    generationDurationMs?: number,
    details?: { cacheRead: number; cacheWrite: number },
  ) => void,
  start: number,
  onError?: (error: Error) => void,
  estimate?: { messages?: unknown; model?: string; provider?: string },
) {
  const reader = response.body?.getReader();
  if (!reader) return response;
  const decoder = new TextDecoder();
  let buffer = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let completionText = "";
  let recorded = false;
  let firstTokenAt: number | null = null;
  let streamError: Error | null = null;
  let closed = false;
  let finished = false;
  let errorReported = false;
  const record = () => {
    if (recorded) return;
    recorded = true;
    if (!promptTokens && estimate?.messages) promptTokens = countMessages(estimate.messages, estimate);
    if (!completionTokens && completionText) completionTokens = countCompletion(completionText, estimate);
    onUsage(
      promptTokens,
      completionTokens,
      Math.round(performance.now() - start),
      Math.round(performance.now() - (firstTokenAt ?? start)),
      { cacheRead, cacheWrite },
    );
  };

  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const processEvent = (event: string) => {
          const lines = event.split(/\r\n|\n|\r/);
          const raw = lines.filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim()).join("\n");
          if (!raw || raw === "[DONE]") return;
          try {
            const data = JSON.parse(raw);
            if (data.error) {
              streamError = new Error(typeof data.error === "string" ? data.error : data.error.message ?? "Upstream stream failed");
              return;
            }
            const usage = data.usage ?? data.response?.usage ?? data.response?.response?.usage;
            if (usage) {
              promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? usage.inputTokens ?? usage.promptTokenCount ?? usage.inputTokenCount ?? promptTokens);
              completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? usage.outputTokens ?? usage.candidatesTokenCount ?? usage.outputTokenCount ?? completionTokens);
              const details = tokenDetails(usage);
              cacheRead = Math.max(cacheRead, details.cacheRead);
              cacheWrite = Math.max(cacheWrite, details.cacheWrite);
            }
            for (const choice of data.choices ?? []) {
              const delta = choice?.delta;
              if (typeof delta?.content === "string") completionText += delta.content;
              if (typeof delta?.reasoning_content === "string") completionText += delta.reasoning_content;
            }
            if (typeof data.delta?.content === "string") completionText += data.delta.content;
            if (typeof data.delta?.reasoning_content === "string") completionText += data.delta.reasoning_content;
            const semanticDelta = (data.choices ?? []).some((choice: any) => {
              const delta = choice?.delta;
              return Boolean(delta && (delta.content || delta.reasoning_content || delta.reasoning || delta.tool_calls?.length || delta.function_call?.arguments));
            }) || Boolean(data.delta?.content || data.delta?.reasoning_content || data.delta?.reasoning || data.delta?.tool_calls || data.delta?.function_call);
            if (semanticDelta) firstTokenAt ??= performance.now();
          } catch {
            /* Ignore non-JSON SSE events. */
          }
        };
        try {
          while (true) {
            const { done, value } = await reader.read();
            const text = decoder.decode(value ?? new Uint8Array(), { stream: !done });
            if (text) {
              controller.enqueue(encoder.encode(text));
              buffer += text;
              const events = buffer.split(/(?:\r\n|\n|\r){2}/);
              buffer = events.pop() ?? "";
              events.forEach(processEvent);
            }
            if (done) {
              if (buffer.trim()) processEvent(buffer);
              break;
            }
          }
          if (streamError) onError?.(streamError); else record();
        } catch (error: any) {
          if (!finished) {
            onError?.(error instanceof Error ? error : new Error(String(error)));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { message: error?.message ?? "Upstream stream disconnected" } })}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          }
        } finally {
          if (!finished) { finished = true; controller.close(); }
        }
      },
      cancel(reason) {
        finished = true;
        void reader.cancel(reason).catch(() => undefined);
      },
    }),
    { headers: streamingHeaders(response.headers), status: response.status, statusText: response.statusText },
  );
}

async function verifyApiKey(headers: Record<string, string | undefined>) {
  const auth = headers.authorization;
  const key = auth?.startsWith("Bearer ") ? auth.slice(7) : headers["x-api-key"];
  if (!key) return null;
  return keyService.verify(key);
}

export const proxyPlugin = (app: Elysia) =>
  app
    .onError(({ error, set, request }) => {
      const pathname = new URL(request.url).pathname;
      if (pathname === "/v1/messages") {
        set.status = proxyErrorStatus(error, 500);
        return {
          type: "error",
          error: {
            type: (error as any)?.type ?? "api_error",
            message: errorMessage(error, "Internal proxy error"),
          },
        };
      }
      if (pathname === "/v1/chat/completions" || pathname === "/v1/responses") {
        set.status = proxyErrorStatus(error, 500);
        return proxyErrorBody(error, "Internal proxy error");
      }
    })
    .get("/v1/models", async ({ set, headers }) => {
      const apiKey = await verifyApiKey(headers);
      if (!apiKey) {
        set.status = 401;
        return { error: "Unauthorized", message: "Valid API key required" };
      }

       const hiddenMembers = modelPoolService.memberModelIdsHiddenFromCatalog();
       const models = modelService.findAllActive().filter((model) => !hiddenMembers.has(model.id));
      const providers = providerService.findAll();

      return {
        object: "list",
          data: [
           ...models.map((m) => {
          const provider = providers.find((p) => p.id === m.provider_id);
          return {
            id: provider
              ? providerModelPublicId(provider.name, m)
              : m.pretty_id ?? m.model_id,
            object: "model",
            created: Math.floor(new Date(m.created_at).getTime() / 1000),
             owned_by: provider?.name.toLowerCase() ?? "unknown",
             context_window: m.context_window,
             max_output_tokens: m.max_output_tokens,
             max_output_tokens_source: m.max_output_tokens_source,
             max_output_tokens_is_default: m.max_output_tokens_is_default,
             limit: {
               context: m.context_window,
               output: m.max_output_tokens,
               context_window: m.context_window,
               max_output_tokens: m.max_output_tokens,
             },
             capabilities: m.capabilities,
             reasoning_efforts: m.reasoning_efforts,
             reasoning_default:
               m.reasoning_efforts.find((effort) => effort.is_default)?.effort ??
               null,
             reasoning: {
               efforts: m.reasoning_efforts,
               default:
                 m.reasoning_efforts.find((effort) => effort.is_default)
                   ?.effort ?? null,
             },
           };
           }),
           ...modelPoolService.apiModels(),
         ],
      };
    })
    .post(
      "/v1/messages",
      async ({ body, set, headers, request }) => {
        if (!body || typeof body !== "object" || typeof body.model !== "string" || !Array.isArray(body.messages) || typeof body.max_tokens !== "number") {
          set.status = 400;
          return { type: "error", error: { type: "invalid_request_error", message: "model, messages, and max_tokens are required" } };
        }
        const apiKey = await verifyApiKey(headers);
        if (!apiKey) {
          set.status = 401;
          return { type: "error", error: { type: "authentication_error", message: "Valid API key required" } };
        }
        let chatBody: any;
        try {
          chatBody = requestToChat("anthropic", body);
        } catch (error: any) {
          set.status = 400;
          return { type: "error", error: { type: "invalid_request_error", message: error?.message ?? "Unsupported Anthropic request" } };
        }
        const model = typeof body.model === "string" ? body.model : "";
        const poolSlug = poolSlugFromModelId(model);
        if (poolSlug) {
          const candidates = modelPoolService.routeCandidates(poolSlug);
          if (!candidates?.length) {
            set.status = 503;
            return { type: "error", error: { type: "api_error", message: `Compound model "${poolSlug}" is unavailable` } };
          }
          const response = await routeModelPool(poolSlug, chatBody, headers.authorization ?? `Bearer ${headers["x-api-key"]}`, request.signal, async (_input, init) => fetch(`http://127.0.0.1:${config.port}/v1/chat/completions`, { ...init, headers: { ...(init?.headers as Record<string, string>), "X-Klove-Model-Pool-Attempt": "true" } }));
          if (!response.ok) { set.status = response.status; const error = await response.json().catch(() => null) as any; return { type: "error", error: { type: error?.error?.type ?? "api_error", message: error?.error?.message ?? error?.message ?? "Provider request failed" } }; }
          if (body.stream) return convertStream("chat_completions", "anthropic", response, model);
          try {
            return chatCompletionToAnthropic(await response.json());
          } catch (error: any) {
            set.status = 502;
            return { type: "error", error: { type: "api_error", message: error?.message ?? "Response conversion failed" } };
          }
        }
        const abort = new AbortController();
        const abortUpstream = () => abort.abort(request.signal.reason);
        if (request.signal.aborted) abortUpstream();
        else request.signal.addEventListener("abort", abortUpstream, { once: true });
        try {
          const chatResponse = await fetch(`http://127.0.0.1:${config.port}/v1/chat/completions`, {
            method: "POST",
            headers: { Authorization: headers.authorization ?? `Bearer ${headers["x-api-key"]}`, "Content-Type": "application/json", Accept: body.stream ? "text/event-stream" : "application/json" },
            body: JSON.stringify(chatBody),
            signal: abort.signal,
          });
          if (!chatResponse.ok) {
            set.status = chatResponse.status;
            const raw = await chatResponse.text().catch(() => "");
            let upstream: any = null;
            try { upstream = raw ? JSON.parse(raw) : null; } catch { upstream = { message: raw }; }
            return { type: "error", error: { type: upstream?.error?.type ?? "api_error", message: upstream?.error?.message ?? upstream?.message ?? "Provider request failed" } };
          }
          if (body.stream) return convertStream("chat_completions", "anthropic", chatResponse, body.model, abortUpstream);
          try {
            return chatCompletionToAnthropic(await chatResponse.json());
          } catch (error: any) {
            set.status = 502;
            return { type: "error", error: { type: "api_error", message: error?.message ?? "Response conversion failed" } };
          }
        } catch (error: any) {
          if (request.signal.aborted) throw error;
          set.status = 502;
          return { type: "error", error: { type: "api_error", message: error?.message ?? "Proxy request failed" } };
        }
      },
      { body: t.Any() },
    )
    .post(
      "/v1/responses",
      async ({ body, set, headers, request }) => {
        if (!body || typeof body !== "object" || typeof body.model !== "string" || body.input === undefined) {
          set.status = 400;
          return {
            error: {
              message: "model and input are required",
              type: "invalid_request_error",
              param: body?.model ? "input" : "model",
              code: null,
            },
          };
        }
        const apiKey = await verifyApiKey(headers);
        if (!apiKey) {
          set.status = 401;
          return { error: { message: "Valid API key required", type: "authentication_error", code: null } };
        }
        const parsedModel = parseModelName(body.model);
        if (parsedModel) {
          const provider = providerService.findByName(parsedModel.providerName);
          if (provider?.protocol === "openai-responses" && provider.is_active) {
            const modelRecord = modelService.findByPublicId(provider.id, parsedModel.modelId);
            if (!modelRecord || !modelRecord.is_active) {
              set.status = 404;
              return { error: { message: `No active model "${parsedModel.modelId}" is configured for provider "${provider.name}"`, type: "invalid_request_error", code: "model_not_found" } };
            }
            const requestModel = modelRecord.model_id;
            const canonicalBody = requestToChat("responses", body);
            try {
              validateModelRequest(canonicalBody, modelRecord);
              applyResolvedReasoning(canonicalBody, modelRecord);
            } catch (error: any) {
              set.status = 400;
              return { error: { message: error.message, type: "invalid_request_error", code: null } };
            }
            let convertedRequest: any;
            try { convertedRequest = { ...body, model: requestModel }; }
            catch (error: any) { set.status = 400; return { error: { message: error.message, type: "invalid_request_error", code: null } }; }
            const upstreamController = new AbortController();
            const abort = () => upstreamController.abort(request.signal.reason);
            if (request.signal.aborted) abort(); else request.signal.addEventListener("abort", abort, { once: true });
            const providerCredential = credentialService.select(provider.id, provider.credential_mode, provider.fixed_credential_id)
              || credentialService.select(provider.id, "round_robin");
            if (!providerCredential) {
              set.status = 503;
              return { error: { message: "No active provider credential", type: "server_error", code: "no_active_credential" } };
            }
            const requestLogId = requestLogService.start({
              providerId: provider.id,
              providerName: provider.name,
              modelName: requestModel,
              clientIp: clientIp(request, headers),
              requesterName: apiKey.name,
              requestDetails: { method: request.method, url: "/v1/responses", headers, payload: body, stream: Boolean(body.stream) },
            });
            const incomingSession = headers["x-opencode-session"];
            const sessionKey = incomingSession || String((body as any).metadata?.conversation_id ?? (body as any).conversation_id ?? (body as any).metadata?.session_id ?? crypto.randomUUID());
            const outgoingHeaders = upstreamProviderHeaders(
              provider,
              { Authorization: `Bearer ${providerCredential.secret ?? ""}`, "Content-Type": "application/json", Accept: body.stream ? "text/event-stream" : "application/json" },
              opencodeSessionId(provider.id, sessionKey),
              incomingSession,
            );
            await assertSafeRemoteUrl(openAIEndpoint(provider, "responses"));
            const started = performance.now();
            const upstream = await fetch(openAIEndpoint(provider, "responses"), {
              method: "POST",
              headers: outgoingHeaders,
              body: JSON.stringify(convertedRequest),
              signal: upstreamController.signal,
            });
            if (!upstream.ok) {
              set.status = upstream.status;
              const failureBody = await upstream.json().catch(() => null);
              const failure = { status: upstream.status, body: failureBody };
              requestLogService.captureError(requestLogId, failure);
              requestLogService.complete(requestLogId, { status: "error", statusCode: upstream.status, error: errorMessage(failure) });
              return proxyErrorBody(failure);
            }
            if (body.stream) return recordSseUsageResponse(rewriteResponsesStreamModel(upstream, body.model, abort), (promptTokens, completionTokens, durationMs, generationDurationMs, details) => {
              const usage = usageService.record(provider.id, modelRecord.id, requestModel, promptTokens, completionTokens, durationMs, generationDurationMs, details);
              requestLogService.complete(requestLogId, { promptTokens, completionTokens, cacheRead: details?.cacheRead, cacheWrite: details?.cacheWrite, cost: usage.estimated_cost_usd, durationMs });
              credentialService.clearError(providerCredential.id);
              credentialService.clearCooldown(providerCredential.id);
            }, started, (error) => {
              credentialService.markError(providerCredential.id, error.message);
              requestLogService.complete(requestLogId, { status: "error", statusCode: 502, error: error.message });
            }, { messages: canonicalBody.messages, model: requestModel, provider: provider.name });
            const result = await upstream.json();
            const inputTokens = Number(result.usage?.input_tokens ?? 0);
            const outputTokens = Number(result.usage?.output_tokens ?? 0);
            const durationMs = Math.round(performance.now() - started);
            const usage = usageService.record(provider.id, modelRecord.id, requestModel, inputTokens, outputTokens, durationMs, durationMs);
            requestLogService.complete(requestLogId, { promptTokens: inputTokens, completionTokens: outputTokens, cost: usage.estimated_cost_usd, durationMs });
            credentialService.clearError(providerCredential.id);
            credentialService.clearCooldown(providerCredential.id);
            return { ...result, model: body.model };
          }
        }
        let chatBody: any;
        try {
          chatBody = requestToChat("responses", body);
        } catch (error: any) {
          set.status = 400;
          return { error: { message: error?.message ?? "Unsupported Responses request", type: "invalid_request_error", code: null } };
        }
        const poolSlug = typeof body.model === "string" ? poolSlugFromModelId(body.model) : null;
        if (poolSlug) {
          const candidates = modelPoolService.routeCandidates(poolSlug);
          if (!candidates?.length) {
            set.status = 503;
            return { error: { message: `Pool "${poolSlug}" is inactive or has no active members`, type: "server_error", code: "compound_model_unavailable" } };
          }
          const poolConfig = modelPoolService.findBySlug(poolSlug)!;
          const tokenLimitError = poolTokenLimitError(poolConfig, chatBody);
          if (tokenLimitError && tokenLimitError.startsWith("Estimated input")) {
            set.status = 400;
            return { error: { message: tokenLimitError, type: "invalid_request_error", code: "compound_input_limit_exceeded" } };
          }
          const poolResponse = await routeModelPool(poolSlug, chatBody, headers.authorization!, request.signal, async (_input, init) => fetch(`http://127.0.0.1:${config.port}/v1/chat/completions`, {
            ...init,
            headers: { ...(init?.headers as Record<string, string>), "X-Klove-Model-Pool-Attempt": "true" },
          }));
          if (!poolResponse.ok) {
            set.status = poolResponse.status;
            return proxyErrorBody({ status: poolResponse.status, body: await poolResponse.json().catch(() => null) });
          }
          if (body.stream) return convertStream("chat_completions", "responses", poolResponse, body.model);
          try {
            return convertChatCompletionToResponse(await poolResponse.json());
          } catch (error: any) {
            set.status = 502;
            return { error: { message: error?.message ?? "Response conversion failed", type: "server_error", code: null } };
          }
        }
        const parsedTarget = parseModelName(body.model);
        const targetProvider = parsedTarget ? providerService.findByName(parsedTarget.providerName) : null;
        if (targetProvider?.protocol === "openai-responses") {
          set.status = 400;
          return { error: { message: "OpenAI Responses providers require requests to /v1/responses", type: "invalid_request_error", code: "incompatible_endpoint" } };
        }
        const upstreamController = new AbortController();
        const abortUpstream = () => upstreamController.abort(request.signal.reason);
        if (request.signal.aborted) abortUpstream();
        else request.signal.addEventListener("abort", abortUpstream, { once: true });
        const chatResponse = await fetch(`http://127.0.0.1:${config.port}/v1/chat/completions`, {
          method: "POST",
          headers: { Authorization: headers.authorization ?? `Bearer ${headers["x-api-key"]}`, "Content-Type": "application/json", Accept: body.stream ? "text/event-stream" : "application/json" },
          body: JSON.stringify(chatBody),
          signal: upstreamController.signal,
        });
        if (!chatResponse.ok) {
          set.status = chatResponse.status;
          const raw = await chatResponse.text().catch(() => "");
          let error: unknown = raw ? { message: raw } : undefined;
          try {
            if (raw) error = JSON.parse(raw);
          } catch {
            // Keep the plain-text upstream error.
          }
          return proxyErrorBody({ status: chatResponse.status, body: error });
        }
        if (body.stream) {
          const parsed = parseModelName(body.model);
          const provider = parsed ? providerService.findByName(parsed.providerName) : null;
          if (provider?.protocol === "openai-responses") {
            await chatResponse.body?.cancel();
            const error = new Error("Requests using Responses-only providers must be sent to /v1/responses");
            set.status = 400;
            return proxyErrorBody(error, "Incompatible endpoint");
          }
          return convertStream("chat_completions", "responses", chatResponse, body.model, abortUpstream);
        }
        try {
          return convertChatCompletionToResponse(await chatResponse.json());
        } catch (error: any) {
          set.status = 502;
          return { error: { message: error?.message ?? "Response conversion failed", type: "server_error", code: null } };
        }
      },
      { body: t.Any() },
    )
    .post(
      "/v1/chat/completions",
      async ({ body, set, headers, request, server }) => {
        const validationError = validateChatCompletionRequest(body);
        if (validationError) {
          set.status = 400;
          return {
            error: {
              message: validationError,
              type: "invalid_request_error",
              param: "model",
              code: null,
            },
          };
        }
        const apiKey = await verifyApiKey(headers);
        if (!apiKey) {
          set.status = 401;
          return { error: "Unauthorized", message: "Valid API key required" };
        }

        const isTitleGeneration = headers["x-klove-title-generation"] === "true";
        if (rtkManager.enabled && !isTitleGeneration) {
          const lastMessage = body.messages.at(-1);
          logger.info("RTK checking last message", {
            messageCount: body.messages.length,
            role: lastMessage?.role ?? null,
            contentType: Array.isArray(lastMessage?.content)
              ? "array"
              : typeof lastMessage?.content,
          });
          const originalMessages = body.messages;
          body.messages = await filterLastToolMessage(
            originalMessages,
            (content) => rtkManager.filterToolOutput(content),
          );
          if (body.messages !== originalMessages) {
            logger.info("RTK replaced last tool output");
          } else {
            logger.info("RTK skipped last message", {
              reason: lastMessage?.role === "tool"
                ? "tool output was unchanged"
                : "last message is not a tool message",
            });
          }
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
        const selectedProvider = providerService.findByName(parsed.providerName);
        if (selectedProvider?.protocol === "openai-responses") {
          set.status = 400;
          return { error: "Incompatible API endpoint", message: `Provider "${selectedProvider.name}" uses the Responses API. Send this request to /v1/responses.` };
        }

        const poolSlug = poolSlugFromModelId(body.model);
        if (poolSlug) {
          const candidates = modelPoolService.routeCandidates(poolSlug);
          if (!candidates?.length) {
            set.status = 503;
            return { error: "Compound model unavailable", message: `Pool "${poolSlug}" is inactive or has no active member models` };
          }
          const poolConfig = modelPoolService.findBySlug(poolSlug)!;
          const tokenLimitError = poolTokenLimitError(poolConfig, body);
          if (tokenLimitError && tokenLimitError.startsWith("Estimated input")) {
            set.status = 400;
            return { error: "Compound model input token limit exceeded", message: tokenLimitError };
          }
          const response = await routeModelPool(poolSlug, body, headers.authorization!, request.signal, async (_input, init) => fetch(`http://127.0.0.1:${config.port}/v1/chat/completions`, {
            ...init,
            headers: { ...(init?.headers as Record<string, string>), "X-Klove-Model-Pool-Attempt": "true" },
          }));
          if (response.headers.get("X-Klove-Model-Pool-Attempt") === "true" && !response.ok) {
            set.status = response.status;
            return response;
          }
          set.status = response.status;
          return response;
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

        const modelRecord = modelService.findByPublicId(provider.id, parsed.modelId);
        if (!modelRecord || !modelRecord.is_active) {
          set.status = 404;
          return {
            error: "Model not found or inactive",
            message: `No active model "${parsed.modelId}" is configured for provider "${provider.name}"`,
          };
        }
        // Public identifier resolved; use upstream technical ID only internally.
        parsed.modelId = modelRecord.model_id;
        const fixThinkTag = (completion: any) =>
          fixMissingThinkOpeningTag(
            completion,
            modelRecord.think_opening_tag_mode,
          );
        const fixThinkTagStream = (response: Response) =>
          fixThinkTagSseResponse(
            response,
            modelRecord.think_opening_tag_mode,
          );
        try {
          validateModelRequest(body, modelRecord);
        } catch (error) {
          if (!(error instanceof ModelRequestError) && !(error instanceof MultimodalRequestError)) throw error;
          set.status = 400;
          return { error: "Invalid model request", message: error.message };
        }
        if (!isTitleGeneration) {
          try {
            applyResolvedReasoning(body, modelRecord);
          } catch (error) {
            if (!(error instanceof ReasoningRequestError)) throw error;
            set.status = 400;
            return { error: "Invalid reasoning effort", message: error.message };
          }
        }

        if (!isTitleGeneration) {
          body.messages = await injectCavemanPrompt(body.messages);
          body.messages = await customSkillsProxy.injectSkills(body.messages);
        }

        if (provider.protocol === "conol") {
          const unsupported = body.tools?.length || body.messages.some((message: any) =>
            Array.isArray(message.content) && message.content.some((part: any) => part?.type !== "text" && part?.type !== "input_text"),
          );
          if (unsupported) {
            set.status = 400;
            return { error: "Invalid Conol request", message: "Conol supports text messages only; tools and images are not supported." };
          }
          if (body.messages.some((message: any) => !conolContent(message.content) && message.role === "user")) {
            set.status = 400;
            return { error: "Invalid Conol request", message: "Conol requires at least one user text message." };
          }
        }

        if (
          provider.protocol === "antigravity" &&
          isBlockedAntigravityModel(parsed.modelId)
        ) {
          set.status = 403;
          return {
            error: "Model blocked",
            message: `Model "${parsed.modelId}" is not available through Antigravity`,
          };
        }

        const requestLogId = requestLogService.start({
          providerId: provider.id,
          providerName: provider.name,
          modelName: parsed.modelId,
          clientIp: clientIp(request, headers, server as any),
          requesterName: apiKey.name,
          requestDetails: {
            method: request.method,
            url: new URL(request.url).pathname,
            headers,
            payload: body,
            stream: Boolean(body.stream),
          },
        });

        const requestSequence =
          provider.credential_mode === "round_robin"
            ? credentialService.beginRequest(provider.id)
            : undefined;
        let credential =
          credentialService.select(
            provider.id,
            provider.credential_mode,
            provider.fixed_credential_id,
            requestSequence,
          ) ||
          credentialService.select(
            provider.id,
            "round_robin",
            null,
            requestSequence,
          );
        if (!credential) {
          requestLogService.complete(requestLogId, {
            status: "error",
            statusCode: 503,
            error: "No active provider credential",
          });
          set.status = 503;
          return {
            error: "No active provider credential",
            message: `Provider "${provider.name}" has no active credential`,
          };
        }
        requestLogService.setCredential(requestLogId, credential);
        logger.debug("Credential selected", {
          provider: provider.name,
          mode: provider.credential_mode,
          credential_id: credential.id,
          kind: credential.kind,
        });

        // Build request payload for the provider
        const payload: any = buildChatPayload(
          body,
          parsed.modelId,
          body.stream ?? false,
        );
        logger.debug("Proxy request prepared", {
          provider: provider.name,
          requested_model: body.model,
          upstream_model: parsed.modelId,
          streaming: body.stream === true,
          tool_count: Array.isArray(payload.tools) ? payload.tools.length : 0,
          tool_names: Array.isArray(payload.tools)
            ? payload.tools.map((tool: any) => tool.function?.name).filter(Boolean)
            : [],
          reasoning_effort: body.reasoning_effort ?? body.reasoning?.effort,
        });

        if (provider.protocol === "openai-responses") {
          const attempted = new Set<string>();
          const failures: unknown[] = [];
          let responsesBody: Record<string, any>;
          try {
            responsesBody = requestFromChat("responses", { ...body, model: parsed.modelId, stream: Boolean(body.stream) });
          } catch (error: any) {
            requestLogService.complete(requestLogId, { status: "error", statusCode: 400, error: error.message });
            set.status = 400;
            return { error: "Invalid request for OpenAI Responses API", message: error.message };
          }
          while (credential && !attempted.has(credential.id)) {
            attempted.add(credential.id);
            const credentialId = credential.id;
            const start = performance.now();
            try {
              await assertSafeRemoteUrl(openAIEndpoint(provider, "responses"));
              const upstream = await fetch(openAIEndpoint(provider, "responses"), {
                method: "POST",
                headers: upstreamProviderHeaders(provider, {
                  Authorization: `Bearer ${credential.secret ?? ""}`,
                  "Content-Type": "application/json",
                  Accept: body.stream ? "text/event-stream" : "application/json",
                }, opencodeSessionId(provider.id, String(body.metadata?.conversation_id ?? body.conversation_id ?? body.metadata?.session_id ?? crypto.randomUUID())), headers["x-opencode-session"], true),
                body: JSON.stringify(responsesBody),
                signal: request.signal,
              });
              requestLogService.captureResponse(requestLogId, { status: upstream.status, headers: upstream.headers, contentType: upstream.headers.get("content-type"), streaming: Boolean(body.stream) });
              if (!upstream.ok) {
                const data = await upstream.json().catch(() => null);
                throw Object.assign(new Error(data?.error?.message ?? `Responses API returned HTTP ${upstream.status}`), { status: upstream.status, body: data });
              }
              if (body.stream) {
                const chatStream = fixThinkTagStream(convertStream("responses", "chat_completions", upstream, parsed.modelId, () => undefined));
                return recordSseUsageResponse(chatStream, (promptTokens, completionTokens, durationMs, generationDurationMs, details) => {
                  const usage = usageService.record(provider.id, modelRecord?.id ?? parsed.modelId, parsed.modelId, promptTokens, completionTokens, durationMs, generationDurationMs, details);
                  requestLogService.complete(requestLogId, { promptTokens, completionTokens, cacheRead: details?.cacheRead, cacheWrite: details?.cacheWrite, cost: usage.estimated_cost_usd, durationMs });
                  credentialService.clearError(credentialId);
                  credentialService.clearCooldown(credentialId);
                }, start, (error) => {
                  credentialService.markError(credentialId, error.message);
                  requestLogService.complete(requestLogId, { status: "error", statusCode: 502, error: error.message });
                }, { messages: body.messages, model: parsed.modelId, provider: provider.name });
              }
              const completion = convertResponse("responses", "chat_completions", await upstream.json());
              const durationMs = Math.round(performance.now() - start);
              const details = tokenDetails(completion.usage);
              const usage = usageService.record(provider.id, modelRecord?.id ?? parsed.modelId, parsed.modelId, completion.usage?.prompt_tokens ?? 0, completion.usage?.completion_tokens ?? 0, durationMs, durationMs, details);
              requestLogService.complete(requestLogId, { promptTokens: completion.usage?.prompt_tokens, completionTokens: completion.usage?.completion_tokens, cacheRead: details.cacheRead, cacheWrite: details.cacheWrite, cost: usage.estimated_cost_usd, durationMs });
              credentialService.clearError(credentialId);
              credentialService.clearCooldown(credentialId);
              return fixThinkTag(completion);
            } catch (error: any) {
              failures.push(error);
              requestLogService.captureError(requestLogId, error);
              credentialService.markError(credentialId, error.message);
              if (isAbortError(error) || !isTransientProviderError(error) || provider.credential_mode !== "round_robin") break;
              credentialService.markCooldown(credentialId, 10, error.message, requestSequence);
              const next = credentialService.select(provider.id, "round_robin", null, requestSequence);
              if (!next || attempted.has(next.id)) break;
              credential = next;
              requestLogService.setCredential(requestLogId, credential);
            }
          }
          const statusCode = failureStatus(failures);
          const message = errorMessage(failures.at(-1));
          requestLogService.complete(requestLogId, { status: "error", statusCode, error: message });
          set.status = statusCode;
          return { error: "OpenAI Responses request failed", message };
        }

        if (isOpenAICompatibleProtocol(provider.protocol) && body.stream) {
          const attempted = new Set<string>();
          const failures: unknown[] = [];
          while (credential && !attempted.has(credential.id)) {
            attempted.add(credential.id);
            const credentialId = credential.id;
            const start = performance.now();
            try {
              const client = createOpenAIClient({ ...provider, api_key: credential.secret ?? "" }, credential.secret ?? "", headers["x-opencode-session"]);
              const stream = (await client.chat.completions.create({ ...payload, stream: true, stream_options: { include_usage: true } }, { signal: request.signal })) as any;
              return openAIStreamResponse(fixThinkTagAsyncIterable(stream, modelRecord.think_opening_tag_mode), {
                start,
                tokenDetails,
                signal: request.signal,
                onComplete: ({ promptTokens, completionTokens, cacheRead, cacheWrite, durationMs, generationDurationMs }) => {
                  const usage = usageService.record(provider.id, modelRecord.id, parsed.modelId, promptTokens, completionTokens, durationMs, generationDurationMs, { cacheRead, cacheWrite });
                  requestLogService.complete(requestLogId, { promptTokens, completionTokens, cacheRead, cacheWrite, cost: usage.estimated_cost_usd, durationMs });
                  credentialService.clearError(credentialId);
                  credentialService.clearCooldown(credentialId);
                },
                onError: (error, stats) => {
                  credentialService.markError(credentialId, error.message);
                  requestLogService.complete(requestLogId, { status: "error", statusCode: 502, promptTokens: stats.promptTokens, completionTokens: stats.completionTokens, cacheRead: stats.cacheRead, cacheWrite: stats.cacheWrite, durationMs: stats.durationMs, error: error.message });
                },
                onCancel: (stats) => requestLogService.complete(requestLogId, { status: "error", statusCode: 499, promptTokens: stats.promptTokens, completionTokens: stats.completionTokens, cacheRead: stats.cacheRead, cacheWrite: stats.cacheWrite, durationMs: stats.durationMs, error: "Client disconnected" }),
              });
            } catch (error: any) {
              failures.push(error);
              requestLogService.captureError(requestLogId, error);
              credentialService.markError(credentialId, error.message);
              if (isAbortError(error) || !isTransientProviderError(error) || provider.credential_mode !== "round_robin") break;
              credentialService.markCooldown(credentialId, 10, error.message, requestSequence);
              const next = credentialService.select(provider.id, "round_robin", null, requestSequence);
              if (!next || attempted.has(next.id)) break;
              credential = next;
              requestLogService.setCredential(requestLogId, credential);
            }
          }
          const statusCode = failureStatus(failures);
          const message = errorMessage(failures.at(-1));
          requestLogService.complete(requestLogId, { status: "error", statusCode, error: message });
          set.status = statusCode;
          return { error: "OpenAI Chat Completions request failed", message };
        }

        if (isOpenAICompatibleProtocol(provider.protocol) && !body.stream) {
          const attempted = new Set<string>();
          const failures: unknown[] = [];
          while (credential && !attempted.has(credential.id)) {
            attempted.add(credential.id);
            const credentialId = credential.id;
            const start = performance.now();
            try {
              const completion = await createOpenAIClient({ ...provider, api_key: credential.secret ?? "" }, credential.secret ?? "", headers["x-opencode-session"]).chat.completions.create(payload, { signal: request.signal });
              const durationMs = Math.round(performance.now() - start);
              const details = tokenDetails(completion.usage);
              const usage = usageService.record(provider.id, modelRecord.id, parsed.modelId, completion.usage?.prompt_tokens ?? 0, completion.usage?.completion_tokens ?? 0, durationMs, durationMs, details);
              requestLogService.complete(requestLogId, { promptTokens: completion.usage?.prompt_tokens, completionTokens: completion.usage?.completion_tokens, cacheRead: details.cacheRead, cacheWrite: details.cacheWrite, cost: usage.estimated_cost_usd, durationMs });
              credentialService.clearError(credentialId);
              credentialService.clearCooldown(credentialId);
              return fixThinkTag(completion);
            } catch (error: any) {
              failures.push(error);
              requestLogService.captureError(requestLogId, error);
              credentialService.markError(credentialId, error.message);
              if (isAbortError(error) || !isTransientProviderError(error) || provider.credential_mode !== "round_robin") break;
              credentialService.markCooldown(credentialId, 10, error.message, requestSequence);
              const next = credentialService.select(provider.id, "round_robin", null, requestSequence);
              if (!next || attempted.has(next.id)) break;
              credential = next;
              requestLogService.setCredential(requestLogId, credential);
            }
          }
          const statusCode = failureStatus(failures);
          const message = errorMessage(failures.at(-1));
          requestLogService.complete(requestLogId, { status: "error", statusCode, error: message });
          set.status = statusCode;
          return { error: "OpenAI Chat Completions request failed", message };
        }

        if (provider.protocol === "anthropic") {
          const attempted = new Set<string>();
          const failures: unknown[] = [];
          const failureStatuses: number[] = [];
          const upstreamController = new AbortController();
          request.signal.addEventListener("abort", () => upstreamController.abort(request.signal.reason), { once: true });
          while (credential && !attempted.has(credential.id)) {
            attempted.add(credential.id);
            try {
              const start = performance.now();
              const modelRecord = modelService.findByProviderAndModel(
                provider.id,
                parsed.modelId,
              );
              const credentialProvider = {
                ...provider,
                api_key: credential.secret ?? "",
              };
              if (body.stream)
                return fixThinkTagStream(anthropicStreamResponse(
                  await createAnthropicStream(
                    credentialProvider,
                    anthropicPayload(body, parsed.modelId),
                    credential.secret ?? undefined,
                    upstreamController.signal,
                  ),
                  (
                    promptTokens,
                    completionTokens,
                    durationMs,
                    _generationDurationMs,
                    details,
                  ) => {
                    const usage = usageService.record(
                      provider.id,
                      modelRecord?.id ?? parsed.modelId,
                      parsed.modelId,
                      promptTokens,
                      completionTokens,
                      durationMs,
                      durationMs,
                      details,
                    );
                    requestLogService.complete(requestLogId, {
                      promptTokens,
                      completionTokens,
                      cacheRead: details?.cacheRead,
                      cacheWrite: details?.cacheWrite,
                      cost: usage.estimated_cost_usd,
                      durationMs,
                    });
                  },
                  start,
                  parsed.modelId,
                  () => upstreamController.abort(),
                ));
              const completion = await createAnthropicMessage(
                credentialProvider,
                anthropicPayload(body, parsed.modelId),
                credential.secret ?? undefined,
                upstreamController.signal,
              );
              const details = tokenDetails(completion.usage);
              const durationMs = Math.round(performance.now() - start);
              const usage = usageService.record(
                provider.id,
                modelRecord?.id ?? parsed.modelId,
                parsed.modelId,
                completion.usage?.input_tokens ?? 0,
                completion.usage?.output_tokens ?? 0,
                durationMs,
                undefined,
                details,
              );
              requestLogService.complete(requestLogId, {
                promptTokens: completion.usage?.input_tokens,
                completionTokens: completion.usage?.output_tokens,
                cacheRead: details.cacheRead,
                cacheWrite: details.cacheWrite,
                cost: usage.estimated_cost_usd,
                durationMs,
              });
              credentialService.clearError(credential.id);
              credentialService.clearCooldown(credential.id);
              return fixThinkTag(toOpenAICompletion(completion));
            } catch (error: any) {
              failures.push(error);
              requestLogService.captureError(requestLogId, error);
              if (isAbortError(error)) break;
              const status = errorStatus(error);
              if (status !== undefined) failureStatuses.push(status);
              credentialService.markError(credential.id, error.message);
              if (!isTransientProviderError(error) || provider.credential_mode !== "round_robin") break;
              credentialService.markCooldown(credential.id, 10, error.message, requestSequence);
              await new Promise((resolve) => setTimeout(resolve, retryDelay(attempted.size - 1)));
              const next = credentialService.select(
                provider.id,
                "round_robin",
                null,
                requestSequence,
              );
              if (!next || attempted.has(next.id)) break;
              credential = next;
              requestLogService.setCredential(requestLogId, credential);
            }
          }
          const lastFailure = errorMessage(failures.at(-1));
          const lastStatus = failureStatuses.at(-1);
          const statusCode = lastStatus === 429 || failures.every(isQuotaError)
            ? 429
            : lastStatus !== undefined && lastStatus >= 400 && lastStatus < 600
              ? lastStatus
              : failureStatus(failures);
          requestLogService.complete(requestLogId, {
            status: "error",
            statusCode,
            error: lastFailure,
          });
          set.status = statusCode;
          return {
            error: "Provider request failed",
            message: `All ${attempted.size} available credentials failed. ${lastFailure}`,
          };
        }

         if (provider.protocol === "codex") {
          const attempted = new Set<string>();
          const failures: unknown[] = [];
          while (credential && !attempted.has(credential.id)) {
            attempted.add(credential.id);
            try {
              const start = performance.now();
              const response = codexStreamToOpenAI(
                await codexResponses(body, parsed.modelId, credential),
                parsed.modelId,
              );
               const modelRecord = modelService.findByProviderAndModel(
                provider.id,
                parsed.modelId,
               );
               const credentialId = credential.id;
               if (!body.stream) {
                 const { completion, firstDeltaAt } =
                   await openAICompletionFromSse(
                     response,
                     parsed.modelId,
                   );
                 const durationMs = Math.round(performance.now() - start);
                 const generationDurationMs = Math.round(
                   performance.now() - (firstDeltaAt ?? start),
                 );
                 const details = tokenDetails(completion.usage);
                 const usage = usageService.record(
                   provider.id,
                   modelRecord?.id ?? parsed.modelId,
                   parsed.modelId,
                   completion.usage?.prompt_tokens ?? 0,
                   completion.usage?.completion_tokens ?? 0,
                   durationMs,
                   generationDurationMs,
                   details,
                 );
                 requestLogService.complete(requestLogId, {
                   promptTokens: completion.usage?.prompt_tokens ?? 0,
                   completionTokens: completion.usage?.completion_tokens ?? 0,
                   cacheRead: details.cacheRead,
                   cacheWrite: details.cacheWrite,
                   cost: usage.estimated_cost_usd,
                   durationMs,
                 });
                 credentialService.clearError(credentialId);
                 credentialService.clearCooldown(credentialId);
                 return fixThinkTag(completion);
               }
               return recordSseUsageResponse(
                fixThinkTagStream(response),
                (
                  promptTokens,
                  completionTokens,
                  durationMs,
                  generationDurationMs,
                  details,
                ) => {
                  const usage = usageService.record(
                    provider.id,
                    modelRecord?.id ?? parsed.modelId,
                    parsed.modelId,
                    promptTokens,
                    completionTokens,
                    durationMs,
                    generationDurationMs,
                    details,
                  );
                   requestLogService.complete(requestLogId, {
                    promptTokens,
                    completionTokens,
                    cacheRead: details?.cacheRead,
                    cacheWrite: details?.cacheWrite,
                    cost: usage.estimated_cost_usd,
                     durationMs,
                   });
                   credentialService.clearError(credentialId);
                   credentialService.clearCooldown(credentialId);
                 },
                 start,
                 (error) => {
                   credentialService.markError(credentialId, error.message);
                   requestLogService.complete(requestLogId, {
                     status: "error",
                     statusCode: 502,
                     error: error.message,
                   });
                 },
               );
            } catch (error: any) {
              failures.push(error);
              requestLogService.captureError(requestLogId, error);
              credentialService.markError(credential.id, error.message);
              if (isAbortError(error) || !isTransientProviderError(error) || provider.credential_mode !== "round_robin") break;
              credentialService.markCooldown(
                credential.id,
                10,
                error.message,
                requestSequence,
              );
              const next = credentialService.select(
                provider.id,
                "round_robin",
                null,
                requestSequence,
              );
              if (!next || attempted.has(next.id)) break;
              credential = next;
              requestLogService.setCredential(requestLogId, credential);
            }
          }
          const lastFailure = errorMessage(failures.at(-1));
          const statusCode = failureStatus(failures);
          requestLogService.complete(requestLogId, {
            status: "error",
            statusCode,
            error: lastFailure,
          });
          set.status = statusCode;
          return {
            error: "Codex request failed",
            message: `All ${attempted.size} available credentials failed. ${lastFailure}`,
          };
        }

         if (provider.protocol === "antigravity") {
          const attempted = new Set<string>();
          const failures: unknown[] = [];
          while (credential && !attempted.has(credential.id)) {
            attempted.add(credential.id);
            try {
              const start = performance.now();
               const response = await antigravityResponses(
                body,
                parsed.modelId,
                credential,
               );
               const credentialId = credential.id;
               const modelRecord = modelService.findByProviderAndModel(
                provider.id,
                parsed.modelId,
               );
               if (!body.stream) {
                 const { completion, firstDeltaAt } =
                   await openAICompletionFromSse(
                     response,
                     parsed.modelId,
                   );
                 const durationMs = Math.round(performance.now() - start);
                 const generationDurationMs = Math.round(
                   performance.now() - (firstDeltaAt ?? start),
                 );
                 const details = tokenDetails(completion.usage);
                 const usage = usageService.record(
                   provider.id,
                   modelRecord?.id ?? parsed.modelId,
                   parsed.modelId,
                   completion.usage?.prompt_tokens ?? 0,
                   completion.usage?.completion_tokens ?? 0,
                   durationMs,
                   generationDurationMs,
                   details,
                 );
                 requestLogService.complete(requestLogId, {
                   promptTokens: completion.usage?.prompt_tokens ?? 0,
                   completionTokens: completion.usage?.completion_tokens ?? 0,
                   cacheRead: details.cacheRead,
                   cacheWrite: details.cacheWrite,
                   cost: usage.estimated_cost_usd,
                   durationMs,
                 });
                 credentialService.clearError(credentialId);
                 credentialService.clearCooldown(credentialId);
                 return fixThinkTag(completion);
               }
               return recordSseUsageResponse(
                fixThinkTagStream(response),
                (
                  promptTokens,
                  completionTokens,
                  durationMs,
                  generationDurationMs,
                  details,
                ) => {
                  const usage = usageService.record(
                    provider.id,
                    modelRecord?.id ?? parsed.modelId,
                    parsed.modelId,
                    promptTokens,
                    completionTokens,
                    durationMs,
                    generationDurationMs,
                    details,
                  );
                   requestLogService.complete(requestLogId, {
                    promptTokens,
                    completionTokens,
                    cacheRead: details?.cacheRead,
                    cacheWrite: details?.cacheWrite,
                    cost: usage.estimated_cost_usd,
                     durationMs,
                   });
                   credentialService.clearError(credentialId);
                   credentialService.clearCooldown(credentialId);
                 },
                 start,
                 (error) => {
                   credentialService.markError(credentialId, error.message);
                   requestLogService.complete(requestLogId, {
                     status: "error",
                     statusCode: 502,
                     error: error.message,
                   });
                 },
               );
            } catch (error: any) {
              if (isModelNotFoundError(error)) {
                failures.push(error);
              requestLogService.captureError(requestLogId, error);
                if (isAbortError(error) || !isTransientProviderError(error) || provider.credential_mode !== "round_robin") break;
                const next = credentialService.select(
                  provider.id,
                  "round_robin",
                  null,
                  requestSequence,
                );
                if (!next || attempted.has(next.id)) break;
                credential = next;
                requestLogService.setCredential(requestLogId, credential);
                continue;
              }
              credentialService.markError(credential.id, error.message);
              failures.push(error);
              requestLogService.captureError(requestLogId, error);
              if (isAbortError(error) || !isTransientProviderError(error) || provider.credential_mode !== "round_robin") {
                const statusCode = isQuotaError(error) ? 429 : errorStatus(error) ?? 502;
                requestLogService.complete(requestLogId, {
                  status: "error",
                  statusCode,
                  error: error.message,
                });
                set.status = statusCode;
                return {
                  error: "Antigravity request failed",
                  message: error.message,
                };
              }
              credentialService.markCooldown(
                credential.id,
                10,
                error.message,
                requestSequence,
              );
              const next = credentialService.select(
                provider.id,
                "round_robin",
                null,
                requestSequence,
              );
              if (!next || attempted.has(next.id)) {
                break;
              }
              logger.info("Retrying Antigravity request with next credential", {
                provider: provider.name,
                failed_credential_id: credential.id,
                next_credential_id: next.id,
              });
              credential = next;
              requestLogService.setCredential(requestLogId, credential);
            }
          }
          const allQuotaLimited =
            failures.length > 0 &&
            failures.every((message) => isQuotaError(message));
          const allNotFound =
            failures.length > 0 &&
            failures.every((message) => isModelNotFoundError(message));
          const statusCode = allNotFound
            ? 404
            : allQuotaLimited
              ? 429
              : failures.length
                ? 502
                : 503;
          requestLogService.complete(requestLogId, {
            status: "error",
            statusCode,
            error: errorMessage(failures.at(-1)),
          });
          set.status = statusCode;
          return {
            error: allNotFound
              ? "Antigravity model not found"
              : allQuotaLimited
                ? "Antigravity quota exhausted"
                : "Antigravity request failed",
            message: failures.length
              ? allNotFound
                ? `Model "${parsed.modelId}" was not found for the available Antigravity accounts.`
                : `All ${attempted.size} available Antigravity credential${attempted.size === 1 ? "" : "s"} failed. ${failures.at(-1)}`
              : "No credential is currently available for this request.",
          };
        }

        if (provider.protocol === "freebuff") {
          const attempted = new Set<string>();
          const failures: unknown[] = [];
          while (credential && !attempted.has(credential.id)) {
            attempted.add(credential.id);
            try {
              const start = performance.now();
              const response = await freebuffResponses(
                body,
                parsed.modelId,
                credential,
                provider.base_url,
                request.signal,
              );
              requestLogService.captureResponse(requestLogId, { status: response.status, headers: response.headers, contentType: response.headers.get("content-type"), streaming: Boolean(body.stream) });
              const modelRecord = modelService.findByProviderAndModel(provider.id, parsed.modelId);
              if (!body.stream) {
                requestLogService.complete(requestLogId, { durationMs: Math.round(performance.now() - start) });
                return fixThinkTag(await response.json());
              }
               return recordSseUsageResponse(fixThinkTagStream(response), (promptTokens, completionTokens, durationMs, generationDurationMs, details) => {
                const usage = usageService.record(provider.id, modelRecord?.id ?? parsed.modelId, parsed.modelId, promptTokens, completionTokens, durationMs, generationDurationMs, details);
                requestLogService.complete(requestLogId, { promptTokens, completionTokens, cacheRead: details?.cacheRead, cacheWrite: details?.cacheWrite, cost: usage.estimated_cost_usd, durationMs });
              }, start);
            } catch (error: any) {
              failures.push(error);
              requestLogService.captureError(requestLogId, error);
              credentialService.markError(credential.id, error.message);
              if (isAbortError(error) || !isTransientProviderError(error) || provider.credential_mode !== "round_robin") break;
              const next = credentialService.select(provider.id, "round_robin", null, requestSequence);
              if (!next || attempted.has(next.id)) break;
              credential = next;
              requestLogService.setCredential(requestLogId, credential);
            }
          }
           const statusCode = failureStatus(failures);
           set.status = statusCode;
           requestLogService.complete(requestLogId, { status: "error", statusCode, error: errorMessage(failures.at(-1)) });
           return { error: "Freebuff request failed", message: errorMessage(failures.at(-1)) };
         }

        if (provider.protocol === "qwen") {
          const attempted = new Set<string>();
          const failures: unknown[] = [];
          // Qwen marks think-skip-disabled models with capabilities.reasoning=true;
          // those think by default and cannot receive enable_thinking: false.
          const qwenModelRecord = modelService.findByProviderAndModel(provider.id, parsed.modelId);
          const canDisableThinking = qwenModelRecord?.capabilities?.reasoning !== true;
          while (credential && !attempted.has(credential.id)) {
            attempted.add(credential.id);
            try {
              const start = performance.now();
              const response = await qwenResponses(
                body,
                parsed.modelId,
                credential,
                provider.base_url,
                canDisableThinking,
              );
              const modelRecord = modelService.findByProviderAndModel(provider.id, parsed.modelId);
              if (!body.stream) {
                const completion = await response.json();
                if (completion.choices?.[0]?.message?.content) {
                  const extracted = extractQwenContent(
                    completion.choices[0].message.content,
                  );
                  completion.choices[0].message.content = extracted.content;
                  if (extracted.reasoningContent)
                    completion.choices[0].message.reasoning_content =
                      extracted.reasoningContent;
                }
                const durationMs = Math.round(performance.now() - start);
                const details = tokenDetails(completion.usage);
                const promptTokens = Number(completion.usage?.prompt_tokens ?? completion.usage?.input_tokens ?? 0) || countMessages(body.messages, { model: parsed.modelId, provider: provider.name });
                const completionTokens = Number(completion.usage?.completion_tokens ?? completion.usage?.output_tokens ?? 0) || countCompletion(completion.choices?.[0]?.message?.content ?? "", { model: parsed.modelId, provider: provider.name });
                const usage = usageService.record(
                  provider.id,
                  modelRecord?.id ?? parsed.modelId,
                  parsed.modelId,
                  promptTokens,
                  completionTokens,
                  durationMs,
                  durationMs,
                  details,
                );
                requestLogService.complete(requestLogId, {
                  promptTokens,
                  completionTokens,
                  cacheRead: details.cacheRead,
                  cacheWrite: details.cacheWrite,
                  cost: usage.estimated_cost_usd,
                  durationMs,
                });
                credentialService.clearError(credential.id);
                return fixThinkTag(completion);
              }
              return recordSseUsageResponse(fixThinkTagStream(cleanQwenStream(response)), (promptTokens, completionTokens, durationMs, generationDurationMs, details) => {
                const usage = usageService.record(provider.id, modelRecord?.id ?? parsed.modelId, parsed.modelId, promptTokens, completionTokens, durationMs, generationDurationMs, details);
                requestLogService.complete(requestLogId, { promptTokens, completionTokens, cacheRead: details?.cacheRead, cacheWrite: details?.cacheWrite, cost: usage.estimated_cost_usd, durationMs });
              }, start, undefined, { messages: body.messages, model: parsed.modelId, provider: provider.name });
            } catch (error: any) {
              failures.push(error);
              requestLogService.captureError(requestLogId, error);
              credentialService.markError(credential.id, error.message);
              if (isAbortError(error) || !isTransientProviderError(error) || provider.credential_mode !== "round_robin") break;
              const next = credentialService.select(provider.id, "round_robin", null, requestSequence);
              if (!next || attempted.has(next.id)) break;
              credential = next;
              requestLogService.setCredential(requestLogId, credential);
            }
          }
          const statusCode = failureStatus(failures);
          set.status = statusCode;
          requestLogService.complete(requestLogId, { status: "error", statusCode, error: errorMessage(failures.at(-1)) });
          return { error: "Qwen request failed", message: errorMessage(failures.at(-1)) };
        }

        if (provider.protocol === "conol") {
          const attempted = new Set<string>();
          const failures: unknown[] = [];
          while (credential && !attempted.has(credential.id)) {
            attempted.add(credential.id);
            try {
              const start = performance.now();
              const conolModel = conolModelMetadataFromId(parsed.modelId) ?? { agentModel: parsed.modelId };
              const result = await conolResponses(body, conolModel, credential, provider.base_url, request.signal);
              const modelRecord = modelService.findByProviderAndModel(provider.id, parsed.modelId);
              const credentialId = credential.id;
              if (!body.stream) {
                const durationMs = Math.round(performance.now() - start);
                const completion = result as any;
                const promptTokens = countMessages(body.messages, { model: parsed.modelId, provider: provider.name });
                const completionText = completion.choices?.[0]?.message?.content ?? "";
                const completionTokens = countCompletion(completionText, { model: parsed.modelId, provider: provider.name });
                const usage = usageService.record(provider.id, modelRecord?.id ?? parsed.modelId, parsed.modelId, promptTokens, completionTokens, durationMs, durationMs, { cacheRead: 0, cacheWrite: 0 });
                requestLogService.complete(requestLogId, { promptTokens, completionTokens, cost: usage.estimated_cost_usd, durationMs });
                credentialService.clearError(credentialId);
                credentialService.clearCooldown(credentialId);
                return fixThinkTag(completion);
              }
              return recordSseUsageResponse(fixThinkTagStream(result as Response), (promptTokens, completionTokens, durationMs, generationDurationMs, details) => {
                const usage = usageService.record(provider.id, modelRecord?.id ?? parsed.modelId, parsed.modelId, promptTokens, completionTokens, durationMs, generationDurationMs, details);
                requestLogService.complete(requestLogId, { promptTokens, completionTokens, cacheRead: details?.cacheRead, cacheWrite: details?.cacheWrite, cost: usage.estimated_cost_usd, durationMs });
                credentialService.clearError(credentialId);
                credentialService.clearCooldown(credentialId);
              }, start, (error) => {
                credentialService.markError(credentialId, error.message);
                requestLogService.complete(requestLogId, { status: "error", statusCode: 502, error: error.message });
              }, { messages: body.messages, model: parsed.modelId, provider: provider.name });
            } catch (error: any) {
              failures.push(error);
              requestLogService.captureError(requestLogId, error);
              credentialService.markError(credential.id, error.message);
              if (isAbortError(error) || !isTransientProviderError(error) || provider.credential_mode !== "round_robin") break;
              credentialService.markCooldown(credential.id, 10, error.message, requestSequence);
              const next = credentialService.select(provider.id, "round_robin", null, requestSequence);
              if (!next || attempted.has(next.id)) break;
              credential = next;
              requestLogService.setCredential(requestLogId, credential);
            }
          }
          const statusCode = failureStatus(failures);
          set.status = statusCode;
          requestLogService.complete(requestLogId, { status: "error", statusCode, error: errorMessage(failures.at(-1)) });
          return { error: "Conol request failed", message: errorMessage(failures.at(-1)) };
        }

        if (provider.protocol === "atomesus") {
          const attempted = new Set<string>();
          const failures: unknown[] = [];
          while (credential && !attempted.has(credential.id)) {
            attempted.add(credential.id);
            try {
              const start = performance.now();
              const result = await atomesusResponses(body, parsed.modelId, credential, provider.base_url);
              const durationMs = Math.round(performance.now() - start);
              credentialService.clearError(credential.id);
              credentialService.clearCooldown(credential.id);
              requestLogService.complete(requestLogId, { durationMs });
              return body.stream
                ? fixThinkTagStream(result as Response)
                : fixThinkTag(result);
            } catch (error: any) {
              failures.push(error);
              requestLogService.captureError(requestLogId, error);
              credentialService.markError(credential.id, error.message);
              if (isAbortError(error) || !isTransientProviderError(error) || provider.credential_mode !== "round_robin") break;
              credentialService.markCooldown(credential.id, 10, error.message, requestSequence);
              const next = credentialService.select(provider.id, "round_robin", null, requestSequence);
              if (!next || attempted.has(next.id)) break;
              credential = next;
              requestLogService.setCredential(requestLogId, credential);
            }
          }
          const statusCode = failureStatus(failures);
          set.status = statusCode;
          requestLogService.complete(requestLogId, { status: "error", statusCode, error: errorMessage(failures.at(-1)) });
          return { error: "Atomesus request failed", message: errorMessage(failures.at(-1)) };
        }

        if (provider.protocol === "chatgpt") {
          const attempted = new Set<string>();
          const failures: unknown[] = [];
          while (credential && !attempted.has(credential.id)) {
            attempted.add(credential.id);
            try {
              const start = performance.now();
              const upstream = await chatgptResponses(
                body,
                parsed.modelId,
                credential,
                provider.base_url,
              );
              requestLogService.captureResponse(requestLogId, { status: upstream.status, headers: upstream.headers, contentType: upstream.headers.get("content-type"), streaming: Boolean(body.stream) });
              const modelRecord = modelService.findByProviderAndModel(
                provider.id,
                parsed.modelId,
              );
              const credentialId = credential.id;
              const conversationFingerprintValue = body.stream
                ? await conversationFingerprint(
                    body,
                    parsed.modelId,
                    normalizeChatGptAuth(credential).accountId,
                  )
                : null;
              if (!body.stream) {
                const completion = await upstream.json();
                const durationMs = Math.round(performance.now() - start);
                const details = tokenDetails(completion.usage);
                const usage = usageService.record(
                  provider.id,
                  modelRecord?.id ?? parsed.modelId,
                  parsed.modelId,
                  completion.usage?.prompt_tokens ?? 0,
                  completion.usage?.completion_tokens ?? 0,
                  durationMs,
                  durationMs,
                  details,
                );
                requestLogService.complete(requestLogId, {
                  promptTokens: completion.usage?.prompt_tokens,
                  completionTokens: completion.usage?.completion_tokens,
                  cacheRead: details.cacheRead,
                  cacheWrite: details.cacheWrite,
                  cost: usage.estimated_cost_usd,
                  durationMs,
                });
                credentialService.clearError(credentialId);
                credentialService.clearCooldown(credentialId);
                return fixThinkTag(completion);
              }
              return recordSseUsageResponse(
                fixThinkTagStream(chatgptStreamToOpenAI(
                  upstream,
                  parsed.modelId,
                  (conversationId) => {
                    if (conversationFingerprintValue)
                      conversationIdCache.set(
                        conversationFingerprintValue,
                        conversationId,
                      );
                  },
                )),
                (
                  promptTokens,
                  completionTokens,
                  durationMs,
                  generationDurationMs,
                  details,
                ) => {
                  const usage = usageService.record(
                    provider.id,
                    modelRecord?.id ?? parsed.modelId,
                    parsed.modelId,
                    promptTokens,
                    completionTokens,
                    durationMs,
                    generationDurationMs,
                    details,
                  );
                  requestLogService.complete(requestLogId, {
                    promptTokens,
                    completionTokens,
                    cacheRead: details?.cacheRead,
                    cacheWrite: details?.cacheWrite,
                    cost: usage.estimated_cost_usd,
                    durationMs,
                  });
                  credentialService.clearError(credentialId);
                  credentialService.clearCooldown(credentialId);
                },
                start,
              );
            } catch (error: any) {
              failures.push(error);
              requestLogService.captureError(requestLogId, error);
              credentialService.markError(credential.id, error.message);
              if (isAbortError(error) || !isTransientProviderError(error) || provider.credential_mode !== "round_robin") break;
              credentialService.markCooldown(
                credential.id,
                10,
                error.message,
                requestSequence,
              );
              const next = credentialService.select(
                provider.id,
                "round_robin",
                null,
                requestSequence,
              );
              if (!next || attempted.has(next.id)) break;
              credential = next;
              requestLogService.setCredential(requestLogId, credential);
            }
          }
          const statusCode = failureStatus(failures);
          set.status = statusCode;
          requestLogService.complete(requestLogId, {
            status: "error",
            statusCode,
            error: errorMessage(failures.at(-1)),
          });
          return { error: "ChatGPT request failed", message: errorMessage(failures.at(-1)) };
        }

        // Handle streaming
        if (body.stream) {
          const attempted = new Set<string>();
          const failures: unknown[] = [];
          while (credential && !attempted.has(credential.id))
            try {
              attempted.add(credential.id);
              const credentialId = credential.id;
              const start = performance.now();
              const client = createOpenAIClient({ ...provider, api_key: credential.secret ?? "" }, credential.secret ?? "", headers["x-opencode-session"]);
              const stream = (await client!.chat.completions.create(
                { ...payload, stream: true, stream_options: { include_usage: true } },
                { signal: request.signal },
              )) as any;

              return openAIStreamResponse(
                fixThinkTagAsyncIterable(
                  stream,
                  modelRecord.think_opening_tag_mode,
                ),
                {
                start,
                tokenDetails,
                signal: request.signal,
                onComplete: ({
                  promptTokens,
                  completionTokens,
                  cacheRead,
                  cacheWrite,
                  durationMs,
                  generationDurationMs,
                }) => {
                  const usage = usageService.record(
                    provider.id,
                    modelRecord?.id ?? parsed.modelId,
                    parsed.modelId,
                    promptTokens,
                    completionTokens,
                    durationMs,
                    generationDurationMs,
                    { cacheRead, cacheWrite },
                  );
                  requestLogService.complete(requestLogId, {
                    promptTokens,
                    completionTokens,
                    cacheRead,
                    cacheWrite,
                    cost: usage.estimated_cost_usd,
                    durationMs,
                  });
                  credentialService.clearError(credentialId);
                  credentialService.clearCooldown(credentialId);
                },
                onError: (error, stats) => {
                  credentialService.markError(credentialId, error.message);
                  requestLogService.complete(requestLogId, {
                    status: "error",
                    statusCode: 502,
                    promptTokens: stats.promptTokens,
                    completionTokens: stats.completionTokens,
                    cacheRead: stats.cacheRead,
                    cacheWrite: stats.cacheWrite,
                    durationMs: stats.durationMs,
                    error: error.message,
                  });
                },
                onCancel: (stats) => {
                  requestLogService.complete(requestLogId, {
                    status: "error",
                    statusCode: 499,
                    promptTokens: stats.promptTokens,
                    completionTokens: stats.completionTokens,
                    cacheRead: stats.cacheRead,
                    cacheWrite: stats.cacheWrite,
                    durationMs: stats.durationMs,
                    error: "Client disconnected",
                  });
                },
              });
            } catch (error: any) {
              failures.push(error);
              requestLogService.captureError(requestLogId, error);
              credentialService.markError(credential.id, error.message);
              if (isAbortError(error) || !isTransientProviderError(error) || provider.credential_mode !== "round_robin") break;
              credentialService.markCooldown(
                credential.id,
                10,
                error.message,
                requestSequence,
              );
              const next = credentialService.select(
                provider.id,
                "round_robin",
                null,
                requestSequence,
              );
              if (!next || attempted.has(next.id)) break;
              credential = next;
              requestLogService.setCredential(requestLogId, credential);
            }
          const lastFailure = errorMessage(failures.at(-1));
          const statusCode = failureStatus(failures);
          requestLogService.complete(requestLogId, {
            status: "error",
            statusCode,
            error: lastFailure,
          });
          set.status = statusCode;
          return {
            error: "Provider request failed",
            message: `All ${attempted.size} available credentials failed. ${lastFailure}`,
          };
        }

        // Non-streaming
        {
          const attempted = new Set<string>();
          const failures: unknown[] = [];
          while (credential && !attempted.has(credential.id))
            try {
              attempted.add(credential.id);
              const start = performance.now();
              const completion = await createOpenAIClient({
                ...provider,
                api_key: credential.secret ?? "",
              }, credential.secret ?? "", headers["x-opencode-session"]).chat.completions.create(payload, { signal: request.signal });
              const durationMs = Math.round(performance.now() - start);

              // Record token usage
              const modelRecord = modelService.findByProviderAndModel(
                provider.id,
                parsed.modelId,
              );
              const usage = usageService.record(
                provider.id,
                modelRecord?.id ?? parsed.modelId,
                parsed.modelId,
                completion.usage?.prompt_tokens ?? 0,
                completion.usage?.completion_tokens ?? 0,
                durationMs,
                durationMs,
                tokenDetails(completion.usage),
              );
              const details = tokenDetails(completion.usage);
              requestLogService.complete(requestLogId, {
                promptTokens: completion.usage?.prompt_tokens,
                completionTokens: completion.usage?.completion_tokens,
                cacheRead: details.cacheRead,
                cacheWrite: details.cacheWrite,
                cost: usage.estimated_cost_usd,
                durationMs,
              });

              credentialService.clearError(credential.id);
              return fixThinkTag(completion);
            } catch (error: any) {
              failures.push(error);
              requestLogService.captureError(requestLogId, error);
              credentialService.markError(credential.id, error.message);
              if (isAbortError(error) || !isTransientProviderError(error) || provider.credential_mode !== "round_robin") break;
              credentialService.markCooldown(
                credential.id,
                10,
                error.message,
                requestSequence,
              );
              const next = credentialService.select(
                provider.id,
                "round_robin",
                null,
                requestSequence,
              );
              if (!next || attempted.has(next.id)) break;
              credential = next;
              requestLogService.setCredential(requestLogId, credential);
            }
          const lastFailure = errorMessage(failures.at(-1));
          const statusCode = failureStatus(failures);
          requestLogService.complete(requestLogId, {
            status: "error",
            statusCode,
            error: lastFailure,
          });
          set.status = statusCode;
          return {
            error: "Provider request failed",
            message: `All ${attempted.size} available credentials failed. ${lastFailure}`,
          };
        }
      },
      {
        // Keep the proxy forward-compatible with new OpenAI fields. The
        // payload is validated at runtime below for the required fields and
        // all optional fields are forwarded without being dropped.
        body: t.Any(),
      },
    );
