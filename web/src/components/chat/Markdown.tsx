import { Children, memo, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  const isMaximizedPreview = previewMaximized && isHtml && activeTab === "preview";

  const copy = async () => {
    try {
      await copyToClipboard(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard unavailable – leave the button idle. */
    }
  };

  const content = (
    <div
      className={
        isMaximizedPreview
          ? "fixed inset-[1%] z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0px_4px_16px_0px_rgba(0,0,0,0.05)]"
          : "my-3 overflow-hidden rounded-xl border border-border bg-card"
      }
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border bg-background/60 pr-1.5 pl-2">
        {isHtml ? (
          <div className="flex items-center gap-0.5" role="tablist" aria-label="Codebox view">
            {(["code", "preview"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`relative h-7 rounded-lg px-2.5 text-xs transition-colors ${
                  activeTab === tab
                    ? "bg-overlay/70 font-normal text-foreground"
                    : "text-tertiary hover:bg-accent hover:text-foreground"
                }`}
              >
                {tab === "code" ? "Code" : "Preview"}
              </button>
            ))}
          </div>
        ) : (
          <span className="px-2 font-mono text-xs text-tertiary">
            {language || "code"}
          </span>
        )}
        <div className="flex items-center gap-0.5">
          {isHtml && activeTab === "preview" && (
            <button
              type="button"
              className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-tertiary transition-colors hover:bg-accent hover:text-foreground"
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
            </button>
          )}
          <button
            type="button"
            className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-tertiary transition-colors hover:bg-accent hover:text-foreground"
            onClick={copy}
          >
            {copied ? (
              <RiCheckLine className="size-3.5 text-success" />
            ) : (
              <RiClipboardLine className="size-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      {activeTab === "preview" && isHtml ? (
        <HtmlPreview
          code={code}
          streaming={streaming}
          fill={isMaximizedPreview}
          className={isMaximizedPreview ? "min-h-0 flex-1" : undefined}
        />
      ) : (
        <>
          <pre
            className={`${
              expanded || streaming
                ? "overflow-x-auto"
                : "max-h-[16rem] overflow-hidden"
            } bg-background/60 p-3 font-mono text-[13px] leading-relaxed`}
          >
            {code}
          </pre>
          {isLongCode && !streaming && (
            <div className="flex justify-center bg-background/60 px-3 py-1.5">
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-tertiary transition-colors hover:text-foreground"
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

  return isMaximizedPreview ? createPortal(content, document.body) : content;
}

const inlineCodeClass =
  "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground dark:bg-muted/60";

const headingClass =
  "font-heading font-normal tracking-tight text-foreground first:mt-0";

const htmlDocumentStart = /(?:<!doctype\s+html\b[^>]*>|<html\b[^>]*>)/gi;
const htmlDocumentEnd = /<\/html\s*>/i;

function markdownFenceRanges(content: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  const fenceLine = /^ {0,3}(`{3,}|~{3,})[^\n]*$/gm;
  let open: { marker: string; start: number } | undefined;
  let match: RegExpExecArray | null;

  while ((match = fenceLine.exec(content))) {
    const marker = match[1];
    if (!open) {
      open = { marker, start: match.index };
    } else if (marker[0] === open.marker[0] && marker.length >= open.marker.length) {
      ranges.push({ start: open.start, end: fenceLine.lastIndex });
      open = undefined;
    }
  }

  if (open) ranges.push({ start: open.start, end: content.length });
  return ranges;
}

function isInMarkdownFence(index: number, ranges: Array<{ start: number; end: number }>) {
  return ranges.some((range) => index >= range.start && index < range.end);
}

function fenceUnfencedHtml(content: string) {
  const ranges = markdownFenceRanges(content);
  const replacements: Array<{ start: number; end: number; html: string }> = [];
  let match: RegExpExecArray | null;

  htmlDocumentStart.lastIndex = 0;
  while ((match = htmlDocumentStart.exec(content))) {
    const start = match.index;
    if (isInMarkdownFence(start, ranges)) continue;

    const endMatch = htmlDocumentEnd.exec(content.slice(htmlDocumentStart.lastIndex));
    if (!endMatch) continue;

    const end = htmlDocumentStart.lastIndex + endMatch.index + endMatch[0].length;
    if (isInMarkdownFence(end - 1, ranges)) continue;

    replacements.push({
      start,
      end,
      html: `\`\`\`html\n${content.slice(start, end)}\n\`\`\``,
    });
    htmlDocumentStart.lastIndex = end;
  }

  if (!replacements.length) return content;

  let result = "";
  let cursor = 0;
  for (const replacement of replacements) {
    result += content.slice(cursor, replacement.start) + replacement.html;
    cursor = replacement.end;
  }
  return result + content.slice(cursor);
}

const MARKDOWN_CACHE_MAX_CHARS = 12_000;
const MARKDOWN_CACHE_ENTRIES = 40;
/**
 * Parsed output keyed by source text (insertion order = LRU-ish eviction).
 * Only settled content is cached: streaming text changes on every paint.
 */
const markdownCache = new Map<string, ReactElement>();

export const Markdown = memo(function Markdown({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  // react-markdown re-parses the whole document on every render. Finished
  // replies of reasonable size are cached by text, so re-renders triggered by
  // neighbours (scroll markers, the streaming flag moving on) skip the parse.
  const cacheable = !streaming && content.length <= MARKDOWN_CACHE_MAX_CHARS;
  if (cacheable) {
    const cached = markdownCache.get(content);
    if (cached) return cached;
  }

  const rendered = (
    <div className="min-w-0 space-y-3 text-base leading-6 tracking-[-0.32px] text-foreground [&_*:last-child]:mb-0">
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
              className="font-normal text-primary underline underline-offset-2 hover:text-primary/80"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-normal text-foreground">{children}</strong>
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
            <th className="px-3 py-2 text-xs font-normal text-muted-foreground whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 align-top">{children}</td>
          ),
        }}
      >
        {fenceUnfencedHtml(content)}
      </ReactMarkdown>
    </div>
  );

  if (cacheable) {
    markdownCache.set(content, rendered);
    if (markdownCache.size > MARKDOWN_CACHE_ENTRIES) {
      markdownCache.delete(markdownCache.keys().next().value as string);
    }
  }
  return rendered;
});
