import { useCallback, useEffect, useRef, useState } from "react";
import { RiLoader4Line as LoaderCircle } from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { chat, chats as chatsApi, models } from "../api/client";
import type {
  ChatAttachmentPreview,
  ChatContentPart,
  ChatMessage,
  ModelWithProvider,
} from "../types";
import { modelApiId, readChatStream } from "../lib/chat";
import ChatMessageView from "../components/chat/ChatMessage";
import ChatComposer from "../components/chat/ChatComposer";

const MODEL_STORAGE_KEY = "klove_chat_model";
const REASONING_STORAGE_PREFIX = "klove_chat_reasoning:";

export default function ChatPage({
  chatId,
  onChatCreated,
  onTitle,
  onTitleGenerationStart,
  username,
}: {
  chatId: string | null;
  onChatCreated: (id: string) => void;
  onTitle: (event: { chat_id: string; title: string }) => void;
  onTitleGenerationStart: (id: string) => void;
  username: string;
}) {
  const [modelList, setModelList] = useState<ModelWithProvider[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(() =>
    localStorage.getItem(MODEL_STORAGE_KEY),
  );
  const [selectedReasoningEffort, setSelectedReasoningEffort] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachmentPreview[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const skipNextChatLoadRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const selectedModelRecord = modelList.find(
    (model) => modelApiId(model.provider_name, model.model_id) === selectedModel,
  );
  const reasoningEfforts = selectedModelRecord?.reasoning_efforts ?? [];

  useEffect(() => {
    if (!selectedModel) {
      setSelectedReasoningEffort(null);
      return;
    }
    const efforts = modelList.find(
      (model) => modelApiId(model.provider_name, model.model_id) === selectedModel,
    )?.reasoning_efforts ?? [];
    const stored = localStorage.getItem(`${REASONING_STORAGE_PREFIX}${selectedModel}`);
    const next = efforts.some((effort) => effort.effort === stored)
      ? stored
      : efforts.find((effort) => effort.is_default)?.effort ?? efforts[0]?.effort ?? null;
    setSelectedReasoningEffort(next);
  }, [modelList, selectedModel]);

  useEffect(() => {
    if (selectedModel) localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    let cancelled = false;
    models
      .listAll()
      .then((list) => {
        if (cancelled) return;
        setModelList(list);
        setModelsError(null);
        // Drop a persisted selection that no longer exists.
        setSelectedModel((prev) => {
          if (!prev) return prev;
          return list.some(
            (m) => modelApiId(m.provider_name, m.model_id) === prev,
          )
            ? prev
            : null;
        });
      })
      .catch((error) => {
        if (!cancelled) setModelsError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false);
      });
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    if (skipNextChatLoadRef.current === chatId) {
      skipNextChatLoadRef.current = null;
      return;
    }
    chatsApi.get(chatId).then((result) => {
      if (!cancelled) setMessages(result.messages);
    }).catch(() => {
      if (!cancelled) setMessages([]);
    });
    return () => { cancelled = true; };
  }, [chatId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const updateMessage = useCallback(
    (id: string, updater: (message: ChatMessage) => ChatMessage) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === id ? updater(message) : message,
        ),
      );
    },
    [],
  );

  const onSelectModel = (id: string) => {
    setSelectedModel(id);
    localStorage.setItem(MODEL_STORAGE_KEY, id);
  };

  const onSelectReasoningEffort = (effort: string) => {
    setSelectedReasoningEffort(effort);
    if (selectedModel) localStorage.setItem(`${REASONING_STORAGE_PREFIX}${selectedModel}`, effort);
  };

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const next: ChatAttachmentPreview[] = [];
    for (const file of Array.from(files).slice(0, 8)) {
      if (file.size > 20 * 1024 * 1024) continue;
      const isImage = file.type.startsWith("image/");
      if (isImage) {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        }).catch(() => "");
        if (!data) continue;
        next.push({
          id: crypto.randomUUID(),
          name: file.name,
          kind: "image",
          mimeType: file.type,
          data,
          preview: data,
        });
      } else {
        const text = await file.text().catch(() => "");
        if (!text) continue;
        next.push({
          id: crypto.randomUUID(),
          name: file.name,
          kind: "text",
          mimeType: file.type || "text/plain",
          data: text,
        });
      }
    }
    setAttachments((current) => [...current, ...next]);
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !attachments.length) || streaming || !selectedModel) return;

    const textAttachments = attachments
      .filter((attachment) => attachment.kind === "text")
      .map(
        (attachment) =>
          `\n\n[Arquivo: ${attachment.name}]\n${attachment.data}`,
      )
      .join("");
    const imageParts = attachments
      .filter((attachment) => attachment.kind === "image" && attachment.preview)
      .map((attachment) => ({
        type: "image_url" as const,
        image_url: { url: attachment.preview! },
      }));
    const userContent: ChatContentPart[] = [
      ...(text || textAttachments
        ? [{ type: "text" as const, text: `${text}${textAttachments}`.trim() }]
        : []),
      ...imageParts,
    ];
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userContent,
      attachments: [...attachments],
    };
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      reasoning: undefined,
      stats: null,
    };

    const history = [...messagesRef.current, userMessage].map((message) => ({
      role: message.role,
      content: message.content,
    }));

    let activeChatId = chatId;
    if (!activeChatId) {
      const created = await chatsApi.create({ model: selectedModel });
      activeChatId = created.id;
      skipNextChatLoadRef.current = created.id;
      onChatCreated(created.id);
    }
    if (activeChatId && messagesRef.current.length === 0) {
      onTitleGenerationStart(activeChatId);
    }
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setAttachments([]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await chat.completions(
        {
          model: selectedModel,
          ...(selectedReasoningEffort ? { reasoning_effort: selectedReasoningEffort } : {}),
          chat_id: activeChatId ?? undefined,
          attachments,
          messages: history,
        },
        controller.signal,
      );
      await readChatStream(response, {
        onContent: (delta) =>
          updateMessage(assistantMessage.id, (message) => ({
            ...message,
            content:
              (typeof message.content === "string" ? message.content : "") +
              delta,
          })),
        onReasoning: (delta) =>
          updateMessage(assistantMessage.id, (message) => ({
            ...message,
            reasoning: (message.reasoning ?? "") + delta,
          })),
        onUsage: () => {
          /* The final klove_stats event carries the authoritative counts. */
        },
        onStats: (stats) =>
          updateMessage(assistantMessage.id, (message) => ({
            ...message,
            stats,
          })),
        onTitle,
        onError: (errorMessage) =>
          updateMessage(assistantMessage.id, (message) => ({
            ...message,
            error: message.error
              ? `${message.error}\n${errorMessage}`
              : errorMessage,
          })),
      });
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        updateMessage(assistantMessage.id, (message) => ({
          ...message,
          error: error?.message ?? "Chat request failed",
        }));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStreaming(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  if (loadingModels) {
    return (
      <div className="flex justify-center p-12">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative flex h-svh flex-col">
      {modelsError && (
        <div className="flex justify-center px-6 pt-4">
          <Alert variant="destructive" className="w-full max-w-3xl">
            <AlertDescription>{modelsError}</AlertDescription>
          </Alert>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-5 px-6 pb-6 pt-6">
          {messages.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center">
              <h2 className="chat-greeting-title text-4xl tracking-tight sm:text-5xl">
                <span className="chat-greeting-hello" data-text="Hello,">Hello,</span>{" "}
                <span className="chat-greeting-name">{username}</span>
              </h2>
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessageView
                key={message.id}
                message={message}
                modelName={message.stats?.model ? modelList.find((model) => modelApiId(model.provider_name, model.model_id) === message.stats?.model)?.display_name ?? undefined : undefined}
                streaming={streaming && message.id === messages.at(-1)?.id}
              />
            ))
          )}
          <div ref={endRef} className="h-48 shrink-0" />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
        <div className="pointer-events-auto">
          <ChatComposer
            value={input}
            onChange={setInput}
            onKeyDown={onKeyDown}
            onSend={() => void send()}
            onStop={stop}
            attachments={attachments}
            onAddFiles={addFiles}
            onRemoveAttachment={(id) =>
              setAttachments((current) => current.filter((item) => item.id !== id))
            }
            models={modelList}
            selectedModel={selectedModel}
            onSelectModel={onSelectModel}
            reasoningEfforts={reasoningEfforts}
            selectedReasoningEffort={selectedReasoningEffort}
            onSelectReasoningEffort={onSelectReasoningEffort}
            streaming={streaming}
          />
        </div>
      </div>
    </div>
  );
}