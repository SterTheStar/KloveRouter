import { useEffect, useState } from "react";
import {
  RiArrowDownSLine as ChevronDown,
  RiArrowRightSLine as ChevronRight,
  RiLoader4Line as LoaderCircle,
  RiFileCopyLine as CopyLine,
  RiCheckLine as CheckLine,
  RiRefreshLine as RefreshLine,
  RiEditLine as EditLine,
  RiDeleteBinLine as DeleteBinLine,
  RiCloseLine as CloseLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import type { ChatMessage, ModelWithProvider } from "../../types";
import { classifyChatError } from "../../lib/chat-errors";
import { formatDuration, formatTokens, formatTps } from "../../lib/chat";
import { Markdown } from "./Markdown";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

function formatModelNumber(value: number | null) {
  return value == null ? "—" : new Intl.NumberFormat().format(value);
}

function ModelTooltip({ model }: { model: ModelWithProvider }) {
  const capabilities = Object.entries(model.capabilities)
    .filter(([, enabled]) => enabled === true)
    .map(([name]) => name)
    .join(", ");

  return (
    <TooltipContent className="flex max-w-sm flex-col items-start gap-1">
      <span className="font-semibold">{model.display_name || model.model_id}</span>
      <span>Provider: {model.provider_name}</span>
      <span className="break-all">Model ID: {model.model_id}</span>
      {model.pretty_id && <span className="break-all">Public ID: {model.pretty_id}</span>}
      <span>Context: {formatModelNumber(model.context_window)} tokens</span>
      <span>Max output: {formatModelNumber(model.max_output_tokens)} tokens</span>
      <span>Capabilities: {capabilities || "—"}</span>
      <span className="break-all text-muted-foreground">Record ID: {model.id}</span>
    </TooltipContent>
  );
}

function UserAttachments({
  attachments,
}: {
  attachments: NonNullable<ChatMessage["attachments"]>;
}) {
  return (
    <div className="mt-1.5 flex max-w-[85%] flex-wrap justify-end gap-1.5 sm:max-w-[75%]">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="flex max-w-44 items-center gap-1.5 rounded-lg border border-border/80 bg-card px-2 py-1 text-[11px] text-muted-foreground shadow-sm"
          title={attachment.name}
        >
          {attachment.kind === "image" && attachment.preview ? (
            <img
              src={attachment.preview}
              alt=""
              className="size-5 shrink-0 rounded object-cover"
            />
          ) : (
            <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[8px] font-semibold text-muted-foreground">
              TXT
            </span>
          )}
          <span className="truncate">{attachment.name}</span>
        </div>
      ))}
    </div>
  );
}

function ChatStatsFooter({
  stats,
  modelName,
  model,
}: {
  stats: NonNullable<ChatMessage["stats"]>;
  modelName?: string;
  model?: ModelWithProvider;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {stats.model && (
        <Tooltip>
          <TooltipTrigger className="max-w-48 cursor-help truncate font-mono underline decoration-dotted underline-offset-2">
            {modelName || stats.model}
          </TooltipTrigger>
          {model ? <ModelTooltip model={model} /> : (
            <TooltipContent>Model ID: {stats.model}</TooltipContent>
          )}
        </Tooltip>
      )}
      <span className="font-mono">
        {formatTokens(stats.completion_tokens)} out ·{" "}
        <Tooltip>
          <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-2">
            {formatTokens(Math.max(0, stats.prompt_tokens - (stats.cache_read_tokens ?? 0)))} in
          </TooltipTrigger>
          <TooltipContent className="flex flex-col items-start gap-0.5">
            <span>Input total: {formatTokens(stats.prompt_tokens)}</span>
            <span>Cache read: {formatTokens(stats.cache_read_tokens ?? 0)}</span>
            <span>Input without cache: {formatTokens(Math.max(0, stats.prompt_tokens - (stats.cache_read_tokens ?? 0)))}</span>
          </TooltipContent>
        </Tooltip>
      </span>
      <span className="font-mono">{formatDuration(stats.duration_ms)}</span>
      {stats.tps > 0 && (
        <span className="font-mono font-medium text-primary">
          {formatTps(stats.tps)}
        </span>
      )}
    </div>
  );
}

function ThinkingBlock({ content, streaming }: { content: string; streaming?: boolean }) {
  const [open, setOpen] = useState(Boolean(streaming));

  useEffect(() => {
    setOpen(Boolean(streaming));
  }, [streaming]);

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        Thinking
      </button>
      {open && (
        <div className="mt-1.5 py-1 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {content}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  title,
  children,
  destructive,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`inline-flex size-6 items-center justify-center rounded-md transition-colors hover:bg-muted ${
        destructive ? "hover:text-destructive" : "hover:text-foreground"
      } text-muted-foreground`}
    >
      {children}
    </button>
  );
}

function messageRawText(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
}

export default function ChatMessageView({
  message,
  streaming,
  modelName,
  model,
  canRegenerate,
  onRegenerate,
  onEdit,
  onDelete,
}: {
  message: ChatMessage;
  streaming?: boolean;
  modelName?: string;
  model?: ModelWithProvider;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
  onEdit?: (text: string) => void;
  onDelete?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(messageRawText(message.content));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  if (message.role === "user") {
    const text = Array.isArray(message.content)
      ? message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text ?? "")
          .join("")
          .replace(/\n\n\[Arquivo: [^\]]+\]\n[\s\S]*$/g, "")
          .trim()
      : message.content;

    if (editing) {
      return (
        <div className="flex w-full flex-col items-end gap-2">
          <textarea
            className="max-h-64 min-h-20 w-full max-w-[85%] resize-y rounded-2xl rounded-br-md border border-primary/40 bg-card px-4 py-2.5 text-sm leading-relaxed text-foreground outline-none focus:border-primary sm:max-w-[75%]"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            autoFocus
            aria-label="Edit message"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setDraft("");
              }}
            >
              <CloseLine className="mr-1 size-3.5" /> Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!draft.trim()}
              onClick={() => {
                setEditing(false);
                setDraft("");
                onEdit?.(draft);
              }}
            >
              <CheckLine className="mr-1 size-3.5" /> Save &amp; resend
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="group flex flex-col items-end">
        {text && (
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground whitespace-pre-wrap sm:max-w-[75%]">
            {text}
          </div>
        )}
        {message.attachments?.length ? (
          <UserAttachments attachments={message.attachments} />
        ) : null}
        {!streaming && onEdit && (
          <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <ActionButton
              onClick={() => {
                setDraft(messageRawText(message.content));
                setEditing(true);
              }}
              title="Edit and resend"
            >
              <EditLine className="size-3.5" />
            </ActionButton>
          </div>
        )}
      </div>
    );
  }

  const classified = message.error ? classifyChatError(message.error) : null;

  return (
    <div className="group min-w-0 max-w-full">
      {message.reasoning ? (
        <ThinkingBlock content={message.reasoning} streaming={streaming} />
      ) : null}
      {typeof message.content === "string" && message.content ? (
        <Markdown content={message.content} streaming={streaming} />
      ) : streaming ? (
        <div className="flex items-center gap-2 py-1 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          <span className="text-xs">Thinking…</span>
        </div>
      ) : null}
      {classified ? (
        <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{classified.title}</p>
              {classified.hint && (
                <p className="mt-0.5 text-destructive/80">{classified.hint}</p>
              )}
              {classified.kind !== "unknown" && message.error && (
                <p className="mt-1 break-all text-destructive/70">{message.error}</p>
              )}
            </div>
            {classified.retryable && onRegenerate && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={onRegenerate}
              >
                <RefreshLine className="mr-1 size-3.5" /> Retry
              </Button>
            )}
          </div>
        </div>
      ) : null}
      {message.stats && typeof message.content === "string" ? (
        <ChatStatsFooter stats={message.stats} modelName={modelName} model={model} />
      ) : null}
      {!streaming && (onRegenerate || onDelete) && (
        <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {typeof message.content === "string" && message.content && (
            <ActionButton onClick={() => void copyMessage()} title={copied ? "Copied" : "Copy response"}>
              {copied ? <CheckLine className="size-3.5 text-primary" /> : <CopyLine className="size-3.5" />}
            </ActionButton>
          )}
          {canRegenerate && onRegenerate && (
            <ActionButton onClick={onRegenerate} title="Regenerate response">
              <RefreshLine className="size-3.5" />
            </ActionButton>
          )}
          {onDelete && (
            <ActionButton onClick={onDelete} title="Delete message" destructive>
              <DeleteBinLine className="size-3.5" />
            </ActionButton>
          )}
        </div>
      )}
    </div>
  );
}
