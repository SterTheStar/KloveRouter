import type { ClaudeAgentConnectionConfig, ClaudeAgentTurnResult } from "./claude-agent.types";
import { formatClaudeAgentPrompt } from "./claude-agent.format";
import { runClaudeAgentQuery, type RunnerChunk } from "./claude-agent.runner";
import { claudeAgentModels, probeClaudeAgent } from "./claude-agent.probe";

function sseChunk(
  id: string,
  model: string,
  created: number,
  delta: Record<string, unknown>,
  finishReason: string | null = null,
) {
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
}

function resolveModelName(value: string): string {
  let model = (value || "").trim();
  for (const prefix of ["claude-agent/", "anthropic/", "claude/"]) {
    if (model.startsWith(prefix)) model = model.slice(prefix.length);
  }
  return model || "default";
}

function parseCustomHeaders(headers: unknown): Record<string, string> | undefined {
  if (!headers) return undefined;
  if (typeof headers === "object" && !Array.isArray(headers)) {
    return headers as Record<string, string>;
  }
  if (typeof headers === "string") {
    try {
      const parsed = JSON.parse(headers);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Ignore malformed custom headers string
    }
  }
  return undefined;
}

export function extractConnectionConfig(
  credential?: { secret?: string | null; access_token?: string | null } | null,
  provider?: { base_url?: string | null; custom_headers?: unknown; api_key?: string | null } | null,
): ClaudeAgentConnectionConfig {
  const apiKey = credential?.secret?.trim() || provider?.api_key?.trim() || undefined;
  const authToken = credential?.access_token?.trim() || undefined;
  const baseURL =
    provider?.base_url && provider.base_url !== "https://api.anthropic.com"
      ? provider.base_url.trim()
      : undefined;

  return {
    apiKey,
    authToken,
    baseURL,
    headers: parseCustomHeaders(provider?.custom_headers),
  };
}

export const CLAUDE_AGENT_ENABLED = true;

export async function claudeAgentResponses(
  body: any,
  requestedModel: string,
  signal?: AbortSignal,
  credential?: { secret?: string | null; access_token?: string | null } | null,
  provider?: { base_url?: string | null; custom_headers?: unknown; api_key?: string | null } | null,
): Promise<Response> {
  const model = resolveModelName(requestedModel);
  const config = extractConnectionConfig(credential, provider);

  if (body.max_tokens || body.max_completion_tokens) {
    config.maxOutputTokens = Number(body.max_tokens || body.max_completion_tokens);
  }
  if (body.reasoning_effort || body.effort) {
    const eff = String(body.reasoning_effort || body.effort).toLowerCase();
    if (eff === "low" || eff === "medium" || eff === "high" || eff === "max") {
      config.effort = eff;
    }
  }

  const { systemPrompt, prompt } = formatClaudeAgentPrompt(
    Array.isArray(body.messages) ? body.messages : [],
    Array.isArray(body.tools) ? body.tools : undefined,
  );

  const id = `chatcmpl-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);

  if (body.stream === true) {
    const encoder = new TextEncoder();
    const abortController = new AbortController();
    const onAbort = () => abortController.abort(signal?.reason);
    signal?.addEventListener("abort", onAbort, { once: true });

    let cancelled = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (data: string) => {
          if (!cancelled) {
            controller.enqueue(encoder.encode(data));
          }
        };

        try {
          send(sseChunk(id, model, created, { role: "assistant", content: "" }));

          const result = await runClaudeAgentQuery(
            model,
            prompt,
            systemPrompt,
            config,
            abortController.signal,
            async (chunk: RunnerChunk) => {
              if (chunk.type === "text") {
                send(sseChunk(id, model, created, { content: chunk.delta }));
              } else if (chunk.type === "reasoning") {
                send(sseChunk(id, model, created, { reasoning_content: chunk.delta }));
              } else if (chunk.type === "tool_call") {
                const index = chunk.index ?? 0;
                send(
                  sseChunk(id, model, created, {
                    tool_calls: [
                      {
                        index,
                        id: chunk.id,
                        type: "function",
                        function: {
                          name: chunk.name,
                          arguments: chunk.arguments,
                        },
                      },
                    ],
                  }),
                );
              }
            },
          );

          send(sseChunk(id, model, created, {}, result.finishReason));
          send("data: [DONE]\n\n");
          if (!cancelled) controller.close();
        } catch (error: any) {
          const message = error instanceof Error ? error.message : "Claude Agent request failed";
          send(`data: ${JSON.stringify({ error: { message } })}\n\n`);
          send("data: [DONE]\n\n");
          if (!cancelled) controller.close();
        } finally {
          signal?.removeEventListener("abort", onAbort);
        }
      },
      cancel() {
        cancelled = true;
        abortController.abort(new DOMException("Stream cancelled", "AbortError"));
        signal?.removeEventListener("abort", onAbort);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // Non-streaming JSON completion:
  const result: ClaudeAgentTurnResult = await runClaudeAgentQuery(
    model,
    prompt,
    systemPrompt,
    config,
    signal,
  );

  return Response.json({
    id,
    object: "chat.completion",
    created,
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: result.content || null,
          ...(result.reasoning ? { reasoning_content: result.reasoning } : {}),
          ...(result.toolCalls.length > 0 ? { tool_calls: result.toolCalls } : {}),
        },
        finish_reason: result.finishReason,
      },
    ],
    usage: result.usage,
  });
}

export async function claudeAgentTest(
  model: string,
  credential?: { secret?: string | null; access_token?: string | null } | null,
  provider?: { base_url?: string | null; custom_headers?: unknown; api_key?: string | null } | null,
) {
  const response = await claudeAgentResponses(
    {
      model,
      messages: [{ role: "user", content: "Say 'ok' and nothing else." }],
      max_tokens: 10,
      stream: false,
    },
    model,
    undefined,
    credential,
    provider,
  );
  return response.json();
}
