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
  }, [src, sources]);
  // Shape comes from the image's intrinsic aspect ratio, which never changes
  // for a given URL — unlike the rendered box, it cannot race refetches that
  // recreate the sources array after the image has already loaded.
  useEffect(() => {
    setIsSquare(false);
    const image = imageRef.current;
    if (!image) return;
    const updateShape = () => {
      const width = image.naturalWidth || image.getBoundingClientRect().width;
      const height = image.naturalHeight || image.getBoundingClientRect().height;
      const largest = Math.max(width, height);
      setIsSquare(width > 0 && height > 0 && largest - Math.min(width, height) <= largest * 0.05);
    };
    image.addEventListener("load", updateShape);
    if (image.complete) updateShape();
    return () => image.removeEventListener("load", updateShape);
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
