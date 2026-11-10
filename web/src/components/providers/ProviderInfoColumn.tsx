import { useState } from "react";
import {
  RiGlobalLine,
  RiBookOpenLine,
  RiTerminalBoxLine,
  RiExternalLinkLine,
  RiFileCopyLine,
  RiCheckLine,
  RiArrowRightLine,
  RiCloseCircleLine,
  RiShieldKeyholeLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import ProviderIcon from "@/components/ProviderIcon";
import type { ProviderTemplate } from "@/lib/provider-templates";
import { copyToClipboard } from "@/lib/clipboard";
import { useToast } from "@/components/ui/toast";
import { IntegrationBadge } from "./IntegrationBadge";
import {
  ConolGuide,
  QwenGuide,
  PerchGuide,
  DeepAIGuide,
  ChatGptCookiesGuide,
  OAuthInfoGuide,
} from "./ProviderGuides";

type Props = {
  template: ProviderTemplate | null;
  onSelect?: (template: ProviderTemplate) => void;
  mode?: "select" | "form";
  unavailableProtocols?: Set<string>;
};

export function ProviderInfoColumn({
  template,
  onSelect,
  mode = "select",
  unavailableProtocols = new Set(),
}: Props) {
  const { success, error: notifyError } = useToast();
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);

  if (!template) {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
        <RiShieldKeyholeLine className="size-8 text-muted-foreground/60" />
        <p className="mt-2 text-sm font-normal text-foreground">Select a provider</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose a provider from the list to view its description, official website, and connection parameters.
        </p>
      </div>
    );
  }

  const isUnavailable = unavailableProtocols.has(template.protocol);
  const isOAuth =
    template.protocol === "codex" ||
    template.protocol === "antigravity" ||
    template.protocol === "deepai";

  const handleCopyEndpoint = async () => {
    if (!template.placeholder) return;
    try {
      await copyToClipboard(template.placeholder);
      setCopiedEndpoint(true);
      setTimeout(() => setCopiedEndpoint(false), 2000);
      success("Endpoint copied to clipboard");
    } catch (e: any) {
      notifyError("Failed to copy", e.message);
    }
  };

  const protocolLabel: Record<string, string> = {
    openai: "OpenAI Compatible",
    "openai-responses": "OpenAI Responses API",
    anthropic: "Anthropic Messages API",
    antigravity: "Google Gemini (Antigravity)",
    codex: "OpenAI Codex",
    chatgpt: "ChatGPT Backend",
    deepai: "DeepAI Code",
    openfree: "OpenCode Zen / Free",
    qwen: "Qwen Web API",
    atomesus: "Atomesus API",
    conol: "Conol.ai Agent API",
    perch: "Perch AI CLI",
    freebuff: "Freebuff Gateway",
  };

  const normalizeUrl = (url?: string) => (url ? url.trim().replace(/\/+$/, "").toLowerCase() : "");
  const hasSeparateDocs = Boolean(
    template.docsUrl &&
    normalizeUrl(template.docsUrl) !== normalizeUrl(template.website)
  );

  return (
    <div className="flex h-full flex-col justify-between space-y-4 overflow-y-auto pr-1 text-sm">
      <div className="space-y-4">
        {/* Header: Provider Icon & Title */}
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-background p-1.5">
            <ProviderIcon
              name={template.name}
              src={template.logo}
              className={`size-full object-contain ${template.id === "openai" ? "dark:invert" : ""}`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="font-normal text-foreground leading-tight">{template.name}</h3>
              {isUnavailable && (
                <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-[10px] font-normal text-destructive">
                  <RiCloseCircleLine className="size-3" />
                  <span>Unavailable</span>
                </span>
              )}
              <IntegrationBadge template={template} size="md" showCloudApi />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {protocolLabel[template.protocol] || template.protocol}
            </p>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <span className="text-xs font-normal text-muted-foreground">
            Overview
          </span>
          <p className="text-xs leading-relaxed text-foreground">
            {template.description}
          </p>
        </div>

        {/* Links: Website & Docs */}
        <div className="space-y-1.5 rounded-lg border border-border bg-card p-2">
          {template.website && (
            <a
              href={template.website}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-2 rounded-md p-1.5 text-xs text-foreground transition-colors hover:bg-accent"
            >
              <div className="flex items-center gap-2 min-w-0">
                <RiGlobalLine className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{template.website.replace(/^https?:\/\//, "")}</span>
              </div>
              <RiExternalLinkLine className="size-3.5 shrink-0 text-muted-foreground" />
            </a>
          )}

          {hasSeparateDocs ? (
            <a
              href={template.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-2 rounded-md p-1.5 text-xs text-foreground transition-colors hover:bg-accent"
            >
              <div className="flex items-center gap-2 min-w-0">
                <RiBookOpenLine className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">API Documentation</span>
              </div>
              <RiExternalLinkLine className="size-3.5 shrink-0 text-muted-foreground" />
            </a>
          ) : (
            <div
              className="flex items-center justify-between gap-2 rounded-md p-1.5 text-xs text-muted-foreground/60 select-none"
              title="Documentation unavailable or identical to website"
            >
              <div className="flex items-center gap-2 min-w-0">
                <RiBookOpenLine className="size-4 shrink-0 text-muted-foreground/40" />
                <span className="truncate">API Documentation</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                <RiCloseCircleLine className="size-2.5" />
                <span>Unavailable</span>
              </span>
            </div>
          )}
        </div>

        {/* Base Endpoint */}
        {template.placeholder && (
          <div className="space-y-1.5">
            <span className="text-xs font-normal text-muted-foreground">
              Default endpoint
            </span>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <RiTerminalBoxLine className="size-3.5 shrink-0 text-muted-foreground" />
                <code className="truncate font-mono text-xs text-foreground">{template.placeholder}</code>
              </div>
              <button
                type="button"
                onClick={handleCopyEndpoint}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                title="Copy endpoint"
              >
                {copiedEndpoint ? (
                  <RiCheckLine className="size-3.5 text-foreground" />
                ) : (
                  <RiFileCopyLine className="size-3.5" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Guides for specific providers */}
        {template.protocol === "conol" && <ConolGuide />}
        {template.protocol === "qwen" && <QwenGuide />}
        {template.protocol === "perch" && <PerchGuide />}
        {template.protocol === "deepai" && <DeepAIGuide />}
        {template.protocol === "chatgpt" && <ChatGptCookiesGuide />}
        {isOAuth && template.protocol !== "deepai" && (
          <OAuthInfoGuide protocol={template.protocol as any} />
        )}
      </div>

      {/* Action button in select mode */}
      {mode === "select" && onSelect && (
        <div className="pt-2">
          <Button
            type="button"
            className="w-full gap-2"
            disabled={isUnavailable}
            onClick={() => onSelect(template)}
          >
            <span>Configure {template.name}</span>
            <RiArrowRightLine className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
