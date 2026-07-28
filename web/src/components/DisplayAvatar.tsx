import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  src?: string | null;
  className?: string;
};

export default function DisplayAvatar({ name, src, className }: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <Avatar className={cn("size-10", className)}>
      {!failed && <AvatarImage src={src ?? undefined} alt="" onError={() => setFailed(true)} />}
      <AvatarFallback>{initial}</AvatarFallback>
    </Avatar>
  );
}
