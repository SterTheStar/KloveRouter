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

/** Stream output is painted at most this often; tokens arrive far faster. */
const STREAM_PAINT_MS = 60;

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
  /** Receives the partial reply while it streams, so it can be saved as a draft. */
  checkpoint?: (content: ChatMessage["content"], reasoning: string) => void;
}

type AudioContent = { content?: string; audio?: { data?: string; format?: string; transcript?: string } };

/**
 * Mutable accumulator for one streaming assistant message. Chunks are folded
 * in here without touching React state; a single scheduled flush publishes
 * the result, and only this message gets a new object, so rows above it skip
 * re-rendering (and re-parsing markdown) on every token.
 */
interface StreamRow {
  chatId: string;
  content: unknown;
  /** Snapshot of `content` at the last paint, used to attribute server writes. */
  paintedContent: unknown;
  /** Server-written content that is not a suffix of the stream (an edit). */
  edited: unknown;
  reasoning: string;
  paintedReasoning: string;
  editedReasoning: string | null;
  error: string | null;
  stats: ChatStats | null;
  dirty: boolean;
}

function withDelta(current: unknown, delta: unknown): unknown {
  if (typeof delta === "object" && delta && (delta as any).__snapshot) return (delta as any).content;
  if (typeof delta === "object" && delta && (delta as any).__audio) {
    const base = (current ?? "") as string | AudioContent;
    const content = typeof base === "string" ? base : base.content ?? "";
    const audio = typeof base === "string" ? {} : base.audio ?? {};
    const incoming = (delta as any).__audio;
    return {
      ...(typeof base === "string" ? {} : base),
      content,
      audio: {
        ...audio,
        ...(typeof incoming === "string"
          ? { data: (audio.data ?? "") + incoming, transcript: `${audio.transcript ?? ""}${(delta as any).transcript ?? ""}` }
          : incoming ?? {}),
      },
    } satisfies AudioContent;
  }
  if (typeof current === "string") return current + String(delta);
  const object = (current ?? {}) as AudioContent & Record<string, unknown>;
  return { ...object, content: `${object.content ?? ""}${String(delta)}` };
}

/** True when `next` begins with `previous` after the server persisted writes. */
function isAppend(previous: string, next: string) {
  return previous.length === 0 || next.startsWith(previous);
}

const textOf = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * Owns all chat message/streaming state: message lists per chat, token usage,
 * streaming flags and request controllers, plus the per-chat loader.
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
  const loadedChatsRef = useRef(new Set<string>());
  const rowsRef = useRef(new Map<string, StreamRow>());
  const flushTimerRef = useRef<number | undefined>(undefined);
  const chatLoadsRef = useRef(new Map<string, { promise: Promise<void>; rerun: boolean }>());

  // A page unmount is only a view disconnect, not a request to stop generation.
  // Leave stream controllers alone here; the explicit Stop action calls the
  // backend stop endpoint before aborting its local stream connection.

  const messages = chatId ? messagesByChat[chatId] ?? [] : [];
  const usage = chatId ? usageByChat[chatId] ?? EMPTY_USAGE : EMPTY_USAGE;
  const streaming = Boolean(chatId && streamingByChat[chatId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const setChannel = useCallback((targetChatId: string, value: boolean) => {
    streamingChatsRef.current[value ? "add" : "delete"](targetChatId);
    setStreamingByChat((previous) => (previous[targetChatId] === value
      ? previous
      : { ...previous, [targetChatId]: value }));
  }, []);

  const replaceUsage = useCallback((targetChatId: string, messages: ChatMessage[], fallback?: ChatUsageSnapshot) => {
    const stats = [...messages].reverse().find((message) => message.role === "assistant" && message.stats)?.stats;
    if (stats) {
      setUsageByChat((previous) => ({
        ...previous,
        [targetChatId]: {
          prompt_tokens: stats.prompt_tokens,
          completion_tokens: stats.completion_tokens,
          cache_read_tokens: stats.cache_read_tokens ?? previous[targetChatId]?.cache_read_tokens ?? 0,
          cache_write_tokens: stats.cache_write_tokens ?? previous[targetChatId]?.cache_write_tokens ?? 0,
        },
      }));
    } else if (messages.length === 0) {
      setUsageByChat((previous) => ({ ...previous, [targetChatId]: EMPTY_USAGE }));
    } else if (fallback) {
      setUsageByChat((previous) => ({ ...previous, [targetChatId]: fallback }));
    }
  }, []);

  // Push every dirty row into state: one new object for each streaming
  // message, everything else keeps its identity.
  const flushRows = useCallback(() => {
    if (flushTimerRef.current !== undefined) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = undefined;
    }
    const dirty: { row: StreamRow; id: string }[] = [];
    for (const [id, row] of rowsRef.current) if (row.dirty) dirty.push({ row, id });
    if (!dirty.length) return;
    setMessagesByChat((previous) => {
      let next = previous;
      for (const { row, id } of dirty) {
        const list = next[row.chatId];
        if (!list) continue;
        const index = list.findIndex((message) => message.id === id);
        if (index < 0) continue;
        const current = list[index];
        const content = row.edited !== undefined ? row.edited : row.content;
        const reasoning = row.editedReasoning ?? row.reasoning;
        row.paintedContent = content;
        row.paintedReasoning = textOf(reasoning);
        row.edited = undefined;
        row.editedReasoning = null;
        row.dirty = false;
        if (current.content === content && current.reasoning === reasoning && current.stats === row.stats && current.error === row.error) continue;
        const updated = list.slice();
        updated[index] = { ...current, content: content as ChatMessage["content"], reasoning, stats: row.stats, error: row.error };
        next = next === previous ? { ...previous } : next;
        next[row.chatId] = updated;
      }
      return next;
    });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== undefined) return;
    flushTimerRef.current = window.setTimeout(flushRows, STREAM_PAINT_MS);
  }, [flushRows]);

  const rowFor = useCallback((targetChatId: string, messageId: string): StreamRow => {
    let row = rowsRef.current.get(messageId);
    if (!row) {
      row = {
        chatId: targetChatId,
        content: "",
        paintedContent: "",
        edited: undefined,
        reasoning: "",
        paintedReasoning: "",
        editedReasoning: null,
        error: null,
        stats: null,
        dirty: false,
      };
      rowsRef.current.set(messageId, row);
    }
    return row;
  }, []);

  /** Folds one parsed chunk into the accumulator without touching state. */
  const applyDelta = useCallback((targetChatId: string, messageId: string, delta: {
    content?: unknown;
    reasoning?: string;
    reasoningSnapshot?: boolean;
    stats?: ChatStats;
    error?: string;
    usage?: ChatStreamUsage;
  }, fallback: ChatUsageSnapshot) => {
    const row = rowFor(targetChatId, messageId);
    row.chatId = targetChatId;
    if (delta.content !== undefined) row.content = withDelta(row.content, delta.content);
    if (delta.reasoning !== undefined) {
      row.reasoning = delta.reasoningSnapshot ? delta.reasoning : `${row.reasoning}${delta.reasoning}`;
    }
    if (delta.error !== undefined) row.error = delta.error;
    if (delta.stats) row.stats = delta.stats;
    if (delta.usage) {
      setUsageByChat((previous) => {
        const current = previous[targetChatId] ?? fallback;
        return {
          ...previous,
          [targetChatId]: {
            prompt_tokens: Number(delta.usage?.prompt_tokens ?? current.prompt_tokens),
            completion_tokens: Number(delta.usage?.completion_tokens ?? current.completion_tokens),
            cache_read_tokens: Number(delta.usage?.cache_read_tokens ?? current.cache_read_tokens),
            cache_write_tokens: Number(delta.usage?.cache_write_tokens ?? current.cache_write_tokens),
          },
        };
      });
    }
    row.dirty = true;
    scheduleFlush();
  }, [rowFor, scheduleFlush]);

  /**
   * Adopts a server-persisted version of a streaming message: text written by
   * the server (progressive saves) is kept unless the stream went further,
   * and a real edit at the start wins over the accumulated stream.
   */
  const adoptServerMessage = useCallback((targetChatId: string, message: ChatMessage) => {
    const row = rowsRef.current.get(message.id);
    if (row) {
      const painted = textOf(row.paintedContent);
      const server = textOf(message.content);
      if (server !== painted) {
        if (isAppend(server, textOf(row.content))) {
          row.content = server;
        } else {
          row.content = server;
          row.edited = message.content;
        }
      }
      const serverReasoning = message.reasoning ?? "";
      if (serverReasoning !== row.paintedReasoning) {
        if (isAppend(serverReasoning, row.reasoning)) row.reasoning = serverReasoning;
        else row.editedReasoning = serverReasoning;
      }
      if (message.stats) row.stats = message.stats;
      if (message.error) row.error = message.error;
      row.dirty = true;
      flushRows();
      return;
    }
    setMessagesByChat((previous) => {
      const list = previous[targetChatId];
      if (!list) return previous;
      const index = list.findIndex((item) => item.id === message.id);
      if (index < 0) return previous;
      const updated = list.slice();
      updated[index] = message;
      return { ...previous, [targetChatId]: updated };
    });
    replaceUsage(targetChatId, [message]);
  }, [flushRows, replaceUsage]);

  // Single-flight loader: at most one request per chat in flight, and
  // concurrent callers share it. Replaces the previous 1 s polling loop.
  const loadChatNow = useCallback((targetChatId: string): Promise<void> => {
    const inFlight = chatLoadsRef.current.get(targetChatId);
    if (inFlight) {
      inFlight.rerun = true;
      return inFlight.promise;
    }
    const entry: { rerun: boolean; promise: Promise<void> } = { rerun: false, promise: Promise.resolve() };
    entry.promise = (async () => {
      try {
        const modelVersion = getChatModelVersion(targetChatId);
        const result = await chatsApi.get(targetChatId);
        resolveChatSessionModel(targetChatId, result.session.model, result.messages, modelVersion);
        loadedChatsRef.current.add(targetChatId);
        if (!streamingChatsRef.current.has(targetChatId)) {
          setMessagesByChat((previous) => ({ ...previous, [targetChatId]: result.messages }));
          replaceUsage(targetChatId, result.messages);
        }
      } catch {
        if (!loadedChatsRef.current.has(targetChatId)) {
          setMessagesByChat((previous) => previous[targetChatId] ? previous : { ...previous, [targetChatId]: [] });
        }
      } finally {
        chatLoadsRef.current.delete(targetChatId);
        if (entry.rerun) void loadChatNow(targetChatId);
      }
    })();
    chatLoadsRef.current.set(targetChatId, entry);
    return entry.promise;
  }, [getChatModelVersion, replaceUsage, resolveChatSessionModel]);

  useEffect(() => {
    if (!chatId) return;
    if (skipNextChatLoadRef.current === chatId) {
      skipNextChatLoadRef.current = null;
      return;
    }
    void loadChatNow(chatId);
  }, [chatId, loadChatNow]);

  const updateMessage = useCallback(
    (targetChatId: string, id: string, updater: (message: ChatMessage) => ChatMessage) => {
      setMessagesByChat((previous) => {
        const list = previous[targetChatId] ?? [];
        const index = list.findIndex((message) => message.id === id);
        if (index < 0) return previous;
        const next = list.slice();
        next[index] = updater(list[index]);
        return { ...previous, [targetChatId]: next };
      });
    },
    [],
  );

  const setMessageList = useCallback(
    (targetChatId: string, next: ChatMessage[]) => {
      // Message ids are the row keys: drop accumulators of rows that left.
      for (const id of rowsRef.current.keys()) {
        if (!next.some((message) => message.id === id)) rowsRef.current.delete(id);
      }
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
    loadedChatsRef.current.delete(targetChatId);
    queryCache.invalidate(queryKeys.chat(targetChatId));
    invalidateChats(targetChatId);
  }, []);

  const stop = useCallback((targetChatId?: string) => {
    const id = targetChatId ?? chatId;
    if (!id) return;
    const pending = [...(messagesByChat[id] ?? [])].reverse().find(
      (message) => message.role === "assistant" && !message.stats && !message.error,
    );
    if (pending?.role === "assistant") {
      void chatsApi.stopGeneration(id, pending.id).then(() => {
        controllersRef.current.get(id)?.abort();
        setChannel(id, false);
      }).catch((error: Error) => {
        setChannel(id, true);
        updateMessage(id, pending.id, (message) => ({
          ...message,
          error: `${message.error ? `${message.error}\n` : ""}Could not stop generation: ${error.message}`,
        }));
      });
    } else {
      setChannel(id, false);
    }
  }, [chatId, messagesByChat, setChannel, updateMessage]);

  const resumeGeneration = useCallback(async (
    targetChatId: string,
    assistantMessageId: string,
    model: string,
    onTitle: StreamReplyOptions["onTitle"],
    checkpoint?: StreamReplyOptions["checkpoint"],
  ) => {
    if (controllersRef.current.has(targetChatId)) return;
    const controller = new AbortController();
    controllersRef.current.set(targetChatId, controller);
    setChannel(targetChatId, true);
    const row = rowFor(targetChatId, assistantMessageId);
    let checkpointTimer: number | undefined;
    const runCheckpoint = () => checkpoint?.(row.content as ChatMessage["content"], row.reasoning);
    try {
      const response = await chatApi.resume(targetChatId, assistantMessageId, controller.signal);
      await readChatStream(response, {
        onContent: (delta) => applyDelta(targetChatId, assistantMessageId, { content: delta }, EMPTY_USAGE),
        onReasoning: (delta) => {
          const snapshot = delta.startsWith("\u0000snapshot:");
          applyDelta(targetChatId, assistantMessageId, {
            reasoning: snapshot ? delta.slice("\u0000snapshot:".length) : delta,
            reasoningSnapshot: snapshot,
          }, EMPTY_USAGE);
        },
        onUsage: () => undefined,
        onStats: (stats) => {
          applyDelta(targetChatId, assistantMessageId, { stats }, EMPTY_USAGE);
          flushRows();
          void loadChatNow(targetChatId);
        },
        onTitle,
        onStreamStart: () => setChannel(targetChatId, true),
        onStreamEnd: () => setChannel(targetChatId, false),
        onError: (error) => applyDelta(targetChatId, assistantMessageId, { error }, EMPTY_USAGE),
      });
      if (checkpoint && checkpointTimer === undefined && row.content !== "") {
        checkpointTimer = window.setInterval(runCheckpoint, 1000);
      }
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        applyDelta(targetChatId, assistantMessageId, { error: error?.message ?? "Could not resume generation" }, EMPTY_USAGE);
      }
    } finally {
      if (checkpointTimer !== undefined) window.clearInterval(checkpointTimer);
      flushRows();
      if (controllersRef.current.get(targetChatId) === controller) {
        controllersRef.current.delete(targetChatId);
        setChannel(targetChatId, false);
        invalidateChat(targetChatId);
        await loadChatNow(targetChatId);
      }
    }
  }, [applyDelta, flushRows, invalidateChat, loadChatNow, rowFor, setChannel]);

  const streamReply = useCallback(
    async ({
      chatId: targetChatId,
      requestBody,
      assistantMessageId,
      usageFallback,
      onTitle,
      checkpoint,
    }: StreamReplyOptions): Promise<void> => {
      if (controllersRef.current.has(targetChatId)) return;
      const controller = new AbortController();
      controllersRef.current.set(targetChatId, controller);
      setChannel(targetChatId, true);
      const fallback = usageFallback ?? EMPTY_USAGE;
      const row = rowFor(targetChatId, assistantMessageId);
      let checkpointTimer: number | undefined;
      // Persist the partial reply periodically so a reload keeps it.
      const startCheckpoint = () => {
        if (!checkpoint || checkpointTimer !== undefined) return;
        checkpointTimer = window.setInterval(
          () => checkpoint(row.content as ChatMessage["content"], row.reasoning),
          1000,
        );
      };

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
          onContent: (delta) => {
            applyDelta(targetChatId, assistantMessageId, { content: delta }, fallback);
            startCheckpoint();
          },
          onReasoning: (delta) => {
            const snapshot = delta.startsWith("\u0000snapshot:");
            applyDelta(targetChatId, assistantMessageId, {
              reasoning: snapshot ? delta.slice("\u0000snapshot:".length) : delta,
              reasoningSnapshot: snapshot,
            }, fallback);
            startCheckpoint();
          },
          onUsage: (nextUsage: ChatStreamUsage) =>
            applyDelta(targetChatId, assistantMessageId, { usage: nextUsage }, fallback),
          onStats: (stats: ChatStats) => {
            applyDelta(targetChatId, assistantMessageId, { stats }, fallback);
            flushRows();
          },
          onTitle,
          onError: (errorMessage) =>
            applyDelta(targetChatId, assistantMessageId, { error: errorMessage }, fallback),
          onStreamStart: () => setChannel(targetChatId, true),
          onStreamEnd: () => undefined,
        });
      } catch (error: any) {
        if (error?.name !== "AbortError") {
          applyDelta(targetChatId, assistantMessageId, { error: error?.message ?? "Chat request failed" }, fallback);
        }
      } finally {
        if (checkpointTimer !== undefined) window.clearInterval(checkpointTimer);
        flushRows();
        if (controllersRef.current.get(targetChatId) === controller) {
          controllersRef.current.delete(targetChatId);
          invalidateChat(targetChatId);
          setChannel(targetChatId, false);
          // The server is the source of truth once the stream ends.
          try {
            const result = await chatsApi.get(targetChatId);
            loadedChatsRef.current.add(targetChatId);
            const final = result.messages.find((message) => message.id === assistantMessageId);
            if (final) adoptServerMessage(targetChatId, final);
            else setMessagesByChat((previous) => ({ ...previous, [targetChatId]: result.messages }));
            replaceUsage(targetChatId, result.messages, fallback);
            rowsRef.current.delete(assistantMessageId);
          } catch {
            // The flushed local state stays on screen; the next load reconciles.
          }
        }
      }
    },
    [adoptServerMessage, applyDelta, flushRows, invalidateChat, replaceUsage, rowFor, setChannel],
  );

  useEffect(() => () => {
    if (flushTimerRef.current !== undefined) window.clearTimeout(flushTimerRef.current);
  }, []);

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
    loadChatNow,
  };
}
