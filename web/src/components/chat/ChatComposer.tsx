import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import {
  RiAddLine as AddLine,
  RiSendPlaneFill as SendPlaneFill,
  RiStopLine as StopLine,
  RiCloseLine as CloseLine,
  RiFileTextLine as FileTextLine,
  RiMusic2Line as AudioLine,
  RiVideoLine as VideoLine,
  RiFilePdf2Line as PdfLine,
} from "@remixicon/react";
import ModelSettingsMenu from "./ModelSettingsMenu";
import ContextUsageIndicator from "./ContextUsageIndicator";
import type {
  ChatAttachmentPreview,
  ModelWithProvider,
} from "../../types";

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onStop: () => void;
  attachments: ChatAttachmentPreview[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
  models: ModelWithProvider[];
  selectedModel: string | null;
  onSelectModel: (id: string) => void;
  reasoningEfforts: ModelWithProvider["reasoning_efforts"];
  selectedReasoningEffort: string | null;
  onSelectReasoningEffort: (effort: string) => void;
  contextWindow: number | null | undefined;
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  streaming: boolean;
};

export default function ChatComposer({
  value,
  onChange,
  onKeyDown,
  onPaste,
  onSend,
  onStop,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  models,
  selectedModel,
  onSelectModel,
  reasoningEfforts,
  selectedReasoningEffort,
  onSelectReasoningEffort,
  contextWindow,
  promptTokens,
  completionTokens,
  cacheReadTokens,
  cacheWriteTokens,
  streaming,
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const disabled = !selectedModel;
  const canSend = Boolean(selectedModel && (value.trim() || attachments.length) && !streaming);

  return (
    <div className="px-0">
      <div className="mx-auto w-full max-w-[768px] 2xl:max-w-[854px]">
        <div className="chat-composer-card flex w-full flex-col rounded-[24px] border border-border bg-card text-foreground shadow-[0px_4px_16px_0px_rgba(0,0,0,0.05)]">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,audio/*,video/mp4,video/webm,video/quicktime,application/pdf,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.java,.go,.rs,.html,.css,.xml,.yaml,.yml,.log"
            className="hidden"
            onChange={(event) => {
              onAddFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          {attachments.length > 0 && (
            <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto px-3.5 pt-3">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="chat-inline-notice group relative flex max-w-full items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-xs">
                  {attachment.kind === "image" && attachment.preview ? (
                    <img src={attachment.preview} alt={`Preview: ${attachment.name}`} className="size-8 rounded-md object-cover" />
                  ) : attachment.kind === "audio" ? <AudioLine className="ml-1 size-4 shrink-0 text-tertiary" /> : attachment.kind === "video" ? <VideoLine className="ml-1 size-4 shrink-0 text-tertiary" /> : attachment.kind === "file" ? <PdfLine className="ml-1 size-4 shrink-0 text-tertiary" /> : <FileTextLine className="ml-1 size-4 shrink-0 text-tertiary" />}
                  <span className="max-w-40 truncate font-medium">{attachment.name}</span>
                  <button
                    type="button"
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-tertiary transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onRemoveAttachment(attachment.id)}
                    aria-label={`Remove ${attachment.name}`}
                  >
                    <CloseLine className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative overflow-hidden px-3.5 py-3">
            <textarea
              className="block min-h-[52px] w-full resize-none overflow-x-hidden bg-transparent p-0 text-base leading-6 tracking-[-0.32px] text-foreground outline-none placeholder:text-placeholder disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Send a Message"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              disabled={disabled || streaming}
              rows={1}
              aria-label="Chat message"
            />
          </div>
          <div className="flex items-center justify-between gap-2 px-3.5 pb-3">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={streaming}
                title="Add images, audio, video or files"
                aria-label="Add images, audio, video or files"
                className="flex size-[30px] shrink-0 items-center justify-center rounded-full border border-border bg-transparent p-1.5 text-tertiary transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                <AddLine className="size-4" />
              </button>
              <ContextUsageIndicator
                contextWindow={contextWindow}
                promptTokens={promptTokens}
                completionTokens={completionTokens}
                cacheReadTokens={cacheReadTokens}
                cacheWriteTokens={cacheWriteTokens}
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ModelSettingsMenu
                models={models}
                selectedModel={selectedModel}
                onSelectModel={onSelectModel}
                reasoningEfforts={reasoningEfforts}
                selectedReasoningEffort={selectedReasoningEffort}
                onSelectReasoningEffort={onSelectReasoningEffort}
                disabled={streaming}
              />
              {streaming ? (
                <button
                  type="button"
                  onClick={() => onStop()}
                  title="Stop generating"
                  aria-label="Stop generating"
                  className="flex size-[30px] shrink-0 items-center justify-center rounded-full border border-border bg-foreground p-2 text-background transition-opacity hover:opacity-80"
                >
                  <StopLine className="size-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSend}
                  disabled={!canSend}
                  title="Send message"
                  aria-label="Send message"
                  className="flex size-[30px] shrink-0 items-center justify-center rounded-full border border-border bg-overlay p-2 text-foreground transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <SendPlaneFill className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
