import {
  RiAttachmentLine as FilesIcon,
  RiBrainLine as ReasoningIcon,
  RiFlashlightLine as StreamingIcon,
  RiLoopLeftLine as ContinuousIcon,
  RiMicLine as AudioInputIcon,
  RiMusicLine as AudioOutputIcon,
  RiToolsLine as ToolsIcon,
  RiVideoLine as VideoIcon,
  RiEyeLine as VisionIcon,
} from "@remixicon/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ModelCapabilities } from "../types";

type CapabilityKey = Exclude<
  keyof ModelCapabilities,
  "image_generation" | "text_to_speech" | "video_generation"
>;

const capabilityMeta: Record<CapabilityKey, { label: string; hint: string; icon: typeof ToolsIcon }> = {
  reasoning: { label: "Reasoning", hint: "Supports extended thinking or reasoning effort", icon: ReasoningIcon },
  tools: { label: "Tools", hint: "Supports function and tool calling", icon: ToolsIcon },
  vision: { label: "Vision", hint: "Accepts image input", icon: VisionIcon },
  audio_input: { label: "Audio input", hint: "Accepts audio input", icon: AudioInputIcon },
  audio_output: { label: "Audio output", hint: "Can return synthesized audio", icon: AudioOutputIcon },
  video: { label: "Video", hint: "Accepts video input", icon: VideoIcon },
  attachments: { label: "Files", hint: "Accepts file attachments", icon: FilesIcon },
  streaming: { label: "Streaming", hint: "Streams tokens as they are generated", icon: StreamingIcon },
  non_streaming: { label: "Non-streaming", hint: "Also supports non-streamed responses", icon: ContinuousIcon },
};

export function formatContextWindow(value: number): string {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return value.toLocaleString();
}

export function ModelCapabilityBadges({
  capabilities,
  contextWindow,
}: {
  capabilities?: Partial<ModelCapabilities> | null;
  contextWindow?: number | null;
}) {
  const supported = (Object.keys(capabilityMeta) as CapabilityKey[]).filter(
    (key) => capabilities?.[key] === true,
  );
  if (contextWindow == null && !supported.length) return null;

  return (
    <div className="flex shrink-0 flex-nowrap items-center gap-1">
      {contextWindow != null && (
        <Tooltip>
          <TooltipTrigger
            render={<span />}
            className="inline-flex h-5 items-center gap-1 rounded-md bg-accent px-1.5 font-mono text-[10px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
            aria-label={`Context window: ${contextWindow.toLocaleString()} tokens`}
          >
            {formatContextWindow(contextWindow)}
            <span className="font-sans font-normal text-tertiary">context</span>
          </TooltipTrigger>
          <TooltipContent>
            {contextWindow.toLocaleString()} token context window
          </TooltipContent>
        </Tooltip>
      )}
      {supported.map((key) => {
        const meta = capabilityMeta[key];
        const Icon = meta.icon;
        return (
          <Tooltip key={key}>
            <TooltipTrigger
              render={<span />}
              className="inline-flex size-5 items-center justify-center rounded-md border border-border text-tertiary transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong"
              aria-label={meta.label}
            >
              <Icon className="size-3" />
            </TooltipTrigger>
            <TooltipContent>
              <span className="font-medium text-foreground">{meta.label}</span>
              <span className="text-tertiary">- {meta.hint}</span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export default ModelCapabilityBadges;
