import { memo, type ReactNode } from "react";
import type { ChatMessage, ModelWithProvider } from "../../types";
import ChatMessageView from "./ChatMessage";

interface ChatMessagesProps {
  chatId: string;
  messages: ChatMessage[];
  streaming: boolean;
  /** Resolves the model a finished assistant turn ran on. */
  modelFor: (modelId: string | null | undefined) => ModelWithProvider | undefined;
  onRegenerate: (messageId: string) => void;
  onEdit: (messageId: string, text: string) => void;
  onDelete: (messageId: string) => void;
  emptyState: ReactNode;
}

/**
 * Renders the conversation. Each row only re-renders when its own message
 * object changes (the streaming reply gets a new object per paint; the rows
 * above it keep theirs) or when the streaming marker moves, so a long
 * conversation does not re-parse markdown for every token.
 */
function ChatMessages({
  chatId,
  messages,
  streaming,
  modelFor,
  onRegenerate,
  onEdit,
  onDelete,
  emptyState,
}: ChatMessagesProps) {
  if (messages.length === 0) return <>{emptyState}</>;
  const lastIndex = messages.length - 1;
  // When only `streaming` flips, every row is rebuilt except the last one
  // (streaming before → false, after → true); the comparator above keeps
  // their renders, so only the live row actually redraws.
  const rows = messages.map((message, index) => {
    const isLast = index === lastIndex;
    const statsModel = message.stats?.model ? modelFor(message.stats.model) : undefined;
    return (
      <ChatMessageView
        key={message.id}
        message={message}
        chatId={chatId}
        model={statsModel}
        modelName={statsModel?.display_name ?? undefined}
        streaming={streaming && isLast}
        canRegenerate={isLast && message.role === "assistant"}
        onRegenerate={message.role === "assistant" ? () => onRegenerate(message.id) : undefined}
        onEdit={message.role === "user" ? (text) => onEdit(message.id, text) : undefined}
        onDelete={() => onDelete(message.id)}
      />
    );
  });
  return <>{rows}</>;
}

export default memo(ChatMessages);
