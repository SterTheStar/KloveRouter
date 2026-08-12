export function HtmlPreview({ code }: { code: string }) {
  return (
    <iframe
      title="HTML preview"
      sandbox="allow-scripts"
      srcDoc={code}
      className="h-[min(65vh,720px)] min-h-[28rem] w-full border-0 bg-white"
    />
  );
}
