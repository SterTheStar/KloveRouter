import {
  RiCheckboxCircleLine,
  RiAlertLine,
  RiCloseCircleLine,
  RiQuestionLine,
} from "@remixicon/react";
import { cn } from "@/lib/utils";
import type { StatsProviderHealth } from "@/types";

interface StatusBadgeProps {
  status: StatsProviderHealth["status"] | null;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  if (!status) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs font-normal text-muted-foreground",
          className
        )}
      >
        <RiQuestionLine className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{label ?? "Not checked"}</span>
      </span>
    );
  }

  if (status === "online") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-xs font-normal text-emerald-700 dark:text-emerald-400",
          className
        )}
      >
        <RiCheckboxCircleLine className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{label ?? "Online"}</span>
      </span>
    );
  }

  if (status === "degraded") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-xs font-normal text-amber-800 dark:text-amber-400",
          className
        )}
      >
        <RiAlertLine className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{label ?? "Degraded"}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-xs font-normal text-destructive",
        className
      )}
    >
      <RiCloseCircleLine className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{label ?? "Offline"}</span>
    </span>
  );
}
