import { useRef } from "react";
import { Button } from "@/components/ui/button";
import DisplayAvatar from "./DisplayAvatar";

export default function AvatarUpload({
  value,
  name,
  onChange,
  sources,
  label = "Avatar",
  onError,
  fallback = "initial",
}: {
  value: string | null;
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
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon"
        onChange={select}
      />
      <div className="flex size-16 shrink-0 items-center justify-center">
        <DisplayAvatar name={name || "Avatar"} src={value} sources={sources} fallback={fallback} className="max-h-16 max-w-20" />
      </div>
      <div className="space-y-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
          >
            Change
          </Button>
          {value && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange(null)}
            >
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
