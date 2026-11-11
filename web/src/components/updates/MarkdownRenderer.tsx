import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  stripFirstH1?: boolean;
  repo?: string;
}

/**
 * Transforms GitHub references into functional markdown links:
 * - @username -> [@username](https://github.com/username)
 * - in <hash> or commit <hash> -> [hash](https://github.com/repo/commit/hash)
 * - #123 -> [#123](https://github.com/repo/pull/123)
 */
function linkifyGitHubReferences(markdown: string, repo = "SterTheStar/SaturnRouter"): string {
  let text = markdown;

  // 1. Linkify mentions: @username (e.g. "by @SterTheStar")
  text = text.replace(
    /(^|[^[/\w])@([a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38})/g,
    "$1[@$2](https://github.com/$2)",
  );

  // 2. Linkify commit hashes: "in 847fb4d" or "commit 847fb4d"
  text = text.replace(
    /\b(in|commit)\s+([0-9a-f]{7,40})\b/gi,
    (match, prefix, hash) => `${prefix} [${hash}](https://github.com/${repo}/commit/${hash})`,
  );

  // 3. Linkify issue / PR numbers: "#123"
  text = text.replace(
    /(^|[^\w#[\]])#(\d+)\b/g,
    (match, prefix, num) => `${prefix}[#${num}](https://github.com/${repo}/pull/${num})`,
  );

  return text;
}

export default function MarkdownRenderer({
  content,
  className,
  stripFirstH1 = true,
  repo = "SterTheStar/SaturnRouter",
}: MarkdownRendererProps) {
  // Remove redundant top-level h1 if present, since it duplicates the card title
  let processed = stripFirstH1
    ? content.replace(/^#\s+[^\n]+(?:\r?\n)+/, "")
    : content;

  // Auto-link mentions, commits and issues
  processed = linkifyGitHubReferences(processed, repo);

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
            <ul className="list-disc list-outside pl-4 mb-3 space-y-1.5 text-xs text-foreground/85">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside pl-4 mb-3 space-y-1.5 text-xs text-foreground/85">
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
          a: ({ href, children }) => {
            const label = typeof children === "string" ? children : "";
            const isMention = label.startsWith("@") || Boolean(href && /github\.com\/[^/]+$/i.test(href));
            const isCommit = Boolean(href && /github\.com\/[^/]+\/[^/]+\/commit\/[0-9a-f]{7,40}/i.test(href));

            let linkClass = "text-primary font-medium underline underline-offset-2 hover:text-primary/80 transition-colors";

            if (isMention) {
              linkClass =
                "inline-flex items-center font-medium text-[11px] text-foreground hover:text-primary hover:underline transition-colors";
            } else if (isCommit) {
              linkClass =
                "inline-flex items-center rounded bg-muted/80 px-1 py-0.2 font-mono text-[11px] text-primary hover:bg-muted hover:underline transition-colors border border-border/50 no-underline";
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
                onClick={(e) => e.stopPropagation()}
              >
                {children}
              </a>
            );
          },
          hr: () => <hr className="my-3 border-border/50" />,
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
