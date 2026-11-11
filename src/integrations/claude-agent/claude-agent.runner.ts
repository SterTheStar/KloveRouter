import type {
  ClaudeAgentConnectionConfig,
  ClaudeAgentTurnResult,
} from "./claude-agent.types";
import { resolveClaudeExecutable, buildConnectionEnv, ISOLATION_ENV } from "./claude-agent.env";

export type RunnerChunk =
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      arguments: string;
      index?: number;
    };

export async function runClaudeAgentQuery(
  model: string,
  prompt: string,
  systemPrompt: string | undefined,
  config: ClaudeAgentConnectionConfig = {},
  signal?: AbortSignal,
  onChunk?: (chunk: RunnerChunk) => Promise<void> | void,
): Promise<ClaudeAgentTurnResult> {
  const executablePath = resolveClaudeExecutable(config.executablePath);
  if (!executablePath) {
    throw new Error(
      "Claude Code CLI is not installed or not found on PATH. Install Claude Code (e.g. 'npm install -g @anthropic-ai/claude-code') or set SATURN_CLAUDE_PATH.",
    );
  }

  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const connectionEnv = buildConnectionEnv(config);

  const abortController = new AbortController();
  const onAbort = () => {
    abortController.abort(signal?.reason);
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  const options: any = {
    pathToClaudeCodeExecutable: executablePath,
    env: {
      ...process.env,
      ...connectionEnv,
      ...ISOLATION_ENV,
    },
    settingSources: [],
    settings: { disableAllHooks: true },
    systemPrompt: systemPrompt || undefined,
    model: model === "default" ? undefined : model,
    effort: config.effort,
    thinking: { type: "adaptive", display: "summarized" },
    permissionMode: "dontAsk",
    verbatimPrompts: true,
    includePartialMessages: true,
    persistSession: false,
    tools: [],
    abortController,
  };

  const session = query({ prompt, options });

  let textContent = "";
  let reasoningContent = "";
  let streamedText = false;
  let streamedReasoning = false;
  const toolCalls: ClaudeAgentTurnResult["toolCalls"] = [];
  const toolCallIndices = new Map<string, number>();

  const usage = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
  };

  let finishReason: ClaudeAgentTurnResult["finishReason"] = "stop";

  try {
    for await (const message of session) {
      if (signal?.aborted) break;

      if (message.type === "rate_limit_event") {
        // Can record rate limits if needed
        continue;
      }

      if (message.type === "stream_event" && message.parent_tool_use_id === null) {
        const event = (message as any).event;
        if (!event) continue;

        switch (event.type) {
          case "message_start": {
            if (event.message?.usage) {
              const u = event.message.usage;
              usage.prompt_tokens = Math.max(usage.prompt_tokens, u.input_tokens || 0);
              usage.cache_read_tokens = Math.max(
                usage.cache_read_tokens,
                u.cache_read_input_tokens || 0,
              );
              usage.cache_write_tokens = Math.max(
                usage.cache_write_tokens,
                u.cache_creation_input_tokens || 0,
              );
            }
            break;
          }
          case "content_block_delta": {
            const delta = event.delta;
            if (delta?.type === "text_delta" && delta.text) {
              streamedText = true;
              textContent += delta.text;
              if (onChunk) await onChunk({ type: "text", delta: delta.text });
            } else if (delta?.type === "thinking_delta" && delta.thinking) {
              streamedReasoning = true;
              reasoningContent += delta.thinking;
              if (onChunk) await onChunk({ type: "reasoning", delta: delta.thinking });
            }
            break;
          }
          case "message_delta": {
            if (event.usage) {
              usage.completion_tokens = Math.max(
                usage.completion_tokens,
                event.usage.output_tokens || 0,
              );
            }
            break;
          }
          default:
            break;
        }
      } else if (message.type === "assistant" && message.parent_tool_use_id === null) {
        if (message.error) {
          throw new Error(`Claude Agent error: ${message.error}`);
        }

        const msg = (message as any).message;
        if (msg) {
          if (msg.usage) {
            usage.prompt_tokens = Math.max(usage.prompt_tokens, msg.usage.input_tokens || 0);
            usage.completion_tokens = Math.max(
              usage.completion_tokens,
              msg.usage.output_tokens || 0,
            );
            usage.cache_read_tokens = Math.max(
              usage.cache_read_tokens,
              msg.usage.cache_read_input_tokens || 0,
            );
            usage.cache_write_tokens = Math.max(
              usage.cache_write_tokens,
              msg.usage.cache_creation_input_tokens || 0,
            );
          }

          if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === "text" && !streamedText) {
                textContent += block.text || "";
                if (onChunk && block.text) {
                  await onChunk({ type: "text", delta: block.text });
                }
              } else if (block.type === "thinking" && !streamedReasoning) {
                reasoningContent += block.thinking || "";
                if (onChunk && block.thinking) {
                  await onChunk({ type: "reasoning", delta: block.thinking });
                }
              } else if (block.type === "tool_use") {
                finishReason = "tool_calls";
                const index = toolCalls.length;
                const call = {
                  id: block.id || `call_${crypto.randomUUID().slice(0, 18)}`,
                  type: "function" as const,
                  function: {
                    name: block.name,
                    arguments:
                      typeof block.input === "string"
                        ? block.input
                        : JSON.stringify(block.input ?? {}),
                  },
                };
                toolCalls.push(call);
                toolCallIndices.set(call.id, index);

                if (onChunk) {
                  await onChunk({
                    type: "tool_call",
                    id: call.id,
                    name: call.function.name,
                    arguments: call.function.arguments,
                    index,
                  });
                }
              }
            }
          }
        }
      } else if (message.type === "result") {
        if (message.error) {
          throw new Error(`Claude Agent result error: ${message.error}`);
        }
      }
    }
  } catch (error: any) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException("The operation was aborted", "AbortError");
    }
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    try {
      session.close();
    } catch {
      // Ignore cleanup error if already closed
    }
  }

  usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;

  return {
    content: textContent,
    reasoning: reasoningContent || undefined,
    toolCalls,
    usage,
    finishReason: toolCalls.length > 0 ? "tool_calls" : finishReason,
  };
}
