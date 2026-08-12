import { Children, memo, useState, type ReactElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  RiCheckLine,
  RiClipboardLine,
  RiFullscreenExitLine,
  RiFullscreenLine,
  RiArrowDownSLine,
  RiArrowUpSLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";
import { HtmlPreview } from "./HtmlPreview";

function CodeBlock({
  language,
  code,
  streaming,
}: {
  language: string;
  code: string;
  streaming?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"code" | "preview">("code");
  const [expanded, setExpanded] = useState(false);
  const [previewMaximized, setPreviewMaximized] = useState(false);
  const isHtml = /^(html?|xhtml)$/i.test(language);
  const isLongCode = code.split("\n").length > 24;

  const copy = async () => {
    try {
      await copyToClipboard(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard unavailable – leave the button idle. */
    }
  };

  return (
    <div
      className={
        previewMaximized && isHtml && activeTab === "preview"
          ? "fixed inset-3 z-50 flex flex-col overflow-hidden rounded-lg border bg-muted shadow-2xl dark:bg-muted/20"
          : "my-3 overflow-hidden rounded-lg border bg-muted/40 dark:bg-muted/20"
      }
    >
      <div className="flex shrink-0 items-center justify-between border-b bg-muted py-1 pr-1 pl-3 dark:bg-muted">
        {isHtml ? (
          <div className="flex items-center gap-1" role="tablist" aria-label="Codebox view">
            {(["code", "preview"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`relative px-2.5 py-1 text-xs font-medium transition-colors after:absolute after:inset-x-1 after:-bottom-[5px] after:h-0.5 after:rounded-full after:transition-colors ${
                  activeTab === tab
                    ? "text-foreground after:bg-foreground"
                    : "text-muted-foreground after:bg-transparent hover:text-foreground hover:after:bg-muted-foreground/40"
                }`}
              >
                {tab === "code" ? "Code" : "Preview"}
              </button>
            ))}
          </div>
        ) : (
          <span className="font-mono text-xs font-medium text-muted-foreground">
            {language || "code"}
          </span>
        )}
        <div className="flex items-center gap-1">
          {isHtml && (
            <span className="mr-1 font-mono text-xs text-muted-foreground">{language}</span>
          )}
          {isHtml && activeTab === "preview" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
              onClick={() => setPreviewMaximized((current) => !current)}
              title={previewMaximized ? "Restore preview" : "Maximize preview"}
              aria-label={previewMaximized ? "Restore preview" : "Maximize preview"}
            >
              {previewMaximized ? (
                <RiFullscreenExitLine className="size-3.5" />
              ) : (
                <RiFullscreenLine className="size-3.5" />
              )}
              {previewMaximized ? "Restore" : "Maximize"}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
            onClick={copy}
          >
            {copied ? (
              <RiCheckLine className="size-3.5 text-green-500" />
            ) : (
              <RiClipboardLine className="size-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
      {activeTab === "preview" && isHtml ? (
        <HtmlPreview
          code={code}
          className={previewMaximized ? "min-h-0 flex-1" : undefined}
        />
      ) : (
        <>
          <pre
            className={`${
              expanded || streaming
                ? "overflow-x-auto"
                : "max-h-[16rem] overflow-hidden"
            } p-3 font-mono text-[13px] leading-relaxed`}
          >
            {code}
          </pre>
          {isLongCode && !streaming && (
            <div className="flex justify-center px-3 py-1.5">
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {expanded ? (
                  <RiArrowUpSLine className="size-4" />
                ) : (
                  <RiArrowDownSLine className="size-4" />
                )}
                {expanded ? "Show less" : "Show more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const inlineCodeClass =
  "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground dark:bg-muted/60";

const headingClass =
  "font-heading font-semibold tracking-tight text-foreground first:mt-0";

export const Markdown = memo(function Markdown({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-2.5 text-sm leading-relaxed text-foreground [&_*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => {
            const child = Children.toArray(children)[0] as ReactElement<{
              className?: string;
              children?: ReactNode;
            }>;
            const language =
              /language-([\w-]+)/.exec(child?.props?.className ?? "")?.[1] ??
              "text";
            const code = String(child?.props?.children ?? "").replace(
              /\n$/,
              "",
            );
            return <CodeBlock language={language} code={code} streaming={streaming} />;
          },
          code: ({ className, children }) => {
            // Block code is handled entirely by the `pre` override above.
            if (className?.includes("language-")) return <>{children}</>;
            return <code className={inlineCodeClass}>{children}</code>;
          },
          h1: ({ children }) => (
            <h1 className={`${headingClass} mt-5 text-xl`}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className={`${headingClass} mt-4 text-lg`}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className={`${headingClass} mt-4 text-base`}>{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className={`${headingClass} mt-4 text-sm`}>{children}</h4>
          ),
          p: ({ children }) => <p className="my-0">{children}</p>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          ul: ({ children }) => (
            <ul className="my-0 list-disc space-y-1 pl-5 marker:text-muted-foreground">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-0 list-decimal space-y-1 pl-5 marker:text-muted-foreground">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-0 border-l-2 border-primary/40 pl-3 text-muted-foreground italic">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-2 border-border" />,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/60 [&_th]:border-b [&_th]:border-border">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="[&_tr:last-child]:border-0">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="border-b border-border last:border-0">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-xs font-semibold text-muted-foreground whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 align-top">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});