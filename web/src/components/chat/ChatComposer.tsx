import { useRef, type KeyboardEvent } from "react";
import {
  RiAddLine as AddLine,
  RiSendPlaneFill as SendPlaneFill,
  RiStopLine as StopLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import ModelInput from "./ModelInput";
import ReasoningInput from "./ReasoningInput";
import type {
  ChatAttachmentPreview,
  ModelWithProvider,
} from "../../types";

type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
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
  streaming: boolean;
};

export default function ChatComposer({
  value,
  onChange,
  onKeyDown,
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
  streaming,
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const disabled = !selectedModel || streaming;
  const canSend = Boolean(selectedModel && (value.trim() || attachments.length) && !streaming);

  return (
    <div className="chat-composer-shell shrink-0 px-6 pb-5 pt-3">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-2xl border border-border bg-card px-4 pt-3.5 pb-3 shadow-sm">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.java,.go,.rs,.html,.css,.xml,.yaml,.yml,.log"
            className="hidden"
            onChange={(event) => {
              onAddFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          {attachments.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2 px-1">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="group relative flex items-center gap-2 rounded-xl bg-muted px-2 py-1.5 text-xs">
                  {attachment.kind === "image" && attachment.preview ? (
                    <img src={attachment.preview} alt="" className="size-8 rounded-lg object-cover" />
                  ) : null}
                  <span className="max-w-32 truncate">{attachment.name}</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => onRemoveAttachment(attachment.id)}
                    aria-label={`Remove ${attachment.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="px-1">
            <textarea
              className="block min-h-12 max-h-48 w-full resize-none overflow-y-auto bg-transparent p-0 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Write a message..."
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={onKeyDown}
              disabled={disabled}
              rows={2}
              aria-label="Chat message"
            />
          </div>
          <div className="mt-3 flex min-h-8 items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={streaming}
                title="Add images or files"
                aria-label="Add images or files"
              >
                <AddLine className="size-[18px]" />
              </Button>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ModelInput
                models={models}
                value={selectedModel ?? ""}
                onChange={onSelectModel}
                disabled={streaming}
              />
              <ReasoningInput
                efforts={reasoningEfforts}
                value={selectedReasoningEffort}
                onChange={onSelectReasoningEffort}
                disabled={streaming}
              />
              {streaming ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="rounded-full"
                  onClick={onStop}
                  title="Stop generating"
                  aria-label="Stop generating"
                >
                  <StopLine className="size-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="icon"
                  className="rounded-full"
                  onClick={onSend}
                  disabled={!canSend}
                  title="Send message"
                  aria-label="Send message"
                >
                  <SendPlaneFill className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
