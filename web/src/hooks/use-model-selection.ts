import { useCallback, useEffect, useRef, useState } from "react";
import { chats as chatsApi, settings } from "../api/client";
import type { ChatMessage, ModelWithProvider } from "../types";
import { modelApiId } from "../lib/chat";
import { resolveChatModel } from "../lib/chat-model";
import { effortOptions, defaultEffortOption } from "../lib/chat-efforts";
import { queryCache, invalidateChats, queryKeys } from "../lib/query-cache";

const MODEL_STORAGE_KEY = "klove_chat_model";
const REASONING_STORAGE_PREFIX = "klove_chat_reasoning:";

function reasoningKey(selectedModel: string) {
  return `${REASONING_STORAGE_PREFIX}${selectedModel}`;
}

function reasoningChatKey(chatId: string) {
  return `${REASONING_STORAGE_PREFIX}chat:${chatId}`;
}

type ChatModelList = ModelWithProvider[];

/**
 * Model selection for the chat: a global default plus (optionally) a model
 * persisted per chat, the reasoning effort choice (scoped per chat when
 * per-chat persistence is on), and the queue that keeps the per-chat model
 * in sync with the backend without racing the chat loader.
 */
export function useModelSelection({
  chatId,
  modelList,
  loadingModels,
  validModelIdsRef,
}: {
  chatId: string | null;
  modelList: ChatModelList;
  loadingModels: boolean;
  validModelIdsRef: React.RefObject<Set<string>>;
}) {
  const [persistModelPerChat, setPersistModelPerChat] = useState(false);
  const persistModelPerChatRef = useRef(false);
  const [globalModel, setGlobalModel] = useState<string | null>(() =>
    localStorage.getItem(MODEL_STORAGE_KEY),
  );
  const [modelsByChat, setModelsByChat] = useState<Record<string, string>>({});
  const [modelSelectionError, setModelSelectionError] = useState<string | null>(null);
  const [selectedReasoningEffort, setSelectedReasoningEffort] = useState<string | null>(null);
  const modelUpdateVersionsRef = useRef(new Map<string, number>());
  const pendingModelUpdatesRef = useRef(new Set<string>());
  const modelUpdateQueueRef = useRef(new Map<string, Promise<void>>());

  useEffect(() => {
    let cancelled = false;
    settings
      .chat()
      .then((value) => {
        if (cancelled) return;
        persistModelPerChatRef.current = value.persist_model_per_chat;
        setPersistModelPerChat(value.persist_model_per_chat);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!globalModel) return;
    localStorage.setItem(MODEL_STORAGE_KEY, globalModel);
  }, [globalModel]);

  // Drop persisted selections that no longer resolve to a valid model.
  useEffect(() => {
    if (loadingModels) return;
    const validIds = validModelIdsRef.current;
    setGlobalModel((previous) =>
      previous && validIds.has(previous) ? previous : null,
    );
    setModelsByChat((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([, model]) => validIds.has(model)),
      ),
    );
  }, [modelList, loadingModels, validModelIdsRef]);

  const selectedModel =
    persistModelPerChat && chatId
      ? modelsByChat[chatId] ?? globalModel
      : globalModel;

  const enqueueModelUpdate = useCallback(
    (targetChatId: string, update: () => Promise<void>) => {
      const previous = modelUpdateQueueRef.current.get(targetChatId) ?? Promise.resolve();
      const queued = previous.catch(() => undefined).then(update);
      modelUpdateQueueRef.current.set(targetChatId, queued);
      void queued.finally(() => {
        if (modelUpdateQueueRef.current.get(targetChatId) === queued) {
          modelUpdateQueueRef.current.delete(targetChatId);
        }
      }).catch(() => undefined);
      return queued;
    },
    [],
  );

  // Restore the reasoning effort whenever the model/chat changes. With
  // per-chat persistence the choice is scoped to the chat, falling back to
  // the per-model choice.
  useEffect(() => {
    if (!selectedModel) {
      setSelectedReasoningEffort(null);
      return;
    }
    const model = modelList.find(
      (candidate) =>
        modelApiId(candidate.provider_name, candidate.model_id, candidate.pretty_id) ===
        selectedModel,
    );
    const options = effortOptions(model);
    const chatStored = chatId && persistModelPerChat
      ? localStorage.getItem(reasoningChatKey(chatId))
      : null;
    const stored = chatStored ?? localStorage.getItem(reasoningKey(selectedModel));
    const fallback = defaultEffortOption(options)?.effort ?? null;
    const next = options.some((option) => option.effort === stored) ? stored : fallback;
    setSelectedReasoningEffort(next);
  }, [modelList, selectedModel, chatId, persistModelPerChat]);

  const onSelectModel = useCallback(
    (id: string) => {
      setModelSelectionError(null);
      setGlobalModel(id);
      if (!persistModelPerChat || !chatId) return;

      const previous = modelsByChat[chatId] ?? globalModel;
      const version = (modelUpdateVersionsRef.current.get(chatId) ?? 0) + 1;
      modelUpdateVersionsRef.current.set(chatId, version);
      pendingModelUpdatesRef.current.add(chatId);
      setModelsByChat((current) => ({ ...current, [chatId]: id }));
      void enqueueModelUpdate(chatId, () =>
        chatsApi
          .update(chatId, { model: id })
          .then(() => {
            if (modelUpdateVersionsRef.current.get(chatId) !== version) return;
            pendingModelUpdatesRef.current.delete(chatId);
            queryCache.invalidate(queryKeys.chat(chatId));
            invalidateChats(chatId);
          })
          .catch((error: Error) => {
            if (modelUpdateVersionsRef.current.get(chatId) !== version) return;
            pendingModelUpdatesRef.current.delete(chatId);
            setModelsByChat((current) => {
              const next = { ...current };
              if (previous) next[chatId] = previous;
              else delete next[chatId];
              return next;
            });
            setModelSelectionError(error.message ?? "Could not save chat model");
          }),
      );
    },
    [chatId, enqueueModelUpdate, globalModel, modelsByChat, persistModelPerChat],
  );

  const onSelectReasoningEffort = useCallback(
    (effort: string) => {
      setSelectedReasoningEffort(effort);
      if (persistModelPerChat && chatId)
        localStorage.setItem(reasoningChatKey(chatId), effort);
      else if (selectedModel)
        localStorage.setItem(reasoningKey(selectedModel), effort);
    },
    [chatId, persistModelPerChat, selectedModel],
  );

  /**
   * Called by the chat loader for each fetched session: resolves the stored
   * chat model to a valid routing id and persists the fix when needed.
   */
  const resolveChatSessionModel = useCallback(
    (
      targetChatId: string,
      sessionModel: string,
      messages: ChatMessage[],
      modelVersion: number,
    ) => {
      if (!persistModelPerChatRef.current) return;
      if (pendingModelUpdatesRef.current.has(targetChatId)) return;
      if ((modelUpdateVersionsRef.current.get(targetChatId) ?? 0) !== modelVersion) return;
      const resolvedModel = resolveChatModel(
        sessionModel,
        messages,
        globalModel,
        validModelIdsRef.current,
      );
      if (!resolvedModel) return;
      setModelsByChat((previous) => ({ ...previous, [targetChatId]: resolvedModel }));
      if (!validModelIdsRef.current.has(sessionModel)) {
        pendingModelUpdatesRef.current.add(targetChatId);
        void enqueueModelUpdate(targetChatId, () =>
          chatsApi
            .update(targetChatId, { model: resolvedModel })
            .then(() => {
              if ((modelUpdateVersionsRef.current.get(targetChatId) ?? 0) !== modelVersion) return;
              pendingModelUpdatesRef.current.delete(targetChatId);
              queryCache.invalidate(queryKeys.chat(targetChatId));
              invalidateChats(targetChatId);
            })
            .catch(() => {
              if ((modelUpdateVersionsRef.current.get(targetChatId) ?? 0) === modelVersion) {
                pendingModelUpdatesRef.current.delete(targetChatId);
              }
            }),
        );
      }
    },
    [enqueueModelUpdate, globalModel, validModelIdsRef],
  );

  const getChatModelVersion = useCallback(
    (targetChatId: string) => modelUpdateVersionsRef.current.get(targetChatId) ?? 0,
    [],
  );

  /** Pins the model of a freshly created chat when per-chat persistence is on. */
  const assignChatModel = useCallback(
    (targetChatId: string, model: string) => {
      if (!persistModelPerChatRef.current) return;
      setModelsByChat((current) => ({ ...current, [targetChatId]: model }));
    },
    [],
  );

  return {
    selectedModel,
    selectedReasoningEffort,
    modelSelectionError,
    persistModelPerChat,
    onSelectModel,
    onSelectReasoningEffort,
    resolveChatSessionModel,
    getChatModelVersion,
    assignChatModel,
  };
}
