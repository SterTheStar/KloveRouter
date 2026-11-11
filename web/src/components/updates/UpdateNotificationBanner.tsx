import { useState } from "react";
import {
  RiCloseLine as Close,
  RiSparklingLine as Sparkling,
  RiArrowRightLine as ArrowRight,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";

interface UpdateNotificationBannerProps {
  version: string;
  tag: string;
  onViewUpdate: () => void;
}

export default function UpdateNotificationBanner({
  version,
  tag,
  onViewUpdate,
}: UpdateNotificationBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="relative isolate flex items-center justify-between gap-x-4 border-b border-primary/20 bg-primary/10 px-4 py-2.5 sm:px-6 text-foreground">
      <div className="flex items-center gap-x-2.5 text-xs sm:text-sm">
        <Sparkling className="size-4 shrink-0 text-primary animate-pulse" />
        <p className="leading-6">
          <strong className="font-semibold text-foreground">New version available:</strong>{" "}
          Saturn Router <span className="font-mono font-medium">{tag || `v${version}`}</span> is
          now available with updates and improvements.
        </p>
      </div>

      <div className="flex items-center gap-x-2">
        <Button
          size="sm"
          variant="default"
          className="h-7 text-xs gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={onViewUpdate}
        >
          Review & Update
          <ArrowRight className="size-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss notification"
        >
          <Close className="size-4" />
        </Button>
      </div>
    </div>
  );
}
