import { useRef } from "react";
import { RiImageAddLine, RiRefreshLine, RiUpload2Line } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import DisplayAvatar from "./DisplayAvatar";

export default function AvatarUpload({
  value,
  previewSrc,
  name,
  onChange,
  sources,
  label = "Avatar",
  onError,
  fallback = "initial",
}: {
  value: string | null;
  previewSrc?: string | null;
  name: string;
  onChange: (value: string | null) => void;
  sources?: string[];
  label?: string;
  onError?: (message: string) => void;
  fallback?: "initial" | "user";
}) {
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
    <div className="flex flex-col gap-4 rounded-xl border border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-center sm:gap-5">
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon"
        onChange={select}
      />
      <div className="flex size-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-background shadow-sm">
        {value || previewSrc || sources?.length ? (
          <DisplayAvatar
            name={name || "Avatar"}
            src={value ?? previewSrc}
            sources={sources}
            fallback={fallback}
            className="size-16 object-contain"
          />
        ) : (
          <RiImageAddLine className="size-7 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <div className="text-sm font-medium">{label}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {value ? "Custom image" : previewSrc || sources?.length ? "Using detected provider icon" : "Choose an image or use the provider initials"}
            <span className="block">PNG, JPEG, WebP, GIF, SVG or ICO · up to 25 MB</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
          >
            <RiUpload2Line className="size-4" />
            {value ? "Change image" : "Upload image"}
          </Button>
          {value && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onChange(null)}
            >
              <RiRefreshLine className="size-4" />
              Use detected icon
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
