export type OpenAIStreamStats = {
  promptTokens: number;
  completionTokens: number;
  cacheRead: number;
  cacheWrite: number;
  durationMs: number;
  generationDurationMs: number;
};

type OpenAIChunkStream = AsyncIterable<any> & { controller?: AbortController };

type OpenAIStreamOptions = {
  start: number;
  tokenDetails: (usage: any) => { cacheRead: number; cacheWrite: number };
  onComplete: (stats: OpenAIStreamStats) => void;
  onError: (error: Error, stats: OpenAIStreamStats) => void;
  onCancel: (stats: OpenAIStreamStats) => void;
  now?: () => number;
};

function hasSemanticDelta(chunk: any) {
  return chunk?.choices?.some((choice: any) => {
    const delta = choice?.delta;
    return Boolean(
      delta?.content ||
      delta?.reasoning_content ||
      delta?.refusal ||
      delta?.tool_calls?.length ||
      delta?.function_call?.name ||
      delta?.function_call?.arguments,
    );
  });
}

export function openAIStreamResponse(
  stream: OpenAIChunkStream,
  options: OpenAIStreamOptions,
) {
  const encoder = new TextEncoder();
  const now = options.now ?? (() => performance.now());
  let iterator: AsyncIterator<any> | undefined;
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  let promptTokens = 0;
  let completionTokens = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let streamedChars = 0;
  let sawUsage = false;
  let firstTokenAt: number | null = null;
  let cancelled = false;
  let settled = false;

  const notify = (
    phase: "complete" | "error" | "cancel",
    callback: () => void,
  ) => {
    try {
      callback();
    } catch (error) {
      logger.error("OpenAI stream callback failed", { phase, error });
    }
  };

  const stats = (): OpenAIStreamStats => {
    const endedAt = now();
    return {
      // Without a final usage chunk (stream aborted by the client, or the
      // upstream does not report usage) fall back to a character-based
      // estimate so partial streams are not recorded as zero tokens.
      promptTokens: sawUsage ? promptTokens : 0,
      completionTokens: sawUsage
        ? completionTokens
        : Math.ceil(streamedChars / 4),
      cacheRead,
      cacheWrite,
      durationMs: Math.round(endedAt - options.start),
      generationDurationMs: Math.round(
        endedAt - (firstTokenAt ?? options.start),
      ),
    };
  };

  return new Response(
    new ReadableStream({
      start(controller) {
        const enqueue = (text: string) => {
          if (!cancelled) controller.enqueue(encoder.encode(text));
        };
        // SSE comment lines are ignored by clients but count as activity,
        // keeping read-timeouts alive while the upstream is still waiting
        // on its first chunk (slow or free-tier providers).
        controller.enqueue(encoder.encode(": connected\n\n"));
        keepAlive = setInterval(() => {
          if (!cancelled && !settled)
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
        }, 10000);
        void (async () => {
          try {
            iterator = stream[Symbol.asyncIterator]();
            while (true) {
              const { done, value: chunk } = await iterator.next();
              if (done || cancelled) break;
              if (hasSemanticDelta(chunk)) firstTokenAt ??= now();
              for (const choice of chunk.choices ?? []) {
                const delta = choice?.delta;
                if (typeof delta?.content === "string")
                  streamedChars += delta.content.length;
                if (typeof delta?.reasoning_content === "string")
                  streamedChars += delta.reasoning_content.length;
              }
              if (chunk.usage) {
                sawUsage = true;
                promptTokens = Number(
                  chunk.usage.prompt_tokens ?? promptTokens,
                );
                completionTokens = Number(
                  chunk.usage.completion_tokens ?? completionTokens,
                );
                ({ cacheRead, cacheWrite } = options.tokenDetails(chunk.usage));
              }
              enqueue(`data: ${JSON.stringify(chunk)}\n\n`);
            }
            if (!cancelled) {
              settled = true;
              enqueue("data: [DONE]\n\n");
              const finalStats = stats();
              notify("complete", () => options.onComplete(finalStats));
            }
          } catch (error: any) {
            if (!cancelled) {
              settled = true;
              const normalized =
                error instanceof Error ? error : new Error(String(error));
              enqueue(
                `data: ${JSON.stringify({ error: { message: normalized.message } })}\n\n`,
              );
              enqueue("data: [DONE]\n\n");
              const finalStats = stats();
              notify("error", () => options.onError(normalized, finalStats));
            }
          } finally {
            clearInterval(keepAlive);
            if (!cancelled) controller.close();
          }
        })();
      },
      cancel() {
        if (cancelled || settled) return;
        cancelled = true;
        clearInterval(keepAlive);
        stream.controller?.abort();
        void iterator?.return?.();
        const finalStats = stats();
        notify("cancel", () => options.onCancel(finalStats));
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
import { logger } from "../logger";
