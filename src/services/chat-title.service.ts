import { config } from "../config";
import { getDb } from "../db/connection";
import { keyService } from "./key.service";
import { modelService, providerModelPublicId } from "./model.service";
import { logger } from "../logger";

const DEFAULT_MODEL = "auto";
const FALLBACK_TITLE = "New conversation";
const FALLBACK_LIMIT = 80;
const TITLE_REQUEST_TIMEOUT_MS = 15_000;

function comparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackTitle(_message: string): string {
  return FALLBACK_TITLE;
}

function normalizeTitle(value: unknown, message: string): { title: string; fallbackReason?: string } {
  const title = String(value ?? "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[\"'“”‘’]/g, "")
    .replace(/^[#>*\-\s]+/, "")
    .replace(/[.!?;:,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 6)
    .join(" ")
    .slice(0, FALLBACK_LIMIT);
  if (!title) return { title: fallbackTitle(message), fallbackReason: "empty_response" };
  if (comparable(title) === comparable(message)) {
    return { title: fallbackTitle(message), fallbackReason: "same_as_message" };
  }
  return { title };
}

function configuredModel(activeModel: string): string | null {
  const row = getDb().query("SELECT value FROM settings WHERE key = ?").get("chat_title_model") as { value: string } | undefined;
  const setting = row?.value || DEFAULT_MODEL;
  if (setting === DEFAULT_MODEL) return activeModel;
  const models = modelService.findAllActiveWithProvider();
  return models.some((model) => providerModelPublicId(model.provider_name, model) === setting) ? setting : null;
}

export const chatTitleService = {
  async generate(message: string, activeModel: string): Promise<string> {
    const startedAt = performance.now();
    const fallback = fallbackTitle(message);
    const model = configuredModel(activeModel);
    logger.info("Chat title generation started", {
      active_model: activeModel,
      title_model: model,
      message_length: message.length,
    });
    if (!model) {
      logger.warn("Chat title generation skipped: no model configured", {
        active_model: activeModel,
        fallback_reason: "no_model",
        fallback_title: fallback,
      });
      return fallback;
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      TITLE_REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetch(`http://127.0.0.1:${config.port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${keyService.internalKey()}`,
          "X-Klove-Title-Generation": "true",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: false,
          max_tokens: 1024,
          messages: [
            {
              role: "system",
              content: "You are a conversation title generator. Detect the language of the user's message and write the title in that exact same language. Do not translate it to another language. Return only a new concise title of 2 to 6 words. Never answer or repeat the user's message.",
            },
            {
              role: "user",
              content: `Summarize this message with a different short title. Return only the title.\n\n${message.slice(0, 2000)}`,
            },
          ],
        }),
      });
      if (!response.ok) {
        logger.warn("Chat title generation upstream failed", {
          model,
          status: response.status,
          fallback_reason: `http_${response.status}`,
          duration_ms: Math.round(performance.now() - startedAt),
          fallback_title: fallback,
        });
        return fallback;
      }
      const data = await response.json() as any;
      const result = normalizeTitle(data?.choices?.[0]?.message?.content, message);
      logger.info("Chat title generation completed", {
        model,
        title: result.title,
        ...(result.fallbackReason ? { fallback_reason: result.fallbackReason } : {}),
        used_fallback: Boolean(result.fallbackReason),
        duration_ms: Math.round(performance.now() - startedAt),
      });
      return result.title;
    } catch (error) {
      const fallbackReason = controller.signal.aborted ? "timeout" : "error";
      logger.warn("Chat title generation failed", {
        model,
        error,
        fallback_reason: fallbackReason,
        duration_ms: Math.round(performance.now() - startedAt),
        fallback_title: fallback,
      });
      return fallback;
    } finally {
      clearTimeout(timeout);
    }
  },
};
