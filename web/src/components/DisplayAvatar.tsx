import { useEffect, useRef, useState } from "react";
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
  const imageRef = useRef<HTMLImageElement>(null);
  const [index, setIndex] = useState(0);
  const [isSquare, setIsSquare] = useState(false);
  const current = candidates[index];
  const isTransparentLogo = current?.includes("router.bynara.id") ?? false;
  useEffect(() => {
    setIndex(0);
    setIsSquare(false);
  }, [src, sources]);
  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    const updateShape = () => {
      const { width, height } = image.getBoundingClientRect();
      setIsSquare(width > 0 && height > 0 && Math.abs(width - height) < 1);
    };
    const observer = new ResizeObserver(updateShape);
    observer.observe(image);
    if (image.complete) updateShape();
    return () => observer.disconnect();
  }, [current]);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return current ? (
    <img
      ref={imageRef}
      src={current}
      alt=""
      className={cn(
        "max-h-full max-w-full object-contain",
        isSquare && !isTransparentLogo && "rounded-full",
        className,
      )}
      onError={() => {
        setIsSquare(false);
        setIndex((value) => value + 1);
      }}
    />
  ) : (
    <span className={cn("text-lg font-medium text-muted-foreground", className)}>{initial}</span>
  );
}
