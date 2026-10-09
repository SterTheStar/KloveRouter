import { useState } from "react";
import { RiUserLine } from "@remixicon/react";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  src?: string | null;
  sources?: string[];
  className?: string;
  fallback?: "initial" | "user";
};

/** Ordered, deduplicated list of URLs to try: the display value first, then fallbacks. */
export function avatarCandidates(src: string | null | undefined, sources: string[] | undefined): string[] {
  return [...new Set([src, ...(sources ?? [])].filter((value): value is string => Boolean(value)))];
}

/**
 * Renders a provider or profile avatar. Tries each candidate URL in order and
 * falls through to initials / user icon when all of them fail.
 *
 * The failure index is keyed on the candidate list itself, so a changed list
 * starts again from the first candidate instead of inheriting a stale index.
 */
export default function DisplayAvatar({ name, src, sources, className, fallback = "initial" }: Props) {
  const candidates = avatarCandidates(src, sources);
  const listKey = candidates.join("\n");
  const [failed, setFailed] = useState<{ key: string; count: number }>({ key: listKey, count: 0 });
  const index = failed.key === listKey ? failed.count : 0;
  const current = candidates[index];
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  if (current) {
    return (
      <img
        key={current}
        src={current}
        alt=""
        className={cn("max-h-full max-w-full object-contain", className)}
        onError={() => setFailed({ key: listKey, count: index + 1 })}
      />
    );
  }

  if (fallback === "user") {
    return (
      <span
        className={cn(
          "flex h-full w-full shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
          className,
        )}
      >
        <RiUserLine className="size-1/2" />
      </span>
    );
  }

  return <span className={cn("text-lg font-medium text-muted-foreground", className)}>{initial}</span>;
}
