import { useEffect, useState } from "react";
import {
  RiArrowDownSLine as ChevronDown,
  RiArrowRightSLine as ChevronRight,
  RiLoader4Line as LoaderCircle,
  RiFileCopyLine as CopyLine,
  RiCheckLine as CheckLine,
} from "@remixicon/react";
import type { ChatMessage } from "../../types";

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
import { formatDuration, formatTokens, formatTps } from "../../lib/chat";
import { Markdown } from "./Markdown";

function ChatStatsFooter({
  stats,
  content,
  modelName,
}: {
  stats: NonNullable<ChatMessage["stats"]>;
  content: string;
  modelName?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {stats.model && <span className="max-w-48 truncate font-mono" title={stats.model}>{modelName || stats.model}</span>}
      <span className="font-mono">
        {formatTokens(stats.completion_tokens)} out ·{" "}
        {formatTokens(stats.prompt_tokens)} in
      </span>
      <span className="font-mono">{formatDuration(stats.duration_ms)}</span>
      {stats.tps > 0 && (
        <span className="font-mono font-medium text-primary">
          {formatTps(stats.tps)}
        </span>
      )}
      {content && (
        <button
          type="button"
          onClick={() => void copyMessage()}
          className="inline-flex size-6 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground"
          title={copied ? "Copied" : "Copy response"}
          aria-label={copied ? "Copied" : "Copy response"}
        >
          {copied ? <CheckLine className="size-3.5 text-primary" /> : <CopyLine className="size-3.5" />}
        </button>
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

export default function ChatMessageView({
  message,
  streaming,
  modelName,
}: {
  message: ChatMessage;
  streaming?: boolean;
  modelName?: string;
}) {
  if (message.role === "user") {
    const text = Array.isArray(message.content)
      ? message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text ?? "")
          .join("")
          .replace(/\n\n\[Arquivo: [^\]]+\]\n[\s\S]*$/g, "")
          .trim()
      : message.content;

    return (
      <div className="flex flex-col items-end">
        {text && (
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground whitespace-pre-wrap sm:max-w-[75%]">
            {text}
          </div>
        )}
        {message.attachments?.length ? (
          <UserAttachments attachments={message.attachments} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full">
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
      {message.error ? (
        <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {message.error}
        </div>
      ) : null}
      {message.stats && typeof message.content === "string" ? (
        <ChatStatsFooter stats={message.stats} content={message.content} modelName={modelName} />
      ) : null}
    </div>
  );
}