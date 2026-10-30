import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-border bg-background px-3 py-2 text-base transition-colors outline-none placeholder:text-placeholder hover:border-border-strong focus-visible:border-border-strong focus-visible:bg-card disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/60 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
