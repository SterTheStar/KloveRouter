import { useRef } from "react";
import { RiDeleteBinLine, RiImageAddLine, RiRefreshLine, RiUpload2Line } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import DisplayAvatar from "./DisplayAvatar";

/**
 * Edits an avatar. `value` is the custom image (null when none). When null,
 * the preview shows the detected icon: `sources` if given, else `previewSrc`,
 * else `previewFallbackUrl`. Detected icons are never written through onChange.
 */
export default function AvatarUpload({
  value,
  previewSrc,
  previewFallbackUrl,
  name,
  onChange,
  sources,
  label = "Avatar",
  onError,
  fallback = "initial",
}: {
  value: string | null;
  previewSrc?: string | null;
  previewFallbackUrl?: string | null;
  name: string;
  onChange: (value: string | null) => void;
  sources?: string[];
  label?: string;
  onError?: (message: string) => void;
  fallback?: "initial" | "user";
}) {
  const detected = sources?.length ? sources : [previewSrc, previewFallbackUrl].filter((v): v is string => Boolean(v));
  const hasDetected = detected.length > 0;
  const inputRef = useRef<HTMLInputElement>(null);
  const select = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    if (!file.type.startsWith("image/")) {
      onError?.("Choose an image file.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      onError?.("Avatar must be 25 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-4">
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon"
        onChange={select}
      />
      <div className={`flex size-16 shrink-0 items-center justify-center overflow-hidden bg-muted/70 ${fallback === "user" ? "rounded-full" : "rounded-xl"}`}>
        {value || hasDetected ? (
          <DisplayAvatar
            name={name || "Avatar"}
            src={value ?? detected[0]}
            sources={value ? detected : detected.slice(1)}
            fallback={fallback}
            className={`size-16 object-contain ${fallback === "user" ? "rounded-full" : "rounded-xl"}`}
          />
        ) : (
            <RiImageAddLine className="size-6 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <div className="text-sm font-medium">{label}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {value ? "Custom image" : hasDetected ? "Using detected provider icon" : "Choose an image or use the provider initials"}
            <span className="block">PNG, JPEG, WebP, GIF, SVG or ICO · up to 25 MB</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => inputRef.current?.click()}
          >
            <RiUpload2Line className="size-4" />
            {value ? "Change image" : "Upload image"}
          </Button>
          {value && (hasDetected || fallback === "user") && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onChange(null)}
            >
              {hasDetected ? <RiRefreshLine className="size-4" /> : <RiDeleteBinLine className="size-4" />}
              {hasDetected ? "Use detected icon" : "Remove image"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
