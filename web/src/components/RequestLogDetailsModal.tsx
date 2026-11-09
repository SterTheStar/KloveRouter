import { useState, useMemo } from "react";
import {
  RiCloseLine,
  RiFileCopyLine as CopyIcon,
  RiCheckLine as CheckIcon,
  RiCloudLine as ProviderIcon,
  RiCheckboxCircleLine as SuccessIcon,
  RiErrorWarningLine as ErrorIcon,
  RiLoader4Line as PendingIcon,
  RiShieldKeyholeLine as CredentialIcon,
  RiCoinsLine as CostIcon,
  RiSpeedUpLine as SpeedIcon,
  RiTimeLine as TimeIcon,
  RiSwapLine as TokensIcon,
  RiShieldLine as ShieldIcon,
  RiShieldCrossLine as ShieldCrossIcon,
  RiArrowDownSLine as ChevronDown,
  RiArrowRightSLine as ChevronRight,
  RiUserLine as UserIcon,
  RiRobotLine as BotIcon,
  RiTerminalBoxLine as SystemIcon,
  RiToolsLine as ToolIcon,
  RiCodeLine as CodeIcon,
  RiListUnordered as ListIcon,
  RiBugLine as BugIcon,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { copyToClipboard } from "../lib/clipboard";
import type { RequestLog, RequestLogDetails } from "../types";

interface RequestLogDetailsModalProps {
  selected: RequestLog | null;
  detail: RequestLogDetails | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

function formatNumber(value: number) {
  return value.toLocaleString();
}

function formatCost(value: number) {
  return value ? `$${value < 0.01 ? value.toFixed(4) : value.toFixed(2)}` : "—";
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(0)}ms`;
}

function formatTime(value: string) {
  const date = new Date(`${value}Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      });
}

function mask(value: string | null) {
  if (!value) return "—";
  return value.length > 16
    ? `${value.slice(0, 8)}...${value.slice(-4)}`
    : value;
}

function parseCleanError(
  errorMessage?: string | null,
  errorDetails?: any
): {
  cleanMessage: string;
  code?: string;
  providerRequestId?: string;
  cfRay?: string;
  rawStack?: string;
  rawDetails?: any;
} {
  const result: {
    cleanMessage: string;
    code?: string;
    providerRequestId?: string;
    cfRay?: string;
    rawStack?: string;
    rawDetails?: any;
  } = {
    cleanMessage: errorMessage || "Unknown error occurred.",
  };

  if (errorDetails) {
    result.rawDetails = errorDetails;
    if (typeof errorDetails.stack === "string") {
      result.rawStack = errorDetails.stack;
    }
    if (typeof errorDetails.request_id === "string") {
      result.providerRequestId = errorDetails.request_id;
    }
    if (errorDetails.headers) {
      if (typeof errorDetails.headers["x-request-id"] === "string") {
        result.providerRequestId = errorDetails.headers["x-request-id"];
      }
      if (typeof errorDetails.headers["cf-ray"] === "string") {
        result.cfRay = errorDetails.headers["cf-ray"];
      }
    }
  }

  const rawText = errorMessage || (typeof errorDetails?.message === "string" ? errorDetails.message : "");
  if (!rawText) return result;

  // Pattern matching: SSE chunks like 503 data: {"error":{"message":"...","code":"..."}}
  const dataMatch = rawText.match(/data:\s*({[\s\S]*?})(?:\n|$)/);
  if (dataMatch && dataMatch[1]) {
    try {
      const parsed = JSON.parse(dataMatch[1]);
      if (parsed.error && typeof parsed.error === "object") {
        if (parsed.error.message) result.cleanMessage = parsed.error.message;
        if (parsed.error.code) result.code = parsed.error.code;
        return result;
      }
    } catch {
      // ignore
    }
  }

  // Plain JSON in raw text
  const jsonMatch = rawText.match(/({[\s\S]*})/);
  if (jsonMatch && jsonMatch[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.error) {
        if (typeof parsed.error === "string") {
          result.cleanMessage = parsed.error;
        } else if (parsed.error.message) {
          result.cleanMessage = parsed.error.message;
          if (parsed.error.code) result.code = parsed.error.code;
        }
        return result;
      }
    } catch {
      // ignore
    }
  }

  return result;
}

function CopyableButton({
  text,
  label = "Copy",
  variant = "ghost",
  size = "sm",
  className = "",
}: {
  text: string;
  label?: string;
  variant?: "ghost" | "outline" | "default";
  size?: "sm" | "icon-sm" | "xs";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Button
      variant={variant}
      size={size as any}
      className={`h-7 gap-1 text-xs transition-colors ${className}`}
      onClick={handleCopy}
      title={copied ? "Copied!" : `Copy ${label}`}
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-emerald-500 animate-in zoom-in-75" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
      {label && <span>{copied ? "Copied" : label}</span>}
    </Button>
  );
}

function RoleBadge({ role }: { role: string }) {
  const norm = role.toLowerCase();
  switch (norm) {
    case "system":
      return (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
          <SystemIcon className="size-3" /> System
        </span>
      );
    case "user":
      return (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <UserIcon className="size-3" /> User
        </span>
      );
    case "assistant":
      return (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <BotIcon className="size-3" /> Assistant
        </span>
      );
    case "tool":
    case "function":
      return (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          <ToolIcon className="size-3" /> {role}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground border border-border">
          {role}
        </span>
      );
  }
}

function ChatMessageCard({
  message,
  index,
}: {
  message: { role?: string; content?: any; tool_calls?: any };
  index: number;
}) {
  const [expanded, setExpanded] = useState(index > 0);
  const role = message.role || "unknown";

  const renderContent = () => {
    const content = message.content;
    if (typeof content === "string") {
      const isLong = content.length > 400;
      return (
        <div className="space-y-1.5">
          <p
            className={`font-mono text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed select-text ${
              !expanded && isLong ? "line-clamp-4" : ""
            }`}
          >
            {content}
          </p>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-[11px] font-medium text-primary hover:underline flex items-center gap-0.5 pt-0.5"
            >
              {expanded ? (
                <>
                  <ChevronDown className="size-3 rotate-180" /> Show less
                </>
              ) : (
                <>
                  <ChevronDown className="size-3" /> Show full content ({content.length} chars)
                </>
              )}
            </button>
          )}
        </div>
      );
    }

    if (Array.isArray(content)) {
      return (
        <div className="space-y-2">
          {content.map((block: any, bIdx: number) => {
            if (block.type === "text") {
              return (
                <p
                  key={bIdx}
                  className="font-mono text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed select-text"
                >
                  {block.text}
                </p>
              );
            }
            if (block.type === "image_url") {
              return (
                <div key={bIdx} className="text-xs text-tertiary">
                  <span className="font-semibold text-foreground">[Image Attachment]</span>
                  <div className="mt-1 font-mono text-[11px] truncate max-w-sm text-tertiary">
                    {block.image_url?.url || JSON.stringify(block)}
                  </div>
                </div>
              );
            }
            return (
              <pre
                key={bIdx}
                className="font-mono text-xs text-tertiary bg-muted/40 p-2 rounded"
              >
                {JSON.stringify(block, null, 2)}
              </pre>
            );
          })}
        </div>
      );
    }

    if (content == null) {
      if (message.tool_calls) {
        return (
          <div className="space-y-1.5 font-mono text-xs">
            <span className="text-[11px] font-medium text-amber-500 uppercase tracking-wide">
              Tool Calls:
            </span>
            <pre className="p-2 rounded bg-muted/50 text-[11px] overflow-x-auto text-foreground">
              {JSON.stringify(message.tool_calls, null, 2)}
            </pre>
          </div>
        );
      }
      return <span className="text-xs italic text-muted-foreground">Empty content</span>;
    }

    return (
      <pre className="font-mono text-xs text-foreground whitespace-pre-wrap break-words">
        {JSON.stringify(content, null, 2)}
      </pre>
    );
  };

  return (
    <div className="rounded-lg border border-border/70 bg-card p-3 shadow-2xs space-y-2 transition-colors hover:border-border">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RoleBadge role={role} />
          <span className="font-mono text-[11px] text-muted-foreground">#{index + 1}</span>
        </div>
        <CopyableButton
          text={
            typeof message.content === "string"
              ? message.content
              : JSON.stringify(message, null, 2)
          }
          label=""
          size="xs"
          className="size-6 p-0"
        />
      </div>
      <div className="pt-0.5">{renderContent()}</div>
    </div>
  );
}

function GuardrailsSection({ detail }: { detail: RequestLogDetails }) {
  const guardrailsData =
    (detail.guardrails_details as any) ||
    (detail.request_details as any)?.klove?.guardrails;
  const status = detail.guardrails_status || guardrailsData?.action;
  if (!status && !guardrailsData) return null;

  const violations: Array<{
    category: string;
    description: string;
    matchedTextPreview?: string;
  }> =
    guardrailsData?.violations ||
    (detail.error_details as any)?.violations ||
    [];

  const isBlocked = status === "blocked" || status === "block";
  const isRedacted = status === "redacted" || status === "redact";

  return (
    <div
      className={`rounded-xl border p-3.5 space-y-2.5 ${
        isBlocked
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : isRedacted
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-sky-500/30 bg-sky-500/5"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isBlocked ? (
            <ShieldCrossIcon className="size-4 shrink-0 text-destructive" />
          ) : (
            <ShieldIcon
              className={`size-4 shrink-0 ${
                isRedacted ? "text-amber-500" : "text-sky-500"
              }`}
            />
          )}
          <span className="font-semibold text-xs text-foreground">
            AI Firewall & Guardrails
          </span>
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              isBlocked
                ? "bg-destructive text-destructive-foreground"
                : isRedacted
                ? "bg-amber-500 text-white"
                : "bg-sky-500 text-white"
            }`}
          >
            {isBlocked
              ? "Blocked"
              : isRedacted
              ? "Redacted"
              : "Violation Audited"}
          </span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        {isBlocked
          ? "This request was rejected prior to model dispatch to prevent security violations."
          : isRedacted
          ? "Sensitive credentials or secrets were sanitized with safe placeholders."
          : "Security policy violations were detected and recorded."}
      </p>

      {violations.length > 0 && (
        <div className="space-y-1.5 pt-1.5 border-t border-border/40">
          <p className="text-[11px] font-semibold text-foreground">
            Violations ({violations.length}):
          </p>
          <div className="space-y-1">
            {violations.map((v, idx) => (
              <div
                key={idx}
                className="rounded border border-border/60 bg-card/80 p-2 text-xs flex flex-col gap-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground text-[11px]">{v.description}</span>
                  <span className="font-mono text-[9px] uppercase px-1 rounded bg-muted text-muted-foreground">
                    {v.category}
                  </span>
                </div>
                {v.matchedTextPreview && (
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-destructive break-all">
                    {v.matchedTextPreview}
                  </code>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function RequestLogDetailsModal({
  selected,
  detail,
  loading,
  error,
  onClose,
}: RequestLogDetailsModalProps) {
  const [requestTab, setRequestTab] = useState<"formatted" | "raw">("formatted");
  const [responseTab, setResponseTab] = useState<"parsed" | "raw">("parsed");
  const [showHeaders, setShowHeaders] = useState(false);
  const [showTechnicalError, setShowTechnicalError] = useState(false);
  const [showTools, setShowTools] = useState(false);

  // Payload parsing
  const parsedRequest = useMemo(() => {
    if (!detail?.request_details) return null;
    const req = detail.request_details as any;

    let method = "POST";
    let url = "/v1/chat/completions";
    let headers: Record<string, string> | null = null;
    let payload: any = req;

    if (req && typeof req === "object" && ("payload" in req || "method" in req)) {
      method = req.method || "POST";
      url = req.url || "/v1/chat/completions";
      headers = req.headers || null;
      payload = req.payload !== undefined ? req.payload : req;
    }

    const messages = Array.isArray(payload?.messages) ? payload.messages : null;
    const params: Record<string, any> = {};

    if (payload && typeof payload === "object") {
      Object.keys(payload).forEach((k) => {
        if (k !== "messages" && k !== "prompt") {
          params[k] = payload[k];
        }
      });
    }

    return {
      method,
      url,
      headers,
      payload,
      messages,
      params,
    };
  }, [detail?.request_details]);

  // Error parsing
  const cleanError = useMemo(() => {
    if (!detail) return null;
    return parseCleanError(detail.error_message, detail.error_details);
  }, [detail]);

  // Response assistant message
  const assistantResponse = useMemo(() => {
    if (!detail?.response_details) return null;
    const res = detail.response_details as any;
    if (res?.choices && Array.isArray(res.choices) && res.choices.length > 0) {
      const first = res.choices[0];
      return first?.message?.content || first?.text || null;
    }
    return null;
  }, [detail?.response_details]);

  const activeLog = detail || selected;
  const isError = activeLog?.status === "error";
  const isPending = activeLog?.status === "pending";

  return (
    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-5xl md:max-w-6xl w-[95vw] max-w-6xl max-md:h-[90vh] md:aspect-[16/9] max-h-[90vh] flex flex-col p-0 overflow-hidden gap-0 rounded-xl border border-border bg-card shadow-2xl">
        {/* Top Header */}
        <DialogHeader className="p-4 md:px-6 md:py-3.5 border-b border-border bg-card/60 backdrop-blur-xs shrink-0 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-base font-semibold text-foreground tracking-tight">
                Request log details
              </DialogTitle>
              {activeLog && (
                <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md border border-border/50">
                  <span>{activeLog.id}</span>
                  <CopyableButton text={activeLog.id} label="" size="xs" className="size-4 p-0" />
                </div>
              )}
            </div>

            <DialogDescription className="text-xs text-muted-foreground">
              {activeLog?.created_at ? formatTime(activeLog.created_at) : ""}
            </DialogDescription>
          </div>

          {/* Metadata Toolbar */}
          {activeLog && (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              {/* Status Badge */}
              <Badge
                variant={isError ? "destructive" : isPending ? "secondary" : "default"}
                className={`gap-1 font-medium capitalize ${
                  !isError && !isPending
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : ""
                }`}
              >
                {isError ? (
                  <ErrorIcon className="size-3.5" />
                ) : isPending ? (
                  <PendingIcon className="size-3.5 animate-spin" />
                ) : (
                  <SuccessIcon className="size-3.5" />
                )}
                <span>{activeLog.status}</span>
                {activeLog.status_code && (
                  <span className="font-mono font-bold">({activeLog.status_code})</span>
                )}
              </Badge>

              {/* Provider / Model */}
              <div className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-foreground font-medium">
                <ProviderIcon className="size-3.5 text-muted-foreground" />
                <span>
                  {activeLog.provider_name} /{" "}
                  <span className="font-mono font-normal text-muted-foreground">
                    {activeLog.model_name}
                  </span>
                </span>
                <CopyableButton
                  text={`${activeLog.provider_name}/${activeLog.model_name}`}
                  label=""
                  size="xs"
                  className="size-4 p-0 ml-0.5"
                />
              </div>

              {/* Performance / Duration */}
              <div className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-muted-foreground">
                <TimeIcon className="size-3.5" />
                <span>{formatDuration(activeLog.duration_ms)}</span>
                {activeLog.tps != null && (
                  <>
                    <span className="text-border">·</span>
                    <SpeedIcon className="size-3.5 ml-0.5" />
                    <span>{activeLog.tps.toFixed(1)} TPS</span>
                  </>
                )}
              </div>

              {/* Tokens breakdown */}
              {activeLog.tokens_total > 0 && (
                <div className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-muted-foreground">
                  <TokensIcon className="size-3.5" />
                  <span className="font-mono text-foreground">{formatNumber(activeLog.tokens_total)}</span>
                  <span>tok ({formatNumber(activeLog.tokens_prompt)} in / {formatNumber(activeLog.tokens_completion)} out)</span>
                </div>
              )}

              {/* Cost */}
              {activeLog.estimated_cost_usd > 0 && (
                <div className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-muted-foreground">
                  <CostIcon className="size-3.5" />
                  <span>{formatCost(activeLog.estimated_cost_usd)}</span>
                </div>
              )}

              {/* Credential / Requester */}
              {(activeLog.credential_label || activeLog.requester_name || activeLog.client_ip) && (
                <div className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-muted-foreground">
                  <CredentialIcon className="size-3.5" />
                  <span>{activeLog.credential_label || activeLog.requester_name || "API Key"}</span>
                  {activeLog.client_ip && (
                    <>
                      <span className="text-border">·</span>
                      <span className="font-mono text-[11px]">{activeLog.client_ip}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogHeader>

        {/* Loading / Error States */}
        {loading && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <PendingIcon className="size-6 animate-spin text-primary" />
              <span className="text-sm">Loading request details...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="p-6">
            <Alert variant="destructive">
              <AlertDescription>Unable to load log details: {error}</AlertDescription>
            </Alert>
          </div>
        )}

        {/* 2-Column Body */}
        {!loading && !error && detail && (
          <div className="grid grid-cols-1 md:grid-cols-2 flex-1 min-h-0 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-border bg-background/50">
            {/* ========================================================================= */}
            {/* COLUMN 1: REQUEST (INBOUND) */}
            {/* ========================================================================= */}
            <div className="flex flex-col min-h-0 h-full overflow-hidden">
              {/* Column Header */}
              <div className="h-11 px-4 border-b border-border bg-card flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-foreground uppercase tracking-wider">
                    Request
                  </span>
                  {parsedRequest?.method && (
                    <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 uppercase">
                      {parsedRequest.method}
                    </Badge>
                  )}
                  {activeLog?.streaming && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      Stream
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {parsedRequest?.messages && (
                    <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/60">
                      <button
                        type="button"
                        onClick={() => setRequestTab("formatted")}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          requestTab === "formatted"
                            ? "bg-background text-foreground shadow-2xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <ListIcon className="size-3" />
                        Messages ({parsedRequest.messages.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setRequestTab("raw")}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          requestTab === "raw"
                            ? "bg-background text-foreground shadow-2xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <CodeIcon className="size-3" />
                        Raw JSON
                      </button>
                    </div>
                  )}
                  <CopyableButton
                    text={JSON.stringify(detail.request_details, null, 2)}
                    label="JSON"
                    size="xs"
                  />
                </div>
              </div>

              {/* Column Content ScrollArea */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-4 space-y-4">
                  {/* Guardrails Violations Alert */}
                  <GuardrailsSection detail={detail} />

                  {/* Headers Dropdown */}
                  {parsedRequest?.headers && (
                    <div className="rounded-lg border border-border bg-card overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowHeaders(!showHeaders)}
                        className="w-full px-3 py-2 text-xs font-medium text-foreground flex items-center justify-between hover:bg-muted/50 transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          {showHeaders ? (
                            <ChevronDown className="size-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-3.5 text-muted-foreground" />
                          )}
                          HTTP Request Headers ({Object.keys(parsedRequest.headers).length})
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {parsedRequest.headers["content-type"] || ""}
                        </span>
                      </button>
                      {showHeaders && (
                        <div className="border-t border-border p-2 bg-muted/20 font-mono text-[11px] space-y-1">
                          {Object.entries(parsedRequest.headers).map(([key, val]) => (
                            <div key={key} className="flex gap-2">
                              <span className="text-muted-foreground select-none">{key}:</span>
                              <span className="text-foreground break-all">{val}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Request Messages or Raw JSON */}
                  {requestTab === "formatted" && parsedRequest?.messages ? (
                    <div className="space-y-2.5">
                      {parsedRequest.messages.map((msg: any, idx: number) => (
                        <ChatMessageCard key={idx} message={msg} index={idx} />
                      ))}

                      {/* Request Parameters Card */}
                      {Object.keys(parsedRequest.params).length > 0 && (
                        <div className="rounded-lg border border-border/70 bg-card p-3 space-y-2.5">
                          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                            Parameters
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(parsedRequest.params).map(([paramKey, paramVal]) => {
                              const rawStr =
                                typeof paramVal === "object"
                                  ? JSON.stringify(paramVal)
                                  : String(paramVal);
                              let displayVal = rawStr;
                              if (paramKey === "tools" && Array.isArray(paramVal)) {
                                displayVal = `${paramVal.length} ${
                                  paramVal.length === 1 ? "tool" : "tools"
                                }`;
                              } else if (paramKey === "functions" && Array.isArray(paramVal)) {
                                displayVal = `${paramVal.length} ${
                                  paramVal.length === 1 ? "function" : "functions"
                                }`;
                              }

                              return (
                                <div
                                  key={paramKey}
                                  className="inline-flex max-w-full min-w-0 items-center gap-1 px-2 py-0.5 rounded bg-muted/70 text-[11px] font-mono border border-border/50"
                                  title={rawStr}
                                >
                                  <span className="text-muted-foreground shrink-0">{paramKey}:</span>
                                  <span className="text-foreground font-medium truncate max-w-[260px] sm:max-w-xs md:max-w-sm">
                                    {displayVal}
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          {/* Expandable Tools Schema */}
                          {parsedRequest.params.tools && (
                            <div className="pt-2 border-t border-border/50 space-y-2">
                              <div className="flex items-center justify-between">
                                <button
                                  type="button"
                                  onClick={() => setShowTools((prev) => !prev)}
                                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none"
                                >
                                  {showTools ? (
                                    <ChevronDown className="size-3.5 text-tertiary" />
                                  ) : (
                                    <ChevronRight className="size-3.5 text-tertiary" />
                                  )}
                                  <ToolIcon className="size-3.5 text-tertiary" />
                                  <span>
                                    Tools Schema (
                                    {Array.isArray(parsedRequest.params.tools)
                                      ? `${parsedRequest.params.tools.length} ${
                                          parsedRequest.params.tools.length === 1
                                            ? "tool"
                                            : "tools"
                                        }`
                                      : "object"}
                                    )
                                  </span>
                                </button>
                                {showTools && (
                                  <CopyableButton
                                    text={JSON.stringify(parsedRequest.params.tools, null, 2)}
                                    label="Copy Tools"
                                    size="xs"
                                  />
                                )}
                              </div>

                              {showTools && (
                                <pre className="p-2.5 rounded bg-muted/50 text-[11px] font-mono text-foreground overflow-x-auto max-h-72 border border-border/50 whitespace-pre">
                                  {JSON.stringify(parsedRequest.params.tools, null, 2)}
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <pre className="font-mono text-xs text-foreground bg-muted/40 p-3 rounded-lg border border-border whitespace-pre-wrap break-words overflow-auto">
                      {detail.request_details != null
                        ? JSON.stringify(detail.request_details, null, 2)
                        : "No request payload captured."}
                    </pre>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* ========================================================================= */}
            {/* COLUMN 2: RESPONSE / OUTCOME (OUTBOUND) */}
            {/* ========================================================================= */}
            <div className="flex flex-col min-h-0 h-full overflow-hidden">
              {/* Column Header */}
              <div className="h-11 px-4 border-b border-border bg-card flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-foreground uppercase tracking-wider">
                    {isError ? "Error & Diagnostic" : "Response"}
                  </span>
                  {activeLog?.status_code && (
                    <Badge
                      variant={isError ? "destructive" : "secondary"}
                      className="font-mono text-[10px] px-1.5 py-0"
                    >
                      HTTP {activeLog.status_code}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {!isError && assistantResponse && (
                    <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/60">
                      <button
                        type="button"
                        onClick={() => setResponseTab("parsed")}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          responseTab === "parsed"
                            ? "bg-background text-foreground shadow-2xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <ListIcon className="size-3" />
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => setResponseTab("raw")}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          responseTab === "raw"
                            ? "bg-background text-foreground shadow-2xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <CodeIcon className="size-3" />
                        Raw JSON
                      </button>
                    </div>
                  )}

                  <CopyableButton
                    text={
                      isError
                        ? JSON.stringify(
                            {
                              error_message: detail.error_message,
                              error_details: detail.error_details,
                              status_code: detail.status_code,
                            },
                            null,
                            2
                          )
                        : JSON.stringify(detail.response_details, null, 2)
                    }
                    label={isError ? "Error" : "JSON"}
                    size="xs"
                  />
                </div>
              </div>

              {/* Column Content ScrollArea */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-4 space-y-4">
                  {/* ========================================= */}
                  {/* SCENARIO A: ERROR OCCURRED */}
                  {/* ========================================= */}
                  {isError && (
                    <div className="space-y-4">
                      {/* Main Error Callout */}
                      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5">
                            <ErrorIcon className="size-5 text-destructive shrink-0 mt-0.5" />
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold text-sm text-destructive">
                                  {detail.status_code
                                    ? `HTTP ${detail.status_code} Error`
                                    : "Request Execution Failed"}
                                </h4>
                                {cleanError?.code && (
                                  <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-medium">
                                    {cleanError.code}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 font-mono text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed select-text">
                                {cleanError?.cleanMessage}
                              </p>
                            </div>
                          </div>
                          <CopyableButton
                            text={cleanError?.cleanMessage || ""}
                            label=""
                            size="xs"
                            className="size-7 p-0 shrink-0"
                          />
                        </div>

                        {/* Request ID / Support info */}
                        {(cleanError?.providerRequestId || cleanError?.cfRay) && (
                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-destructive/20 text-xs">
                            {cleanError.providerRequestId && (
                              <div className="inline-flex items-center gap-1 rounded bg-card/80 px-2 py-0.5 text-muted-foreground font-mono text-[11px] border border-border">
                                <span>provider req:</span>
                                <span className="text-foreground">{cleanError.providerRequestId}</span>
                                <CopyableButton
                                  text={cleanError.providerRequestId}
                                  label=""
                                  size="xs"
                                  className="size-4 p-0 ml-0.5"
                                />
                              </div>
                            )}
                            {cleanError.cfRay && (
                              <div className="inline-flex items-center gap-1 rounded bg-card/80 px-2 py-0.5 text-muted-foreground font-mono text-[11px] border border-border">
                                <span>cf-ray:</span>
                                <span className="text-foreground">{cleanError.cfRay}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Technical Details / Stack Trace */}
                      <div className="rounded-lg border border-border bg-card overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setShowTechnicalError(!showTechnicalError)}
                          className="w-full px-3 py-2 text-xs font-medium text-foreground flex items-center justify-between hover:bg-muted/50 transition-colors"
                        >
                          <span className="flex items-center gap-1.5">
                            <BugIcon className="size-3.5 text-muted-foreground" />
                            Technical details & raw diagnostics
                          </span>
                          {showTechnicalError ? (
                            <ChevronDown className="size-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-3.5 text-muted-foreground" />
                          )}
                        </button>
                        {showTechnicalError && (
                          <div className="border-t border-border p-3 space-y-3 bg-muted/20">
                            {cleanError?.rawStack && (
                              <div className="space-y-1">
                                <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                                  Stack Trace
                                </span>
                                <pre className="font-mono text-[11px] text-muted-foreground bg-muted p-2.5 rounded overflow-auto whitespace-pre-wrap max-h-48">
                                  {cleanError.rawStack}
                                </pre>
                              </div>
                            )}
                            {detail.error_details && (
                              <div className="space-y-1">
                                <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                                  Raw Error Details
                                </span>
                                <pre className="font-mono text-[11px] text-foreground bg-muted p-2.5 rounded overflow-auto whitespace-pre-wrap max-h-48">
                                  {JSON.stringify(detail.error_details, null, 2)}
                                </pre>
                              </div>
                            )}
                            {detail.response_details && (
                              <div className="space-y-1">
                                <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                                  Response Details
                                </span>
                                <pre className="font-mono text-[11px] text-foreground bg-muted p-2.5 rounded overflow-auto whitespace-pre-wrap max-h-48">
                                  {JSON.stringify(detail.response_details, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ========================================= */}
                  {/* SCENARIO B: SUCCESSFUL RESPONSE */}
                  {/* ========================================= */}
                  {!isError && !isPending && (
                    <div className="space-y-4">
                      {responseTab === "parsed" && assistantResponse ? (
                        <div className="rounded-lg border border-border/80 bg-card p-3.5 space-y-2.5 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <RoleBadge role="assistant" />
                            <CopyableButton text={assistantResponse} label="Response" size="xs" />
                          </div>
                          <p className="font-mono text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed select-text">
                            {assistantResponse}
                          </p>
                        </div>
                      ) : null}

                      {/* Raw Response JSON */}
                      {(responseTab === "raw" || !assistantResponse) && (
                        <pre className="font-mono text-xs text-foreground bg-muted/40 p-3 rounded-lg border border-border whitespace-pre-wrap break-words overflow-auto">
                          {detail.response_details != null
                            ? JSON.stringify(detail.response_details, null, 2)
                            : "No response body captured."}
                        </pre>
                      )}
                    </div>
                  )}

                  {/* ========================================= */}
                  {/* SCENARIO C: PENDING / STREAMING */}
                  {/* ========================================= */}
                  {isPending && (
                    <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-6 flex flex-col items-center justify-center text-center space-y-3">
                      <PendingIcon className="size-8 text-blue-500 animate-spin" />
                      <div>
                        <h4 className="font-semibold text-sm text-foreground">
                          {detail.streaming ? "Streaming in progress..." : "Processing request..."}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          {detail.streamed_chars > 0
                            ? `${formatNumber(detail.streamed_chars)} characters delivered so far.`
                            : "Waiting for upstream model chunks."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
