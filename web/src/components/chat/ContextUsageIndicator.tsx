import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatTokens } from "../../lib/chat";

type ContextUsageIndicatorProps = {
  contextWindow: number | null | undefined;
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export default function ContextUsageIndicator({
  contextWindow,
  promptTokens,
  completionTokens,
  cacheReadTokens,
  cacheWriteTokens,
}: ContextUsageIndicatorProps) {
  if (!contextWindow) return null;

  const totalTokens = promptTokens + completionTokens;
  const percentage = Math.min(100, (totalTokens / contextWindow) * 100);
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span />}
        className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Context usage"
      >
        <span
          className="inline-flex size-[18px] items-center justify-center rounded-full"
          style={{ background: `conic-gradient(currentColor ${percentage}%, color-mix(in srgb, currentColor 20%, transparent) 0)` }}
        >
          <span className="size-[12px] rounded-full bg-card" />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5">
          <div>{formatTokens(totalTokens)} / {formatTokens(contextWindow)} context tokens ({Math.round(percentage)}%)</div>
          {(cacheReadTokens > 0 || cacheWriteTokens > 0) && (
            <div className="text-muted-foreground">
              Cache: {formatTokens(cacheReadTokens)} read · {formatTokens(cacheWriteTokens)} write
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
