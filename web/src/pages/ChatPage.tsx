import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import {
  RiLoader4Line as LoaderCircle,
  RiArrowDownLine as ArrowDownLine,
  RiErrorWarningLine as WarningLine,
  RiInformationLine as InfoLine,
} from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { chats as chatsApi } from "../api/client";
import type {
  ChatAttachmentMeta,
  ChatAttachmentPreview,
  ChatContentPart,
  ChatMessage,
  ModelWithProvider,
} from "../types";
import { modelApiId } from "../lib/chat";
import { effortOptions } from "../lib/chat-efforts";
import ChatMessages from "../components/chat/ChatMessages";
import ChatComposer from "../components/chat/ChatComposer";
import { useChatModels } from "../hooks/use-chat-models";
import { useModelSelection } from "../hooks/use-model-selection";
import { useChatMessages } from "../hooks/use-chat-messages";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_ATTACHMENTS = 8;
const TEXT_EXTENSIONS = /\.(txt|md|json|csv|ts|tsx|js|jsx|py|java|go|rs|html|css|xml|yaml|yml|log)$/i;
const TEXT_MIME_TYPES = /^(text\/|application\/(json|javascript|xml|yaml)|image\/svg\+xml)/i;
const AUDIO_MIME_TYPES = /^audio\/(mpeg|mp3|mp4|m4a|wav|webm|ogg|flac|aac|x-wav)$/i;
const VIDEO_MIME_TYPES = /^video\/(mp4|webm|quicktime|mpeg|3gpp)$/i;

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
    resumeGeneration,
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
  const clientStartedMessagesRef = useRef(new Set<string>());
  const resumedMessagesRef = useRef(new Set<string>());

  const selectedModelRecord = modelList.find(
    (model) =>
      (model.model_pool ? `pool/${model.pretty_id || model.model_id}` : modelApiId(model.provider_name, model.model_id, model.pretty_id)) === selectedModel,
  );
  const reasoningEffortOptions = effortOptions(selectedModelRecord);

  // Stable across renders so message rows (memoized) only re-render when
  // their own content changes.
  const modelsById = useMemo(() => {
    const map = new Map<string, ModelWithProvider>();
    for (const model of modelList) {
      map.set(
        model.model_pool
          ? `pool/${model.pretty_id || model.model_id}`
          : modelApiId(model.provider_name, model.model_id, model.pretty_id),
        model,
      );
    }
    return map;
  }, [modelList]);
  const modelFor = useCallback(
    (modelId: string | null | undefined) => (modelId ? modelsById.get(modelId) : undefined),
    [modelsById],
  );

  // The message action buttons pass these down as props; reading the newest
  // values through a ref keeps the callbacks stable so memoized rows are not
  // re-rendered just because a token arrived.
  const latest = useRef({ chatId, streaming, selectedModel, usage });
  latest.current = { chatId, streaming, selectedModel, usage };

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

  // Saved messages carry summaries (no payload). Text attachments keep their
  // content inline (`data_url`); editing a message relies on that to resend
  // it unchanged.
  const buildUserContent = useCallback((
    text: string,
    currentAttachments: (ChatAttachmentPreview | ChatAttachmentMeta)[],
  ): ChatContentPart[] => {
    const payload = (attachment: ChatAttachmentPreview | ChatAttachmentMeta) =>
      "data" in attachment && typeof attachment.data === "string"
        ? attachment.data
        : (attachment as ChatAttachmentMeta).data_url;
    const textAttachments = currentAttachments
      .filter((attachment) => attachment.kind === "text")
      .map((attachment) => `\n\n[Arquivo: ${attachment.name ?? "file"}]\n${payload(attachment) ?? ""}`)
      .join("");
    const imageParts = currentAttachments
      .filter((attachment) => attachment.kind === "image")
      .map((attachment) => ({ type: "image_url" as const, image_url: { url: (attachment as ChatAttachmentPreview).preview ?? (attachment as ChatAttachmentMeta).thumbnail ?? payload(attachment) ?? "" } }))
      .filter((part) => part.image_url.url);
    const audioParts = currentAttachments
      .filter((attachment) => attachment.kind === "audio")
      .map((attachment) => {
        const data = payload(attachment) ?? "";
        return {
          type: "input_audio" as const,
          input_audio: { data: data.split(",").at(-1) ?? data, format: (attachment.mimeType ?? "audio/wav").split("/").at(-1)?.replace("mpeg", "mp3") ?? "wav" },
        };
      })
      .filter((part) => part.input_audio.data);
    const videoParts = currentAttachments
      .filter((attachment) => attachment.kind === "video")
      .map((attachment) => ({
        type: "input_video" as const,
        video_url: { url: payload(attachment) ?? "" },
      }))
      .filter((part) => part.video_url.url);
    return [
      ...(text || textAttachments
        ? [{ type: "text" as const, text: `${text}${textAttachments}`.trim() }]
        : []),
      ...imageParts,
      ...audioParts,
      ...videoParts,
      ...currentAttachments.filter((attachment) => attachment.kind === "file").map((attachment) => ({
        type: "input_file" as const,
        file_data: payload(attachment) ?? "",
        filename: attachment.name ?? "file",
      })),
    ];
  }, []);

  const addFiles = async (files: File[] | FileList | null) => {
    if (!files?.length) return;
    const notices: string[] = [];
    const currentAttachments = attachments;
    const remaining = Math.max(0, MAX_ATTACHMENTS - currentAttachments.length);
    if (remaining === 0) {
      setAttachmentNotice(`Attachment limit of ${MAX_ATTACHMENTS} reached.`);
      return;
    }
    const next: ChatAttachmentPreview[] = [];
    const candidates = Array.from(files).slice(0, remaining);
    if (Array.from(files).length > candidates.length) {
      notices.push(`Only ${MAX_ATTACHMENTS} attachments can be added to one message.`);
    }
    for (const file of candidates) {
      const isImage = file.type.startsWith("image/");
      const isText = TEXT_MIME_TYPES.test(file.type) || TEXT_EXTENSIONS.test(file.name);
      const isAudio = AUDIO_MIME_TYPES.test(file.type);
      const isVideo = VIDEO_MIME_TYPES.test(file.type);
      const isFile = file.type === "application/pdf";
      if (!isImage && !isText && !isAudio && !isVideo && !isFile) {
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
      if (isFile && selectedModelRecord?.capabilities?.attachments === false) {
        notices.push(`${file.name}: the selected model does not support file attachments.`);
        continue;
      }
      if (isAudio && selectedModelRecord?.capabilities?.audio_input === false) {
        notices.push(`${file.name}: the selected model does not support audio input.`);
        continue;
      }
      if (isVideo && selectedModelRecord?.capabilities?.video === false) {
        notices.push(`${file.name}: the selected model does not support video input.`);
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
      if ((isAudio || isVideo) && file.size > MAX_MEDIA_BYTES) {
        notices.push(`${file.name}: media exceeds ${formatBytes(MAX_MEDIA_BYTES)}.`);
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
      } else if (isAudio || isVideo || isFile) {
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
          kind: isAudio ? "audio" : isVideo ? "video" : "file",
          mimeType: file.type,
          data,
          preview: URL.createObjectURL(file),
        });
      } else {
        const text = await file.text().catch(() => null);
        if (text === null) {
          notices.push(`${file.name}: could not read the file.`);
          continue;
        }
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
    setAttachments((current) => [...current, ...next].slice(0, MAX_ATTACHMENTS));
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
      clientStartedMessagesRef.current.add(params.assistantMessageId);
      await streamReply({
        chatId: params.chatId,
        requestBody: {
          model: selectedModel,
          ...(selectedReasoningEffort ? { reasoning_effort: selectedReasoningEffort } : {}),
          messages: params.history,
          ...(params.regenerate ? { regenerate: true } : {}),
          ...(params.regenerate ? {} : { attachments: params.attachments }),
        },
        assistantMessageId: params.assistantMessageId,
        usageFallback: latest.current.usage,
        onTitle,
        checkpoint: params.chatId === latest.current.chatId
          ? (content, reasoning) =>
              void chatsApi.updateMessage(params.chatId, params.assistantMessageId, { content, reasoning, truncate_after: false }).catch(() => undefined)
          : undefined,
      });
      clientStartedMessagesRef.current.delete(params.assistantMessageId);
    },
    [onTitle, selectedModel, streamReply],
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
    try {
      if (!activeChatId) {
        const created = await chatsApi.create({ model: selectedModel });
        activeChatId = created.id;
        assignChatModel(created.id, selectedModel);
        skipNextLoad(created.id);
        onChatCreated(created.id);
      }
    } catch (error: any) {
      setActionError(error?.message ?? "Could not create the conversation");
      return;
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

  const regenerate = useCallback(async (messageId: string) => {
    const { chatId, streaming, selectedModel } = latest.current;
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
    try {
      await runChat({
        chatId,
        history: remaining.map((message) => ({ role: message.role, content: message.content })),
        assistantMessageId: assistantMessage.id,
        regenerate: true,
      });
    } catch (error: any) {
      setActionError(error?.message ?? "Could not regenerate the response");
      void chatsApi.get(chatId).then((result) => setMessageList(chatId, result.messages)).catch(() => undefined);
    }
  }, [appendMessages, onChatActivity, runChat, setMessageList]);

  const editMessage = useCallback(async (messageId: string, newText: string) => {
    const { chatId, streaming, selectedModel } = latest.current;
    if (!chatId || streaming || !selectedModel) return;
    const index = messagesRef.current.findIndex((message) => message.id === messageId);
    if (index < 0 || messagesRef.current[index]?.role !== "user") return;
    const target = messagesRef.current[index];
    const trimmed = newText.trim();
    if (!trimmed) return;

    // Rebuild multimodal content from the saved attachment metadata so text
    // files remain included in the resent prompt along with pasted images.
    const savedAttachments = target.attachments ?? [];
    const content = buildUserContent(trimmed, savedAttachments);

    try {
      await chatsApi.updateMessage(chatId, messageId, {
        content,
        attachments: savedAttachments,
        truncate_after: true,
      });
    } catch (error: any) {
      setActionError(error?.message ?? "Could not update the message");
      return;
    }
    setActionError(null);
    const remaining = messagesRef.current
      .slice(0, index + 1)
      .map((message) => (message.id === messageId ? { ...message, content, attachments: savedAttachments } : message));
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
    try {
      await runChat({
        chatId,
        history: remaining.map((message) => ({ role: message.role, content: message.content })),
        assistantMessageId: assistantMessage.id,
        regenerate: true,
      });
    } catch (error: any) {
      setActionError(error?.message ?? "Could not resend the message");
      void chatsApi.get(chatId).then((result) => setMessageList(chatId, result.messages)).catch(() => undefined);
    }
  }, [appendMessages, buildUserContent, onChatActivity, runChat, setMessageList]);

  const deleteMessage = useCallback(async (messageId: string) => {
    const { chatId, streaming } = latest.current;
    if (!chatId || streaming) return;
    try {
      await chatsApi.deleteMessage(chatId, messageId);
    } catch (error: any) {
      setActionError(error?.message ?? "Could not delete the message");
      return;
    }
    setActionError(null);
    setMessageList(chatId, messagesRef.current.filter((message) => message.id !== messageId));
  }, [setMessageList]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  useEffect(() => {
    clientStartedMessagesRef.current.clear();
    resumedMessagesRef.current.clear();
  }, [chatId]);

  const lastMessage = messages.at(-1);
  const lastMessageId = lastMessage?.id;
  const lastMessageDone = Boolean(lastMessage && (lastMessage.stats || lastMessage.error));
  useEffect(() => {
    if (!chatId || !messages.length || !lastMessageId || lastMessageDone) return;
    // Only a reply that is not streaming in this view needs to be watched:
    // it may be running in the background (another tab, or after leaving the
    // chat). This replaces the former per-second full reload.
    if (streaming) return;
    if (clientStartedMessagesRef.current.has(lastMessageId) || resumedMessagesRef.current.has(lastMessageId)) return;
    resumedMessagesRef.current.add(lastMessageId);
    void resumeGeneration(chatId, lastMessageId, latest.current.selectedModel ?? "auto", onTitle, (content, reasoning) => {
      // Keep the partial reply durable while it streams.
      void chatsApi.updateMessage(chatId, lastMessageId, { content, reasoning, truncate_after: false }).catch(() => undefined);
    }).finally(() => {
      resumedMessagesRef.current.delete(lastMessageId);
    });
  }, [chatId, lastMessageId, lastMessageDone, messages.length, streaming, onTitle, resumeGeneration]);

  useEffect(() => {
    setInput("");
    setAttachments([]);
    setAttachmentNotice(null);
    setActionError(null);
    setShowScrollDown(false);
    autoScrollRef.current = true;
  }, [chatId]);

  useEffect(() => {
    if (!actionError) return;
    const timer = window.setTimeout(() => setActionError(null), 8000);
    return () => window.clearTimeout(timer);
  }, [actionError]);

  const topError = actionError ?? modelSelectionError ?? modelsError;
  const greeting = (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-24 text-center">
      {loadingModels ? (
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      ) : (
        <h2 className="chat-greeting-title font-serif text-[32px] font-normal leading-10 tracking-[-0.192px] text-foreground sm:text-[40px]">
          <span className="chat-greeting-hello" data-text="Hello,">Hello,</span>{" "}
          <span className="chat-greeting-name">{username}</span>
        </h2>
      )}
    </div>
  );

  return (
    <div className="relative flex h-svh min-h-0 flex-col overflow-hidden">
      {topError && (
        <div className="flex justify-center px-6 pt-4">
          <Alert variant="destructive" className="chat-error-panel w-full max-w-3xl">
            <WarningLine />
            <AlertDescription>{topError}</AlertDescription>
          </Alert>
        </div>
      )}

      <div ref={messagesContainerRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[768px] flex-col gap-6 px-4 pb-20 pt-8 2xl:max-w-[854px]">
          <ChatMessages
            chatId={chatId ?? ""}
            messages={messages}
            streaming={streaming}
            modelFor={modelFor}
            onRegenerate={regenerate}
            onEdit={editMessage}
            onDelete={deleteMessage}
            emptyState={greeting}
          />
          <div ref={endRef} className="h-12 shrink-0" />
        </div>
      </div>

      {showScrollDown && messages.length > 0 && (
        <Button
          type="button"
          size="icon"
          className="chat-inline-notice absolute bottom-44 right-6 z-10 rounded-full border border-border shadow-[0px_4px_16px_0px_rgba(0,0,0,0.05)]"
          onClick={scrollToBottom}
          title="Jump to latest"
          aria-label="Jump to latest"
        >
          <ArrowDownLine className="size-4" />
        </Button>
      )}

      <div className="chat-composer-shell pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10">
        {attachmentNotice && (
          <div className="chat-inline-notice mx-auto mb-2 flex w-fit max-w-[90%] items-start gap-2 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-muted-foreground" role="status" aria-live="polite">
            <InfoLine className="mt-0.5 size-3.5 shrink-0 text-primary" />
            {attachmentNotice}
          </div>
        )}
        <div className="pointer-events-auto">
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
