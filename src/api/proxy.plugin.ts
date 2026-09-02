import { Elysia, t } from "elysia";
import { keyService } from "../services/key.service";
import { providerService } from "../services/provider.service";
import { modelService, providerModelPublicId } from "../services/model.service";
import { usageService } from "../services/usage.service";
import { createOpenAIClient, parseModelName } from "../clients/openai";
import {
  AnthropicRequestError,
  createAnthropicMessage,
  createAnthropicStream,
  splitAnthropicMessages,
  toOpenAICompletion,
} from "../clients/anthropic";
import { codexResponses, codexStreamToOpenAI } from "../integrations/codex";
import { credentialService } from "../services/credential.service";
import { logger } from "../logger";
import { antigravityResponses } from "../integrations/antigravity";
import { isBlockedAntigravityModel } from "../integrations/antigravity";
import { requestLogService } from "../services/request-log.service";
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
import {
  chatCompletionToResponse,
  chatSseToResponses,
  responsesToChatBody,
} from "./responses-api";
import { validateChatCompletionRequest } from "./openai-request";
import {
  fixMissingThinkOpeningTag,
  fixThinkTagAsyncIterable,
  fixThinkTagSseResponse,
} from "./think-tag-fix";

function anthropicPayload(body: any, modelId: string, stream = false) {
  const messages = splitAnthropicMessages(body.messages);
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
    model: modelId,
    messages: messages.messages,
    ...(messages.system ? { system: messages.system } : {}),
    max_tokens: maxTokens,
    ...(effort === "none"
      ? { thinking: { type: "disabled" } }
      : body.thinking
      ? { thinking: body.thinking }
      : budget
        ? { thinking: { type: "enabled", budget_tokens: budget } }
        : {}),
    ...(body.temperature !== undefined
      ? { temperature: body.temperature }
      : {}),
    ...(body.top_p !== undefined ? { top_p: body.top_p } : {}),
    ...(body.stop !== undefined
      ? { stop_sequences: Array.isArray(body.stop) ? body.stop : [body.stop] }
      : {}),
    ...(body.tools?.length
      ? {
          tools: body.tools.map((tool: any) => ({
            name: tool.function?.name,
            description: tool.function?.description,
            input_schema: tool.function?.parameters ?? {
              type: "object",
              properties: {},
            },
          })),
        }
      : {}),
    ...(body.tool_choice !== undefined
      ? {
          tool_choice:
            body.tool_choice === "auto" || body.tool_choice === "none"
              ? { type: body.tool_choice }
              : body.tool_choice === "required"
                ? { type: "any" }
                : { type: "tool", name: body.tool_choice?.function?.name },
        }
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
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Anthropic returned an empty stream");
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let firstTokenAt: number | null = null;
  let closed = false;
  let usageRecorded = false;

  return new Response(
    new ReadableStream({
      async start(controller) {
        const emit = (chunk: Record<string, unknown>) => {
          if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        };
        const processEvent = (event: string) => {
          const data = event
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n");
          if (!data || data === "[DONE]") return;
          const parsed = JSON.parse(data);
          if (parsed.type === "message_start") {
            promptTokens = parsed.message?.usage?.input_tokens ?? 0;
            ({ cacheRead, cacheWrite } = tokenDetails(parsed.message?.usage));
          } else if (parsed.type === "content_block_delta" && parsed.delta?.type === "thinking_delta") {
            firstTokenAt ??= performance.now();
            emit({ id: parsed.index ?? `chatcmpl-${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index: parsed.index ?? 0, delta: { reasoning_content: parsed.delta.thinking ?? "" }, finish_reason: null }] });
          } else if (parsed.type === "content_block_delta" && parsed.delta?.text) {
            firstTokenAt ??= performance.now();
            emit({ id: parsed.index ?? `chatcmpl-${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index: parsed.index ?? 0, delta: { content: parsed.delta.text }, finish_reason: null }] });
          } else if (parsed.type === "content_block_start" && parsed.content_block?.type === "tool_use") {
            emit({ id: `chatcmpl-${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index: parsed.index ?? 0, delta: { tool_calls: [{ index: parsed.index ?? 0, id: parsed.content_block.id, type: "function", function: { name: parsed.content_block.name, arguments: "" } }] }, finish_reason: null }] });
          } else if (parsed.type === "content_block_delta" && parsed.delta?.type === "input_json_delta") {
            emit({ id: `chatcmpl-${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index: parsed.index ?? 0, delta: { tool_calls: [{ index: parsed.index ?? 0, type: "function", function: { arguments: parsed.delta.partial_json ?? "" } }] }, finish_reason: null }] });
          } else if (parsed.type === "message_delta") {
            completionTokens = parsed.usage?.output_tokens ?? completionTokens;
            ({ cacheRead, cacheWrite } = tokenDetails({ ...parsed.usage, ...parsed.message?.usage }));
            emit({ id: `chatcmpl-${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index: parsed.index ?? 0, delta: {}, finish_reason: parsed.delta?.stop_reason ?? "stop" }], usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens, prompt_tokens_details: { cached_tokens: cacheRead } } });
          }
        };
        const finish = () => {
          if (closed) return;
          closed = true;
          if (!usageRecorded) {
            usageRecorded = true;
            onUsage(promptTokens, completionTokens, Math.round(performance.now() - start), Math.round(performance.now() - (firstTokenAt ?? start)), { cacheRead, cacheWrite });
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        };
        try {
          while (true) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
            const events = buffer.split(/\r?\n\r?\n/);
            buffer = events.pop() ?? "";
            for (const event of events) processEvent(event);
            if (done) {
              if (buffer.trim()) processEvent(buffer);
              finish();
              break;
            }
          }
        } catch (error: any) {
          if (!closed) {
            closed = true;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { message: error?.message ?? String(error) } })}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        }
      },
      cancel(reason) {
        closed = true;
        onCancel?.();
        void reader.cancel(reason).catch(() => undefined);
      },
    }),
    { headers: streamingHeaders() },
  );
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
  if (!auth || !auth.startsWith("Bearer ")) {
    return null;
  }
  const key = auth.slice(7);
  return keyService.verify(key);
}

export const proxyPlugin = (app: Elysia) =>
  app
    .onError(({ error, set, request }) => {
      const pathname = new URL(request.url).pathname;
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

      const models = modelService.findAllActive();
      const providers = providerService.findAll();

      return {
        object: "list",
        data: models.map((m) => {
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
      };
    })
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
        const chatBody = responsesToChatBody(body);
        const upstreamController = new AbortController();
        const abortUpstream = () => upstreamController.abort(request.signal.reason);
        if (request.signal.aborted) abortUpstream();
        else request.signal.addEventListener("abort", abortUpstream, { once: true });
        const chatResponse = await fetch(`http://127.0.0.1:${config.port}/v1/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: headers.authorization!,
            "Content-Type": "application/json",
            Accept: body.stream ? "text/event-stream" : "application/json",
          },
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
        if (body.stream) return chatSseToResponses(chatResponse, body.model, abortUpstream);
        return chatCompletionToResponse(await chatResponse.json());
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
              const client = createOpenAIClient({
                ...provider,
                api_key: credential.secret ?? "",
              });
              const stream = (await client!.chat.completions.create(
                {
                  ...payload,
                  stream: true,
                  stream_options: { include_usage: true },
                },
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
              }).chat.completions.create(payload, { signal: request.signal });
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
