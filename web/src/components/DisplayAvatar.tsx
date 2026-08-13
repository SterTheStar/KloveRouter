import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  src?: string | null;
  sources?: string[];
  className?: string;
};

export default function DisplayAvatar({ name, src, sources, className }: Props) {
  const candidates = src
    ? [src, ...(sources ?? []).filter((source) => source !== src)]
    : sources ?? [];
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [src, sources]);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const current = candidates[index];
  return (
    <Avatar className={cn("size-10", className)}>
      {current && <AvatarImage src={current} alt="" onError={() => setIndex((value) => value + 1)} />}
      <AvatarFallback>{initial}</AvatarFallback>
    </Avatar>
  );
}
