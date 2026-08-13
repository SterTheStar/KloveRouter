import { Elysia, t } from "elysia";
import { config } from "../config";
import { keyService } from "../services/key.service";
import { chatService } from "../services/chat.service";
import { chatTitleService } from "../services/chat-title.service";

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
  chatId?: string,
  assistantMessageId?: string,
  titleGenerator?: (() => Promise<string>) | undefined,
  titleFallback = "New chat",
): Response {
  const reader = response.body?.getReader();
  if (!reader) return response;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const start = performance.now();
  let buffer = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let streamedChars = 0;
  let assistantContent = "";
  let assistantReasoning = "";
  let sawUsage = false;
  let usageEmitted = false;
  let statsEmitted = false;
  let titleEmitted = false;
  let lastProgressPersist = start;

  const persistProgress = (force = false) => {
    if (!assistantMessageId) return;
    const now = performance.now();
    if (!force && now - lastProgressPersist < 250) return;
    lastProgressPersist = now;
    chatService.updateMessage(assistantMessageId, {
      content: assistantContent,
      reasoning: assistantReasoning,
    });
  };

  const emitTitle = async (controller: ReadableStreamDefaultController) => {
    if (titleEmitted || !titleGenerator || !chatId) return;
    titleEmitted = true;
    const title = await titleGenerator();
    if (chatService.findById(chatId)?.title === "New chat") {
      const session = chatService.update(chatId, { title });
      if (session) controller.enqueue(encoder.encode(statsEvent({ type: "klove_chat_title", chat_id: chatId, title: session.title })));
    }
  };

  const emitStats = (controller: ReadableStreamDefaultController) => {
    if (statsEmitted) return;
    statsEmitted = true;
    if (!sawUsage) completionTokens = Math.ceil(streamedChars / 4);
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
      chatService.updateMessage(assistantMessageId, {
        content: assistantContent,
        reasoning: assistantReasoning,
        stats,
      });
    }
    controller.enqueue(encoder.encode(statsEvent(stats)));
  };

  const emitUsage = (controller: ReadableStreamDefaultController) => {
    if (usageEmitted) return;
    usageEmitted = true;
    controller.enqueue(encoder.encode(statsEvent({
      type: "klove_usage",
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      cache_read_tokens: cacheReadTokens,
      cache_write_tokens: cacheWriteTokens,
    })));
  };

  const sniff = (chunk: any, controller: ReadableStreamDefaultController) => {
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
      if (typeof delta?.content === "string") {
        streamedChars += delta.content.length;
        assistantContent += delta.content;
      }
      if (typeof delta?.reasoning_content === "string") {
        streamedChars += delta.reasoning_content.length;
        assistantReasoning += delta.reasoning_content;
      }
    }
  };

  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value ?? new Uint8Array(), {
              stream: !done,
            });
            const events = buffer.split("\n\n");
            buffer = events.pop() ?? "";
            for (const event of events) {
              const dataLine = event
                .split("\n")
                .find((line) => line.startsWith("data:"));
              // SSE comments (": connected", keep-alives) are forwarded so
              // the panel connection stays alive while the upstream idles.
              if (!dataLine) {
                controller.enqueue(encoder.encode(`${event}\n\n`));
                continue;
              }
              const raw = dataLine.slice(5).trim();
              if (raw === "[DONE]") {
                persistProgress(true);
                await emitTitle(controller);
                emitStats(controller);
                controller.enqueue(encoder.encode(DONE_MARKER));
                continue;
              }
              let chunk: any;
              try {
                chunk = JSON.parse(raw);
              } catch {
                // Forward non-JSON events verbatim.
                controller.enqueue(encoder.encode(`data: ${raw}\n\n`));
                continue;
              }
              if (
                chunk.type === "klove_stats" ||
                chunk.usage ||
                Array.isArray(chunk.choices)
              ) {
                sniff(chunk, controller);
                persistProgress();
              }
              controller.enqueue(encoder.encode(`data: ${raw}\n\n`));
            }
            if (done) break;
          }
          // Upstream ended without a [DONE] marker — emit title and stats anyway.
          persistProgress(true);
          await emitTitle(controller);
          if (!statsEmitted) emitStats(controller);
        } catch (error: any) {
          persistProgress(true);
          controller.enqueue(
            encoder.encode(
              statsEvent({
                error: {
                  message:
                    error?.message ?? "Chat stream interrupted",
                },
              }),
            ),
          );
          if (!statsEmitted) emitStats(controller);
        } finally {
          controller.close();
        }
      },
      cancel() {
        // Client disconnected — stop pulling from the proxy so the upstream
        // reader is released too.
        void reader.cancel();
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
        !Array.isArray((body as any).messages)
      ) {
        set.status = 400;
        return { error: "Invalid request", message: "model and messages are required" };
      }

      const input = body as any;
      const chatId = typeof input.chat_id === "string" ? input.chat_id : undefined;
      let assistantMessageId: string | undefined;
      let titleGenerator: (() => Promise<string>) | undefined;
      let titleMessage: string | undefined;
      let shouldGenerateTitle = false;
      if (chatId) {
        if (!chatService.findById(chatId)) {
          set.status = 404;
          return { error: "Chat not found" };
        }
        const lastMessage = input.messages.at(-1);
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
        titleMessage = textFromContent(lastMessage?.content);
        shouldGenerateTitle = Boolean(
          titleMessage && chatService.findById(chatId)?.title === "New chat",
        );
        assistantMessageId = crypto.randomUUID();
        chatService.addMessage({
          chatId,
          id: assistantMessageId,
          role: "assistant",
          content: "",
        });
      }

      const response = await fetch(
        `http://127.0.0.1:${config.port}/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${keyService.internalKey()}`,
          },
          body: JSON.stringify({
            ...input,
            stream: true,
            stream_options: { include_usage: true },
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        set.status = response.status;
        return {
          error: data?.error || "Chat request failed",
          message:
            data?.message ||
            (typeof data?.error === "string" ? data.error : undefined) ||
            `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      if (shouldGenerateTitle && titleMessage) {
        titleGenerator = () => chatTitleService.generate(titleMessage!, input.model);
      }

      return chatStatsStream(response, input.model, chatId, assistantMessageId, titleGenerator);
    },
    {
      // Forward-compatible like the proxy: required fields are validated at
      // runtime and everything else (temperature, reasoning, tools, ...) is
      // passed through untouched.
      body: t.Any(),
    },
  );