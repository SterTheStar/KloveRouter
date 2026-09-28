import { Elysia, t } from "elysia";
import { config } from "../config";
import { keyService } from "../services/key.service";
import { chatService } from "../services/chat.service";
import { chatTitleService } from "../services/chat-title.service";
import { countMessages, countCompletion } from "../services/token-counter/token-counter";
import { createSseSplitter, extractSseData, SSE_DONE } from "../services/sse";
import { getDb } from "../db/connection";
import { logger } from "../logger";
import { chatGenerationService } from "../services/chat-generation.service";

const DONE_MARKER = "data: [DONE]\n\n";

function statsEvent(input: Record<string, unknown>): string {
  return `data: ${JSON.stringify(input)}\n\n`;
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text?: unknown } => part?.type === "text")
    .map((part) => typeof part.text === "string" ? part.text : "")
    .join("\n")
    .trim();
}

export function withUsageStreamOptions<T extends Record<string, any>>(input: T): T & {
  stream: true;
  stream_options: Record<string, unknown> & { include_usage: true };
} {
  return {
    ...input,
    stream: true,
    stream_options: {
      ...(input.stream_options && typeof input.stream_options === "object" ? input.stream_options : {}),
      include_usage: true,
    },
  } as T & { stream: true; stream_options: Record<string, unknown> & { include_usage: true } };
}

export function startTitleGeneration(
  titleGenerator: () => Promise<string>,
  onTitle: (title: string) => void,
): void {
  void titleGenerator().then(onTitle).catch(() => undefined);
}

/**
 * Wraps the proxy's OpenAI-compatible SSE stream to hand the chat UI a final
 * `klove_stats` event with the token accounting the proxy already computed.
 *
 * The proxy records usage and duration server-side through the existing
 * usage/request-log pipeline, but that state is not observable from the
 * streamed response (and not every upstream emits a usage chunk). This helper
 * sniffs the OpenAI chunks while forwarding them unchanged and emits one last
 * event before `[DONE]` carrying prompt/completion tokens, wall time and
 * tokens per second. When the upstream never reports usage (some providers
 * omit it) it falls back to the same character-based estimate `openai-stream`
 * uses so the panel still shows a rate.
 */
function chatStatsStream(
  response: Response,
  model: string,
  messages: unknown,
  chatId?: string,
  assistantMessageId?: string,
  onFinish?: (() => void) | undefined,
  generationSignal?: AbortSignal,
): Response {
  const reader = response.body?.getReader();
  if (!reader) {
    const error = "Provider returned an empty response body instead of a stream.";
    if (assistantMessageId) chatService.setMessageError(assistantMessageId, error);
    onFinish?.();
    return new Response(statsEvent({ error: { message: error } }) + DONE_MARKER, {
      status: 502,
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
    });
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const splitEvent = createSseSplitter();
  const start = performance.now();
  let promptTokens = 0;
  let completionTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let assistantContent = "";
  let assistantReasoning = "";
  let assistantError: string | null = null;
  let sawUsage = false;
  let usageEmitted = false;
  let statsEmitted = false;
  let receivedDone = false;
  let streamOpen = true;
  let clientConnected = true;
  let sawToolOrRefusalOutput = false;
  let lastProgressPersist = start;

  const enqueue = (controller: ReadableStreamDefaultController, value: Uint8Array) => {
    if (!clientConnected) return;
    try {
      controller.enqueue(value);
    } catch {
      clientConnected = false;
    }
  };

  const persistProgress = (force = false) => {
    if (!assistantMessageId) return;
    const now = performance.now();
    if (!force && now - lastProgressPersist < 250) return;
    lastProgressPersist = now;
    chatService.updateMessage(assistantMessageId, {
      content: assistantContent,
      reasoning: assistantReasoning,
      ...(assistantError ? { error: assistantError } : {}),
    }, { index: false });
  };

  const emitStats = (controller?: ReadableStreamDefaultController) => {
    if (statsEmitted) return;
    statsEmitted = true;
    if (!sawUsage) {
      promptTokens = countMessages(messages, { model });
      completionTokens = countCompletion(assistantContent + assistantReasoning, { model });
    }
    const durationMs = Math.round(performance.now() - start);
    const tps =
      durationMs > 0 && completionTokens > 0
        ? Number((completionTokens / (durationMs / 1000)).toFixed(2))
        : 0;
    const stats = {
      type: "klove_stats",
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      cache_read_tokens: cacheReadTokens,
      cache_write_tokens: cacheWriteTokens,
      duration_ms: durationMs,
      tps,
    };
    if (assistantMessageId) {
      if (assistantError && controller && streamOpen) {
        enqueue(controller, encoder.encode(statsEvent({ type: "klove_chat_error", message: assistantError })));
      }
      chatService.updateMessage(assistantMessageId, {
        content: assistantContent,
        reasoning: assistantReasoning,
        stats,
        ...(assistantError ? { error: assistantError } : {}),
      });
    }
    if (controller && streamOpen) enqueue(controller, encoder.encode(statsEvent(stats)));
  };

  const emitUsage = (controller: ReadableStreamDefaultController) => {
    if (usageEmitted) return;
    usageEmitted = true;
    enqueue(controller, encoder.encode(statsEvent({
      type: "klove_usage",
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      cache_read_tokens: cacheReadTokens,
      cache_write_tokens: cacheWriteTokens,
    })));
  };

  const sniff = (chunk: any, controller: ReadableStreamDefaultController) => {
              if (chunk?.error && !assistantError) {
      assistantError = typeof chunk.error === "string"
        ? chunk.error
        : chunk.error.message ?? "Chat request failed";
    }
    const usage = chunk?.usage;
    if (usage) {
      sawUsage = true;
      promptTokens = Number(
        usage.prompt_tokens ?? usage.input_tokens ?? promptTokens,
      );
      completionTokens = Number(
        usage.completion_tokens ?? usage.output_tokens ?? completionTokens,
      );
      cacheReadTokens = Number(
        usage.prompt_tokens_details?.cached_tokens ??
          usage.input_tokens_details?.cached_tokens ??
          usage.cache_read_input_tokens ??
          usage.cache_read_tokens ??
          usage.cached_input_tokens ??
          usage.cached_tokens ??
          0,
      );
      cacheWriteTokens = Number(
        usage.cache_creation_input_tokens ??
          usage.cache_creation_input_tokens_details?.cached_tokens ??
          usage.cache_write_tokens ??
          usage.cache_write_input_tokens ??
          0,
      );
      emitUsage(controller);
    }
    for (const choice of chunk?.choices ?? []) {
      const delta = choice?.delta;
      if (delta?.tool_calls?.length || delta?.function_call || delta?.refusal) sawToolOrRefusalOutput = true;
      if (typeof delta?.content === "string") {
        // OpenAI-compatible streams contain incremental deltas. Trying to
        // infer cumulative chunks from matching text drops legitimate repeats
        // (for example "ha", "ha" becoming only "ha").
        const contentDelta = delta.content;
        assistantContent += contentDelta;
      }
      if (typeof delta?.reasoning_content === "string") {
        const reasoningDelta = delta.reasoning_content;
        assistantReasoning += reasoningDelta;
      }
    }
  };

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            const events = splitEvent(
              decoder.decode(value ?? new Uint8Array(), { stream: !done }),
            );
            for (const event of events) {
              const raw = extractSseData(event);
              // SSE comments (": connected", keep-alives) are forwarded so
              // the panel connection stays alive while the upstream idles.
              if (!raw) {
                 enqueue(controller, encoder.encode(`${event}\n\n`));
                continue;
              }
              if (raw === SSE_DONE) {
                receivedDone = true;
                if (!assistantContent.trim() && !assistantReasoning.trim() && !sawToolOrRefusalOutput && !assistantError) {
                  assistantError = "The model returned an empty response: no text, reasoning, tool call, or refusal was received.";
                }
                persistProgress(true);
                emitStats(controller);
                enqueue(controller, encoder.encode(DONE_MARKER));
                continue;
              }
              let chunk: any;
              try {
                chunk = JSON.parse(raw);
              } catch {
                // Forward non-JSON events verbatim.
                 enqueue(controller, encoder.encode(`data: ${raw}\n\n`));
                continue;
              }
              if (
                chunk.type === "klove_stats" ||
                chunk.usage ||
                chunk.error ||
                Array.isArray(chunk.choices)
              ) {
                sniff(chunk, controller);
                persistProgress();
              }
              enqueue(controller, encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            }
            if (done) break;
          }
          // Upstream ended without a [DONE] marker — emit stats anyway.
          if (!receivedDone) {
            assistantError = generationSignal?.aborted
              ? String(generationSignal.reason?.message ?? "Generation stopped by user. The partial response was saved.")
              : assistantError ?? "Chat stream ended before completion: the provider closed the stream without a [DONE] event.";
          }
          else if (!assistantContent.trim() && !assistantReasoning.trim() && !sawToolOrRefusalOutput && !assistantError) {
            assistantError = "The model returned an empty response: no text, reasoning, tool call, or refusal was received.";
          }
          persistProgress(true);
          emitStats(controller);
        } catch (error: any) {
          assistantError = generationSignal?.aborted
            ? String(generationSignal.reason?.message ?? "Generation stopped by user. The partial response was saved.")
            : error?.message ?? "Chat stream interrupted";
          persistProgress(true);
          if (streamOpen) {
             enqueue(controller,
               encoder.encode(
                statsEvent({
                  error: {
                    message:
                      assistantError,
                  },
                }),
              ),
            );
            emitStats(controller);
          }
        } finally {
          onFinish?.();
           if (streamOpen && clientConnected) {
             streamOpen = false;
             try { controller.close(); } catch { /* consumer already disconnected */ }
          }
        }
      },
      cancel(reason) {
        // A disconnected tab must not cancel generation. The detached reader
        // continues draining the proxy and persists every chunk. Only the
        // explicit stop endpoint below aborts the upstream request.
        clientConnected = false;
        logger.info("Chat response consumer disconnected; generation continues", {
          chat_id: chatId,
          assistant_message_id: assistantMessageId,
          reason: reason instanceof Error ? reason.message : reason,
        });
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    },
  );
}

/**
 * Panel chat endpoint. Reuses the whole public routing pipeline by calling
 * `/v1/chat/completions` over loopback with the panel's internal key, so
 * credentials, round-robin, validation, RTK/Caveman/skills injection, usage
 * accounting and request logs behave exactly like API-key traffic.
 */
export const chatPlugin = (app: Elysia) =>
  app.post(
    "/api/chat/completions",
    async ({ body, set }) => {
      if (
        !body ||
        typeof body !== "object" ||
        typeof (body as any).model !== "string" ||
        !(body as any).model.trim() ||
        !Array.isArray((body as any).messages)
      ) {
        set.status = 400;
        return { error: "Invalid request", message: "model and messages are required" };
      }

      const input = body as any;
      const chatId = typeof input.chat_id === "string" ? input.chat_id : undefined;
      if (!input.messages.length || input.messages.some((message: any) =>
        !message || typeof message !== "object" ||
        !["user", "assistant", "system", "tool", "developer"].includes(message.role) ||
        message.content === undefined ||
        (typeof message.role === "string" && message.role !== "assistant" &&
          message.role !== "user" && message.role !== "system" && message.role !== "developer" &&
          typeof message.tool_call_id !== "string")
      )) {
        set.status = 400;
        return { error: "Invalid request", message: "messages must contain valid roles and content" };
      }
      // Regenerate/edit-resend: the user message is already persisted, so only
      // the assistant placeholder is added.
      const regenerate = input.regenerate === true;
      let assistantMessageId: string | undefined;
      let titleGenerator: (() => Promise<string>) | undefined;
      let titleMessage: string | undefined;
      let shouldGenerateTitle = false;
      if (chatId) {
        if (!chatService.findById(chatId)) {
          set.status = 404;
          return { error: "Chat not found" };
        }
        if (chatService.get(chatId)?.messages.some((message) =>
          message.role === "assistant" && !message.stats && !message.error && chatGenerationService.isActive(chatId, message.id),
        )) {
          set.status = 409;
          return { error: "Generation already active", message: "This conversation is already generating a response" };
        }
        if (regenerate && typeof input.assistant_message_id !== "string") {
          set.status = 400;
          return { error: "Invalid request", message: "assistant_message_id is required to regenerate" };
        }
        if (
          typeof input.assistant_message_id === "string" &&
          chatService.findMessageInChat(chatId, input.assistant_message_id)
        ) {
          set.status = 409;
          return { error: "Duplicate message id", message: "This assistant message already exists" };
        }
        const lastMessage = input.messages.at(-1);
        if (!regenerate && lastMessage?.role !== "user") {
          set.status = 400;
          return { error: "Invalid request", message: "the final message must be from the user" };
        }
        if (regenerate) {
          if (lastMessage?.role !== "user") {
            set.status = 400;
            return { error: "Invalid request", message: "the final message must be the user prompt being retried" };
          }
          const storedMessages = chatService.get(chatId)?.messages ?? [];
          if (storedMessages.at(-1)?.role !== "user") {
            set.status = 409;
            return { error: "Invalid conversation state", message: "The conversation no longer ends with a user prompt" };
          }
        }
        if (!regenerate) {
          const userMessage = chatService.addMessage({
            chatId,
            role: "user",
            content: lastMessage?.content ?? "",
            attachments: input.attachments,
          });
          if (!userMessage) {
            set.status = 404;
            return { error: "Chat not found" };
          }
        }
        titleMessage = textFromContent(lastMessage?.content);
        if (!titleMessage && input.attachments?.length) {
          const names = input.attachments
            .map((attachment: any) => typeof attachment?.name === "string" ? attachment.name : "")
            .filter(Boolean)
            .slice(0, 8);
          titleMessage = names.length ? `Conversation about these files: ${names.join(", ")}` : "Conversation about an attached image";
        }
        shouldGenerateTitle = Boolean(
          titleMessage && chatService.findById(chatId)?.title === "New chat",
        );
        assistantMessageId = typeof input.assistant_message_id === "string"
          ? input.assistant_message_id
          : crypto.randomUUID();
        chatService.addMessage({
          chatId,
          id: assistantMessageId,
          role: "assistant",
          content: "",
        });
      }

      if (chatId) {
        getDb()
          .query(
            `UPDATE chat_sessions SET model = ?, updated_at = datetime('now')
             WHERE id = ? AND EXISTS (
               SELECT 1 FROM settings
               WHERE key = 'persist_model_per_chat' AND value = 'true'
             )`,
          )
        .run(input.model, chatId);
      }

        if (shouldGenerateTitle && titleMessage && !regenerate) {
        titleGenerator = () => chatTitleService.generate(titleMessage!, input.model);
      }

      const generationController = new AbortController();
      if (chatId && assistantMessageId) {
        chatGenerationService.start(chatId, assistantMessageId, generationController);
      }
      if (titleGenerator && chatId) {
        startTitleGeneration(titleGenerator, (title) => {
          chatService.setGeneratedTitle(chatId!, title);
        });
      }
      let response: Response;
      try {
        response = await fetch(
          `http://127.0.0.1:${config.port}/v1/chat/completions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
              Authorization: `Bearer ${keyService.internalKey()}`,
            },
            signal: generationController.signal,
            body: JSON.stringify(withUsageStreamOptions(input)),
          },
        );
      } catch (error: any) {
        const message = error?.message ?? "Could not connect to the chat service";
        if (assistantMessageId) chatService.updateMessage(assistantMessageId, { error: message });
        if (chatId && assistantMessageId) chatGenerationService.finish(chatId, assistantMessageId);
        set.status = 502;
        return { error: "Chat request failed", message };
      }

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message =
          data?.message ||
          (typeof data?.error === "string" ? data.error : undefined) ||
          `HTTP ${response.status}: ${response.statusText}`;
        if (assistantMessageId) chatService.updateMessage(assistantMessageId, { error: message });
        if (chatId && assistantMessageId) chatGenerationService.finish(chatId, assistantMessageId);
        set.status = response.status;
        return {
          error: data?.error || "Chat request failed",
          message,
        };
      }

      return chatStatsStream(
        response,
        input.model,
        input.messages,
        chatId,
        assistantMessageId,
        chatId && assistantMessageId
          ? () => chatGenerationService.finish(chatId!, assistantMessageId!)
          : undefined,
        generationController.signal,
      );
    },
    {
      // Forward-compatible like the proxy: required fields are validated at
      // runtime and everything else (temperature, reasoning, tools, ...) is
      // passed through untouched.
      body: t.Any(),
    },
  );

export const chatControlPlugin = (app: Elysia) =>
  app.get(
    "/api/chats/:id/messages/:messageId/stream",
    ({ params, set }) => {
      const initial = chatService.findMessageInChat(params.id, params.messageId);
      if (!initial || initial.role !== "assistant") {
        set.status = 404;
        return { error: "Assistant response not found" };
      }
      let closed = false;
      return new Response(new ReadableStream<Uint8Array>({
        async start(controller) {
          const encoder = new TextEncoder();
          let content = typeof initial.content === "string" ? initial.content : "";
          let reasoning = initial.reasoning ?? "";
          let lastError: string | null = null;
          let statsSent = false;
          const send = (value: Record<string, unknown>) => {
            if (!closed) {
              try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`)); }
              catch { closed = true; }
            }
          };
          try {
            while (!closed) {
              const message = chatService.findMessageInChat(params.id, params.messageId);
              if (!message) {
                send({ error: { message: "Assistant response was deleted while generation was active" } });
                break;
              }
              const nextContent = typeof message.content === "string" ? message.content : "";
              if (nextContent.startsWith(content) && nextContent.length > content.length) {
                send({ choices: [{ delta: { content: nextContent.slice(content.length) } }] });
              } else if (nextContent !== content) {
                send({ type: "klove_chat_snapshot", content: nextContent });
              }
              content = nextContent;
              const nextReasoning = message.reasoning ?? "";
              if (nextReasoning.startsWith(reasoning) && nextReasoning.length > reasoning.length) {
                send({ choices: [{ delta: { reasoning_content: nextReasoning.slice(reasoning.length) } }] });
              } else if (nextReasoning !== reasoning) {
                send({ type: "klove_chat_reasoning_snapshot", reasoning: nextReasoning });
              }
              reasoning = nextReasoning;
              const active = chatGenerationService.isActive(params.id, params.messageId);
              if (message.error && !active && message.error !== lastError) {
                send({ type: "klove_chat_error", message: message.error });
                lastError = message.error;
              }
              if (message.stats && !statsSent) {
                send({ type: "klove_stats", ...(message.stats as Record<string, unknown>) });
                statsSent = true;
              }
              if (message.stats || !active) break;
              await new Promise((resolve) => setTimeout(resolve, 300));
            }
            if (!closed) {
              try { controller.enqueue(encoder.encode("data: [DONE]\n\n")); }
              catch { closed = true; }
            }
          } catch (error: any) {
            send({ error: { message: error?.message ?? "Could not resume chat stream" } });
            if (!closed) {
              try { controller.enqueue(encoder.encode("data: [DONE]\n\n")); }
              catch { closed = true; }
            }
          } finally {
            if (!closed) {
              closed = true;
              try { controller.close(); } catch { /* consumer disconnected */ }
            }
          }
        },
        cancel() { closed = true; },
      }), {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    },
    { params: t.Object({ id: t.String({ minLength: 1 }), messageId: t.String({ minLength: 1 }) }) },
  ).post(
    "/api/chats/:id/messages/:messageId/stop",
    ({ params, set }) => {
      const message = chatService.findMessageInChat(params.id, params.messageId);
      if (!message || message.role !== "assistant" || message.stats || message.error) {
        set.status = 409;
        return { error: "Generation is not active", message: "This response is already finished" };
      }
      if (!chatGenerationService.isActive(params.id, params.messageId)) {
        set.status = 409;
        return { error: "Generation not found", message: "The active generation could not be found" };
      }
      chatService.setMessageError(params.messageId, "Generation stopped by user. The partial response was saved.");
      chatGenerationService.stop(params.id, params.messageId);
      return { success: true };
    },
    {
      params: t.Object({ id: t.String({ minLength: 1 }), messageId: t.String({ minLength: 1 }) }),
    },
  );
