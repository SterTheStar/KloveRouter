import { cn } from "@/lib/utils";

export function HtmlPreview({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  return (
    <iframe
      title="HTML preview"
      sandbox="allow-scripts"
      srcDoc={code}
      className={cn(
        "h-[min(65vh,720px)] min-h-[28rem] w-full border-0 bg-white",
        className,
      )}
    />
  );
}
