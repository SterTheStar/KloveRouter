import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  stripFirstH1?: boolean;
}

export default function MarkdownRenderer({
  content,
  className,
  stripFirstH1 = true,
}: MarkdownRendererProps) {
  // Remove redundant top-level h1 if present, since it duplicates the card title
  const cleanContent = stripFirstH1
    ? content.replace(/^#\s+[^\n]+(?:\r?\n)+/, "")
    : content;

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-base font-semibold tracking-tight text-foreground pb-1.5 mb-2.5 mt-4 border-b border-border first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-semibold tracking-tight text-foreground pb-1 mb-2 mt-4 border-b border-border/50 first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-semibold text-foreground mb-1.5 mt-3 first:mt-0">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-xs leading-relaxed text-foreground/85 mb-2.5 last:mb-0">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-outside pl-4 mb-3 space-y-1 text-xs text-foreground/85">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside pl-4 mb-3 space-y-1 text-xs text-foreground/85">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed marker:text-muted-foreground/60">
              {children}
            </li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground/90">
              {children}
            </em>
          ),
          code: ({ inline, className: codeClass, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className="rounded bg-muted/70 px-1 py-0.5 font-mono text-[11px] font-normal text-foreground border border-border/50"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className="block w-full overflow-x-auto rounded-lg bg-zinc-950 p-2.5 font-mono text-[11px] text-zinc-200 border border-border/60 my-2 leading-relaxed"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-2 overflow-hidden rounded-lg">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/50 pl-3 py-0.5 text-xs text-muted-foreground my-2.5 italic bg-muted/20 rounded-r">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary font-medium underline underline-offset-2 hover:text-primary/80 transition-colors"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-3 border-border/50" />,
        }}
      >
        {cleanContent}
      </ReactMarkdown>
    </div>
  );
}
