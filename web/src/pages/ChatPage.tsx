import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import {
  RiLoader4Line as LoaderCircle,
  RiArrowDownLine as ArrowDownLine,
} from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { chats as chatsApi } from "../api/client";
import type {
  ChatAttachmentPreview,
  ChatContentPart,
  ChatMessage,
} from "../types";
import { modelApiId } from "../lib/chat";
import { effortOptions } from "../lib/chat-efforts";
import ChatMessageView from "../components/chat/ChatMessage";
import ChatComposer from "../components/chat/ChatComposer";
import { useChatModels } from "../hooks/use-chat-models";
import { useModelSelection } from "../hooks/use-model-selection";
import { useChatMessages } from "../hooks/use-chat-messages";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_ATTACHMENTS = 8;
const TEXT_EXTENSIONS = /\.(txt|md|json|csv|ts|tsx|js|jsx|py|java|go|rs|html|css|xml|yaml|yml|log)$/i;
const TEXT_MIME_TYPES = /^(text\/|application\/(json|javascript|xml|yaml)|image\/svg\+xml)/i;

export default function ChatPage({
  chatId,
  onChatCreated,
  onTitle,
  onTitleGenerationStart,
  onChatActivity,
  username,
}: {
  chatId: string | null;
  onChatCreated: (id: string) => void;
  onTitle: (event: { chat_id: string; title: string }) => void;
  onTitleGenerationStart: (id: string) => void;
  onChatActivity: (id: string) => void;
  username: string;
}) {
  const { modelList, loadingModels, modelsError, validModelIdsRef } = useChatModels();
  const {
    selectedModel,
    selectedReasoningEffort,
    modelSelectionError,
    persistModelPerChat,
    onSelectModel,
    onSelectReasoningEffort,
    resolveChatSessionModel,
    getChatModelVersion,
    assignChatModel,
  } = useModelSelection({ chatId, modelList, loadingModels, validModelIdsRef });
  const {
    messages,
    messagesRef,
    usage,
    streaming,
    updateMessage,
    setMessageList,
    appendMessages,
    skipNextLoad,
    stop,
    streamReply,
  } = useChatMessages({
    chatId,
    loadingModels,
    persistModelPerChat,
    resolveChatSessionModel,
    getChatModelVersion,
  });

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachmentPreview[]>([]);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);

  const selectedModelRecord = modelList.find(
    (model) =>
      modelApiId(model.provider_name, model.model_id, model.pretty_id) === selectedModel,
  );
  const reasoningEffortOptions = effortOptions(selectedModelRecord);

  useEffect(() => {
    if (!attachmentNotice) return;
    const timer = window.setTimeout(() => setAttachmentNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [attachmentNotice]);

  // Auto-scroll behavior: follow the stream only while the user is near the
  // bottom; expose a jump-to-bottom button otherwise.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const updateAutoScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      autoScrollRef.current = distanceFromBottom <= 48;
      setShowScrollDown(distanceFromBottom > 400);
    };

    updateAutoScroll();
    container.addEventListener("scroll", updateAutoScroll, { passive: true });
    return () => container.removeEventListener("scroll", updateAutoScroll);
  }, [chatId]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (autoScrollRef.current && container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
    }
  }, [messages]);

  const scrollToBottom = () => {
    autoScrollRef.current = true;
    setShowScrollDown(false);
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const buildUserContent = (
    text: string,
    currentAttachments: ChatAttachmentPreview[],
  ): ChatContentPart[] => {
    const textAttachments = currentAttachments
      .filter((attachment) => attachment.kind === "text")
      .map(
        (attachment) =>
          `\n\n[Arquivo: ${attachment.name}]\n${attachment.data}`,
      )
      .join("");
    const imageParts = currentAttachments
      .filter((attachment) => attachment.kind === "image" && attachment.preview)
      .map((attachment) => ({
        type: "image_url" as const,
        image_url: { url: attachment.preview! },
      }));
    return [
      ...(text || textAttachments
        ? [{ type: "text" as const, text: `${text}${textAttachments}`.trim() }]
        : []),
      ...imageParts,
    ];
  };

  const addFiles = async (files: File[] | FileList | null) => {
    if (!files?.length) return;
    const notices: string[] = [];
    const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    if (remaining === 0) {
      setAttachmentNotice(`Attachment limit of ${MAX_ATTACHMENTS} reached.`);
      return;
    }
    const next: ChatAttachmentPreview[] = [];
    for (const file of Array.from(files).slice(0, remaining)) {
      const isImage = file.type.startsWith("image/");
      const isText = TEXT_MIME_TYPES.test(file.type) || TEXT_EXTENSIONS.test(file.name);
      if (!isImage && !isText) {
        notices.push(`${file.name}: unsupported file type.`);
        continue;
      }
      if (isImage && selectedModelRecord?.capabilities?.vision === false) {
        notices.push(`${file.name}: the selected model does not support images.`);
        continue;
      }
      if (isText && selectedModelRecord?.capabilities?.attachments === false) {
        notices.push(`${file.name}: the selected model does not support file attachments.`);
        continue;
      }
      if (isImage && file.size > MAX_IMAGE_BYTES) {
        notices.push(`${file.name}: image exceeds ${formatBytes(MAX_IMAGE_BYTES)}.`);
        continue;
      }
      if (isText && file.size > MAX_TEXT_BYTES) {
        notices.push(`${file.name}: file exceeds ${formatBytes(MAX_TEXT_BYTES)}.`);
        continue;
      }
      if (isImage) {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        }).catch(() => "");
        if (!data) {
          notices.push(`${file.name}: could not read the file.`);
          continue;
        }
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
    if (notices.length) setAttachmentNotice(notices.join(" "));
    setAttachments((current) => [...current, ...next]);
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (streaming) return;
    const files = Array.from(event.clipboardData.files);
    const itemFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    const pastedFiles = files.length ? files : itemFiles;
    if (!pastedFiles.length) return;
    event.preventDefault();
    void addFiles(pastedFiles);
  };

  const runChat = useCallback(
    async (params: {
      chatId: string;
      history: { role: string; content: unknown }[];
      assistantMessageId: string;
      regenerate: boolean;
      attachments?: unknown[];
    }) => {
      if (!selectedModel) return;
      await streamReply({
        chatId: params.chatId,
        requestBody: {
          model: selectedModel,
          messages: params.history,
          ...(params.regenerate ? { regenerate: true } : {}),
          ...(params.regenerate ? {} : { attachments: params.attachments }),
        },
        assistantMessageId: params.assistantMessageId,
        usageFallback: usage,
        onTitle,
      });
    },
    [onTitle, selectedModel, streamReply, usage],
  );

  const send = async () => {
    const text = input.trim();
    if ((!text && !attachments.length) || streaming || !selectedModel) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: buildUserContent(text, attachments),
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
      assignChatModel(created.id, selectedModel);
      skipNextLoad(created.id);
      onChatCreated(created.id);
    }
    if (activeChatId && messagesRef.current.length === 0) {
      onTitleGenerationStart(activeChatId);
    }
    onChatActivity(activeChatId!);
    appendMessages(activeChatId, [userMessage, assistantMessage]);

    setInput("");
    setAttachments([]);
    setAttachmentNotice(null);

    await runChat({
      chatId: activeChatId,
      history,
      assistantMessageId: assistantMessage.id,
      regenerate: false,
      attachments: [...attachments],
    });
  };

  const regenerate = async (messageId: string) => {
    if (!chatId || streaming || !selectedModel) return;
    const index = messagesRef.current.findIndex((message) => message.id === messageId);
    if (index < 0 || messagesRef.current[index]?.role !== "assistant") return;
    try {
      await chatsApi.deleteMessage(chatId, messageId);
    } catch (error: any) {
      setActionError(error?.message ?? "Could not delete the message");
      return;
    }
    setActionError(null);
    const remaining = messagesRef.current.slice(0, index);
    setMessageList(chatId, remaining);
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      reasoning: undefined,
      stats: null,
    };
    appendMessages(chatId, [assistantMessage]);
    onChatActivity(chatId);
    await runChat({
      chatId,
      history: remaining.map((message) => ({ role: message.role, content: message.content })),
      assistantMessageId: assistantMessage.id,
      regenerate: true,
    });
  };

  const editMessage = async (messageId: string, newText: string) => {
    if (!chatId || streaming || !selectedModel) return;
    const index = messagesRef.current.findIndex((message) => message.id === messageId);
    if (index < 0 || messagesRef.current[index]?.role !== "user") return;
    const target = messagesRef.current[index];
    const trimmed = newText.trim();
    if (!trimmed) return;

    // Replace the text while keeping other parts (images) intact.
    let content: ChatMessage["content"];
    if (Array.isArray(target.content)) {
      const nextParts: ChatContentPart[] = [];
      let inserted = false;
      for (const part of target.content) {
        if (part.type === "text") {
          if (!inserted) {
            nextParts.push({ type: "text", text: trimmed });
            inserted = true;
          }
        } else {
          nextParts.push(part);
        }
      }
      if (!inserted) nextParts.unshift({ type: "text", text: trimmed });
      content = nextParts;
    } else {
      content = trimmed;
    }

    try {
      await chatsApi.updateMessage(chatId, messageId, {
        content,
        truncate_after: true,
      });
    } catch (error: any) {
      setActionError(error?.message ?? "Could not update the message");
      return;
    }
    setActionError(null);
    const remaining = messagesRef.current
      .slice(0, index + 1)
      .map((message) => (message.id === messageId ? { ...message, content } : message));
    setMessageList(chatId, remaining);
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      reasoning: undefined,
      stats: null,
    };
    appendMessages(chatId, [assistantMessage]);
    onChatActivity(chatId);
    await runChat({
      chatId,
      history: remaining.map((message) => ({ role: message.role, content: message.content })),
      assistantMessageId: assistantMessage.id,
      regenerate: true,
    });
  };

  const deleteMessage = async (messageId: string) => {
    if (!chatId || streaming) return;
    try {
      await chatsApi.deleteMessage(chatId, messageId);
    } catch (error: any) {
      setActionError(error?.message ?? "Could not delete the message");
      return;
    }
    setActionError(null);
    setMessageList(chatId, messagesRef.current.filter((message) => message.id !== messageId));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
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

  const topError = actionError ?? modelSelectionError ?? modelsError;

  return (
    <div className="relative flex h-svh flex-col">
      {topError && (
        <div className="flex justify-center px-6 pt-4">
          <Alert variant="destructive" className="w-full max-w-3xl">
            <AlertDescription>{topError}</AlertDescription>
          </Alert>
        </div>
      )}

      <div ref={messagesContainerRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-5 px-6 pb-6 pt-6">
          {messages.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center">
              <h2 className="chat-greeting-title text-4xl tracking-tight sm:text-5xl">
                <span className="chat-greeting-hello" data-text="Hello,">Hello,</span>{" "}
                <span className="chat-greeting-name">{username}</span>
              </h2>
            </div>
          ) : (
            messages.map((message, index) => {
              const isLast = index === messages.length - 1;
              const statsModel = message.stats?.model
                ? modelList.find(
                    (candidate) =>
                      modelApiId(candidate.provider_name, candidate.model_id, candidate.pretty_id) ===
                      message.stats?.model,
                  )
                : undefined;
              return (
                <ChatMessageView
                  key={message.id}
                  message={message}
                  model={statsModel}
                  modelName={statsModel?.display_name ?? undefined}
                  streaming={streaming && isLast}
                  canRegenerate={isLast && message.role === "assistant"}
                  onRegenerate={
                    message.role === "assistant" ? () => void regenerate(message.id) : undefined
                  }
                  onEdit={message.role === "user" ? (text) => void editMessage(message.id, text) : undefined}
                  onDelete={() => void deleteMessage(message.id)}
                />
              );
            })
          )}
          <div ref={endRef} className="h-48 shrink-0" />
        </div>
      </div>

      {showScrollDown && messages.length > 0 && (
        <Button
          type="button"
          size="icon"
          className="absolute bottom-44 right-6 z-10 rounded-full shadow-lg"
          onClick={scrollToBottom}
          title="Jump to latest"
          aria-label="Jump to latest"
        >
          <ArrowDownLine className="size-4" />
        </Button>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0">
        <div className="pointer-events-auto">
          {attachmentNotice && (
            <div className="mx-auto mb-2 w-fit max-w-[90%] rounded-lg border border-border bg-popover px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
              {attachmentNotice}
            </div>
          )}
          <ChatComposer
            value={input}
            onChange={setInput}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onSend={() => void send()}
            onStop={stop}
            attachments={attachments}
            onAddFiles={(files) => void addFiles(files)}
            onRemoveAttachment={(id) =>
              setAttachments((current) => current.filter((item) => item.id !== id))
            }
            models={modelList}
            selectedModel={selectedModel}
            onSelectModel={onSelectModel}
            reasoningEfforts={reasoningEffortOptions}
            selectedReasoningEffort={selectedReasoningEffort}
            onSelectReasoningEffort={onSelectReasoningEffort}
            contextWindow={selectedModelRecord?.context_window}
            promptTokens={usage.prompt_tokens}
            completionTokens={usage.completion_tokens}
            cacheReadTokens={usage.cache_read_tokens}
            cacheWriteTokens={usage.cache_write_tokens}
            streaming={streaming}
          />
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${bytes / (1024 * 1024)} MB` : `${bytes / 1024} KB`;
}
