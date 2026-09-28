import { useCallback, useEffect, useRef, useState } from "react";
import { chat as chatApi, chats as chatsApi } from "../api/client";
import type { ChatMessage, ChatStats } from "../types";
import { readChatStream, type ChatStreamUsage } from "../lib/chat";
import { queryCache, invalidateChats, queryKeys } from "../lib/query-cache";

export interface ChatUsageSnapshot {
  prompt_tokens: number;
  completion_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

const EMPTY_USAGE: ChatUsageSnapshot = {
  prompt_tokens: 0,
  completion_tokens: 0,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
};

export interface StreamReplyOptions {
  chatId: string;
    requestBody: {
      model: string;
      chat_id?: string;
      reasoning_effort?: string;
    messages: { role: string; content: unknown }[];
    regenerate?: boolean;
    assistant_message_id?: string;
    attachments?: unknown[];
  };
  assistantMessageId: string;
  usageFallback?: ChatUsageSnapshot;
  onTitle: (title: { chat_id: string; title: string }) => void;
}

/**
 * Owns all chat message/streaming state: message lists per chat, token usage,
 * streaming flags and request controllers, plus the background loader that
 * polls the active chat while a response is pending.
 */
export function useChatMessages({
  chatId,
  loadingModels,
  persistModelPerChat,
  resolveChatSessionModel,
  getChatModelVersion,
}: {
  chatId: string | null;
  loadingModels: boolean;
  persistModelPerChat: boolean;
  resolveChatSessionModel: (
    chatId: string,
    sessionModel: string,
    messages: ChatMessage[],
    modelVersion: number,
  ) => void;
  getChatModelVersion: (chatId: string) => number;
}) {
  const [messagesByChat, setMessagesByChat] = useState<Record<string, ChatMessage[]>>({});
  const [usageByChat, setUsageByChat] = useState<Record<string, ChatUsageSnapshot>>({});
  const [streamingByChat, setStreamingByChat] = useState<Record<string, boolean>>({});
  const controllersRef = useRef(new Map<string, AbortController>());
  const streamingChatsRef = useRef(new Set<string>());
  const skipNextChatLoadRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);

  // A page unmount is only a view disconnect, not a request to stop generation.
  // Leave stream controllers alone here; the explicit Stop action calls the
  // backend stop endpoint before aborting its local stream connection.

  const messages = chatId ? messagesByChat[chatId] ?? [] : [];
  const usage = chatId ? usageByChat[chatId] ?? EMPTY_USAGE : EMPTY_USAGE;
  const streaming = Boolean(chatId && streamingByChat[chatId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    if (skipNextChatLoadRef.current === chatId) {
      skipNextChatLoadRef.current = null;
      return;
    }
    let pollTimer: number | null = null;
    const hasPendingResponse = (chatMessages: ChatMessage[]) => {
      const lastMessage = chatMessages.at(-1);
      return lastMessage?.role === "assistant" && !lastMessage.stats && !lastMessage.error;
    };

    const loadChat = () => {
      if (cancelled) return;
      const modelVersion = getChatModelVersion(chatId);
      chatsApi.get(chatId).then((result) => {
        if (cancelled) return;
        resolveChatSessionModel(chatId, result.session.model, result.messages, modelVersion);
        if (!streamingChatsRef.current.has(chatId)) {
          setMessagesByChat((previous) => ({ ...previous, [chatId]: result.messages }));
        }
        const latestStats = [...result.messages]
          .reverse()
          .find((message) => message.role === "assistant" && message.stats)?.stats;
        if (latestStats) {
          setUsageByChat((previous) => ({
            ...previous,
            [chatId]: {
              prompt_tokens: latestStats.prompt_tokens,
              completion_tokens: latestStats.completion_tokens,
              cache_read_tokens: latestStats.cache_read_tokens ?? 0,
              cache_write_tokens: latestStats.cache_write_tokens ?? 0,
            },
          }));
        } else if (result.messages.length === 0) {
          setUsageByChat((previous) => ({ ...previous, [chatId]: EMPTY_USAGE }));
        }
        if (!hasPendingResponse(result.messages) && pollTimer !== null) {
          window.clearInterval(pollTimer);
          pollTimer = null;
        }
      }).catch(() => {
        if (!cancelled && !streamingChatsRef.current.has(chatId)) {
          setMessagesByChat((previous) => ({ ...previous, [chatId]: [] }));
        }
      });
    };

    loadChat();
    pollTimer = window.setInterval(loadChat, 1000);

    return () => {
      cancelled = true;
      if (pollTimer !== null) window.clearInterval(pollTimer);
    };
  }, [chatId, persistModelPerChat, loadingModels, resolveChatSessionModel, getChatModelVersion]);

  const updateMessage = useCallback(
    (targetChatId: string, id: string, updater: (message: ChatMessage) => ChatMessage) => {
      setMessagesByChat((previous) => ({
        ...previous,
        [targetChatId]: (previous[targetChatId] ?? []).map((message) =>
          message.id === id ? updater(message) : message,
        ),
      }));
    },
    [],
  );

  const setMessageList = useCallback(
    (targetChatId: string, next: ChatMessage[]) => {
      setMessagesByChat((previous) => ({ ...previous, [targetChatId]: next }));
    },
    [],
  );

  const appendMessages = useCallback(
    (targetChatId: string, items: ChatMessage[]) => {
      setMessagesByChat((previous) => ({
        ...previous,
        [targetChatId]: [...(previous[targetChatId] ?? []), ...items],
      }));
    },
    [],
  );

  const skipNextLoad = useCallback((targetChatId: string) => {
    skipNextChatLoadRef.current = targetChatId;
  }, []);

  const invalidateChat = useCallback((targetChatId: string) => {
    queryCache.invalidate(queryKeys.chat(targetChatId));
    invalidateChats(targetChatId);
  }, []);

  const stop = useCallback((targetChatId?: string) => {
    const id = targetChatId ?? chatId;
    if (!id) return;
    const pending = [...(messagesByChat[id] ?? [])].reverse().find(
      (message) => message.role === "assistant" && !message.stats && !message.error,
    );
    setStreamingByChat((previous) => ({ ...previous, [id]: false }));
    if (pending?.role === "assistant") {
      void chatsApi.stopGeneration(id, pending.id).then(() => {
        controllersRef.current.get(id)?.abort();
      }).catch((error: Error) => {
        updateMessage(id, pending.id, (message) => ({
          ...message,
          error: `${message.error ? `${message.error}\n` : ""}Could not stop generation: ${error.message}`,
        }));
      });
    }
  }, [chatId, messagesByChat, updateMessage]);

  const resumeGeneration = useCallback(async (
    targetChatId: string,
    assistantMessageId: string,
    model: string,
    onTitle: StreamReplyOptions["onTitle"],
  ) => {
    if (controllersRef.current.has(targetChatId)) return;
    const controller = new AbortController();
    controllersRef.current.set(targetChatId, controller);
    streamingChatsRef.current.add(targetChatId);
    setStreamingByChat((previous) => ({ ...previous, [targetChatId]: true }));
    try {
      const response = await chatApi.resume(targetChatId, assistantMessageId, controller.signal);
      await readChatStream(response, {
        onContent: (delta) => updateMessage(targetChatId, assistantMessageId, (message) => ({
          ...message,
          content: delta.startsWith("\u0000snapshot:")
            ? delta.slice("\u0000snapshot:".length)
            : (typeof message.content === "string" ? message.content : "") + delta,
        })),
        onReasoning: (delta) => updateMessage(targetChatId, assistantMessageId, (message) => ({
          ...message,
          reasoning: delta.startsWith("\u0000snapshot:")
            ? delta.slice("\u0000snapshot:".length)
            : (message.reasoning ?? "") + delta,
        })),
        onUsage: () => undefined,
        onStats: (stats) => {
          updateMessage(targetChatId, assistantMessageId, (message) => ({ ...message, stats }));
          void chatsApi.get(targetChatId).then((result) => {
            setMessagesByChat((previous) => ({ ...previous, [targetChatId]: result.messages }));
          }).catch(() => undefined);
        },
        onTitle,
        onError: (error) => updateMessage(targetChatId, assistantMessageId, (message) => ({
          ...message,
          error: error,
        })),
      });
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        updateMessage(targetChatId, assistantMessageId, (message) => ({
          ...message,
          error: error?.message ?? "Could not resume generation",
        }));
      }
    } finally {
      if (controllersRef.current.get(targetChatId) === controller) {
        controllersRef.current.delete(targetChatId);
        streamingChatsRef.current.delete(targetChatId);
        setStreamingByChat((previous) => ({ ...previous, [targetChatId]: false }));
        invalidateChat(targetChatId);
        void chatsApi.get(targetChatId).then((result) => {
          setMessagesByChat((previous) => ({ ...previous, [targetChatId]: result.messages }));
        }).catch(() => undefined);
      }
    }
  }, [invalidateChat, updateMessage]);

  const streamReply = useCallback(
    async ({
      chatId: targetChatId,
      requestBody,
      assistantMessageId,
      usageFallback,
      onTitle,
    }: StreamReplyOptions): Promise<void> => {
      const controller = new AbortController();
      controllersRef.current.set(targetChatId, controller);
      streamingChatsRef.current.add(targetChatId);
      setStreamingByChat((previous) => ({ ...previous, [targetChatId]: true }));
      const fallback = usageFallback ?? EMPTY_USAGE;

      try {
        const response = await chatApi.completions(
          {
            ...requestBody,
            chat_id: targetChatId,
            assistant_message_id: assistantMessageId,
          },
          controller.signal,
        );
        await readChatStream(response, {
          onContent: (delta) =>
            updateMessage(targetChatId, assistantMessageId, (message) => ({
              ...message,
              content: delta.startsWith("\u0000snapshot:")
                ? delta.slice("\u0000snapshot:".length)
                : (typeof message.content === "string" ? message.content : "") + delta,
            })),
          onReasoning: (delta) =>
            updateMessage(targetChatId, assistantMessageId, (message) => ({
              ...message,
              reasoning: delta.startsWith("\u0000snapshot:")
                ? delta.slice("\u0000snapshot:".length)
                : (message.reasoning ?? "") + delta,
            })),
          onUsage: (nextUsage: ChatStreamUsage) =>
            setUsageByChat((previous) => {
              const current = previous[targetChatId] ?? fallback;
              return {
                ...previous,
                [targetChatId]: {
                  prompt_tokens: Number(nextUsage.prompt_tokens ?? current.prompt_tokens),
                  completion_tokens: Number(nextUsage.completion_tokens ?? current.completion_tokens),
                  cache_read_tokens: Number(nextUsage.cache_read_tokens ?? current.cache_read_tokens),
                  cache_write_tokens: Number(nextUsage.cache_write_tokens ?? current.cache_write_tokens),
                },
              };
            }),
          onStats: (stats: ChatStats) => {
            setUsageByChat((previous) => {
              const current = previous[targetChatId] ?? fallback;
              return {
                ...previous,
                [targetChatId]: {
                  prompt_tokens: stats.prompt_tokens,
                  completion_tokens: stats.completion_tokens,
                  cache_read_tokens: stats.cache_read_tokens ?? current.cache_read_tokens,
                  cache_write_tokens: stats.cache_write_tokens ?? current.cache_write_tokens,
                },
              };
            });
            updateMessage(targetChatId, assistantMessageId, (message) => ({
              ...message,
              stats,
            }));
          },
          onTitle,
          onError: (errorMessage) =>
            updateMessage(targetChatId, assistantMessageId, (message) => ({
              ...message,
              error: errorMessage,
            })),
        });
      } catch (error: any) {
        if (error?.name !== "AbortError") {
          const errorMessage = error?.message ?? "Chat request failed";
          updateMessage(targetChatId, assistantMessageId, (message) => ({
            ...message,
            error: errorMessage,
          }));
        }
      } finally {
        if (controllersRef.current.get(targetChatId) === controller) {
          controllersRef.current.delete(targetChatId);
          invalidateChat(targetChatId);
          void chatsApi.get(targetChatId).then((result) => {
            setMessagesByChat((previous) => ({ ...previous, [targetChatId]: result.messages }));
            const latestStats = [...result.messages]
              .reverse()
              .find((message) => message.role === "assistant" && message.stats)?.stats;
            if (latestStats) {
              setUsageByChat((previous) => ({
                ...previous,
                [targetChatId]: {
                  prompt_tokens: latestStats.prompt_tokens,
                  completion_tokens: latestStats.completion_tokens,
                  cache_read_tokens: latestStats.cache_read_tokens ?? 0,
                  cache_write_tokens: latestStats.cache_write_tokens ?? 0,
                },
              }));
            }
          }).catch(() => undefined);
          streamingChatsRef.current.delete(targetChatId);
          setStreamingByChat((previous) => ({ ...previous, [targetChatId]: false }));
        }
      }
    },
    [invalidateChat, updateMessage],
  );

  return {
    messages,
    messagesRef,
    usage,
    streaming,
    streamingByChat,
    updateMessage,
    setMessageList,
    appendMessages,
    skipNextLoad,
    invalidateChat,
    stop,
    streamReply,
    resumeGeneration,
  };
}
