import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  RiArrowDownSLine as ArrowDown,
  RiArrowUpLine as ArrowUp,
  RiDeleteBinLine as DeleteIcon,
  RiFileCopyLine as CopyIcon,
  RiLoader4Line as LoaderCircle,
  RiRefreshLine as RefreshIcon,
  RiSearchLine as SearchIcon,
  RiCloudLine as ProviderIcon,
  RiCheckboxCircleLine as SuccessIcon,
  RiErrorWarningLine as ErrorIcon,
  RiLoader4Line as PendingIcon,
  RiShieldKeyholeLine as CredentialIcon,
  RiCoinsLine as CostIcon,
  RiSpeedUpLine as SpeedIcon,
  RiTimeLine as TimeIcon,
  RiSwapLine as TokensIcon,
  RiHardDrive2Line as BytesIcon,
  RiPlugLine as KindIcon,
} from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ConfirmDialog from "@/components/ConfirmDialog";
import { requestLogs } from "../api/client";
import type { RequestLog, RequestLogDetails } from "../types";
import { copyToClipboard } from "../lib/clipboard";

const PAGE_SIZE = 50;
// Upper bound on in-memory rows so a long live session cannot grow the DOM
// without bound; older rows are still reachable through "Load older".
const MAX_ROWS = 1000;
// In-flight logs receive progress updates; coalesce them so a busy stream does
// not re-render the whole table on every chunk.
const LIVE_FLUSH_MS = 400;

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

function formatRelative(value: string) {
  const date = new Date(`${value}Z`);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function mask(value: string | null) {
  if (!value) return "—";
  return value.length > 16
    ? `${value.slice(0, 8)}...${value.slice(-4)}`
    : value;
}

function StatusBadge({ log }: { log: RequestLog }) {
  const pending = log.status === "pending";
  const Icon = pending ? PendingIcon : log.status === "error" ? ErrorIcon : SuccessIcon;
  const tone = pending
    ? "text-tertiary"
    : log.status === "error"
      ? "text-destructive"
      : "text-success";
  const label = pending && log.streaming ? "streaming" : log.status;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${tone}`}>
      <Icon className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
      <span className="capitalize">{label}</span>
      {log.status_code ? <span className="font-mono text-tertiary">{log.status_code}</span> : null}
    </span>
  );
}

function requestKindLabel(kind?: string | null) {
  if (!kind) return "";
  return kind
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function matchesSearch(log: RequestLog, term: string) {
  const needle = term.toLowerCase();
  return [log.id, log.model_name, log.credential_label, log.credential_identity]
    .some((value) => value?.toLowerCase().includes(needle));
}

const LogRow = memo(function LogRow({
  log,
  onOpen,
  onCopy,
}: {
  log: RequestLog;
  onOpen: (log: RequestLog) => void;
  onCopy: (value: string) => void;
}) {
  return (
    <tr
      className="cursor-pointer border-b border-border align-top outline-none transition-colors last:border-0 hover:bg-accent/60 focus-visible:bg-accent/60"
      onClick={() => onOpen(log)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen(log);
      }}
      tabIndex={0}
      role="button"
      aria-label={`Open request log ${log.id}`}
    >
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="group/status flex items-center" title={log.status}>
            <span className={log.status === "error" ? "text-destructive" : log.status === "success" ? "text-success" : "text-tertiary"}>
              {log.status === "error" ? <ErrorIcon className="size-3.5" /> : log.status === "success" ? <SuccessIcon className="size-3.5" /> : <PendingIcon className="size-3.5 animate-spin" />}
            </span>
          </span>
          <span className="font-mono text-xs text-foreground">{mask(log.id)}</span>
          <button
            type="button"
            className="inline-flex size-5 items-center justify-center rounded text-tertiary opacity-50 transition-opacity hover:bg-accent hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
            onClick={(event) => { event.stopPropagation(); onCopy(log.id); }}
            title="Copy request ID"
            aria-label="Copy request ID"
          >
            <CopyIcon className="size-3" />
          </button>
          {log.status_code ? (
            <span className={`font-mono text-[11px] ${log.status === "error" ? "text-destructive" : "text-tertiary"}`}>{log.status_code}</span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {log.request_kind ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[10px] text-tertiary">
              <KindIcon className="size-2.5" />
              {requestKindLabel(log.request_kind)}
            </span>
          ) : (
            <span className="text-[10px] capitalize text-tertiary">{log.status === "pending" && log.streaming ? "streaming" : log.status}</span>
          )}
          {log.streaming && !log.request_kind ? <span className="text-[10px] text-tertiary">· stream</span> : null}
        </div>
        {log.error_message && (
          <div className="mt-1 flex max-w-[240px] items-start gap-1 text-xs text-destructive" title={log.error_message}>
            <ErrorIcon className="mt-0.5 size-3 shrink-0" />
            <span className="truncate">{log.error_message}</span>
          </div>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <ProviderIcon className="size-3.5 shrink-0 text-tertiary" />
          <span className="truncate font-medium text-foreground">{log.provider_name}</span>
        </div>
        <div className="mt-1 flex items-center gap-1">
          <span className="max-w-[220px] truncate font-mono text-xs text-tertiary" title={log.model_name}>
            {log.model_name}
          </span>
          <button
            type="button"
            className="inline-flex size-5 shrink-0 items-center justify-center rounded text-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100"
            onClick={(event) => { event.stopPropagation(); onCopy(`${log.provider_name}/${log.model_name}`); }}
            title="Copy provider/model"
            aria-label="Copy provider and model"
          >
            <CopyIcon className="size-3" />
          </button>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5" title={log.credential_identity ?? log.api_key_prefix ?? undefined}>
          <CredentialIcon className="size-3.5 shrink-0 text-tertiary" />
          <span className="truncate font-mono text-xs text-foreground">
            {log.credential_identity ? mask(log.credential_identity) : log.api_key_prefix || "—"}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1 text-xs text-tertiary">
          <span className="truncate">{log.credential_label || log.requester_name || "—"}</span>
          {log.client_ip ? (
            <>
              <span className="text-tertiary/50">·</span>
              <span className="shrink-0 font-mono text-[11px]">{log.client_ip}</span>
            </>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2.5 align-middle">
        {log.request_kind ? (
          <div className="flex items-center gap-1.5">
            <BytesIcon className="size-3.5 shrink-0 text-tertiary" />
            <div>
              <div className="text-sm text-foreground">
                {log.output_bytes != null ? `${formatNumber(log.output_bytes)} bytes` : log.status === "pending" && log.streaming ? "Streaming" : "Media request"}
              </div>
              <div className="text-[11px] text-tertiary">
                {log.status === "pending" && log.streaming ? "Delivered so far" : log.output_bytes != null ? "Response delivered" : "Not reported"}
              </div>
            </div>
          </div>
        ) : log.tokens_total === 0 && log.status === "success" ? (
          <span className="inline-flex items-center gap-1 text-xs text-tertiary">
            <TokensIcon className="size-3.5" />
            Not reported
          </span>
        ) : log.status === "pending" && log.streaming ? (
          <div className="flex items-center gap-1.5">
            <TokensIcon className="size-3.5 shrink-0 text-tertiary" />
            <div>
              <div className="text-sm text-foreground">{formatNumber(log.streamed_chars)} chars</div>
              <div className="text-[11px] text-tertiary">Delivered · {formatDuration(Date.now() - new Date(`${log.created_at}Z`).getTime())}</div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <TokensIcon className="size-3.5 shrink-0 text-tertiary" />
            <div>
              <div className="text-sm text-foreground">
                {formatNumber(log.tokens_total)} <span className="text-[11px] text-tertiary">tokens</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-tertiary">
                <span>In {formatNumber(log.tokens_prompt)}</span>
                <span>·</span>
                <span>Out {formatNumber(log.tokens_completion)}</span>
                {log.tokens_cache_read > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-accent-blue">Cache {formatNumber(log.tokens_cache_read)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 align-middle">
        <span className="inline-flex items-center gap-1 text-sm tabular-nums text-foreground">
          <CostIcon className="size-3.5 text-tertiary" />
          {formatCost(log.estimated_cost_usd)}
        </span>
      </td>
      <td className="px-3 py-2.5 align-middle tabular-nums">
        <div className="flex items-center gap-1.5">
          <SpeedIcon className="size-3.5 shrink-0 text-tertiary" />
          <div>
            <div className="text-sm text-foreground">
              {log.tps != null ? `${log.tps.toFixed(1)}` : "—"}
              <span className="ml-0.5 text-[11px] text-tertiary">TPS</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-tertiary">
              <TimeIcon className="size-2.5" />
              {formatDuration(log.duration_ms)}
            </div>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-tertiary" title={formatTime(log.created_at)}>
        {formatRelative(log.created_at)}
      </td>
    </tr>
  );
});

export default function RequestLogsPage() {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingNew, setPendingNew] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [selected, setSelected] = useState<RequestLog | null>(null);
  const [detail, setDetail] = useState<RequestLogDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Guards for overlapping/obsolete list requests.
  const listGeneration = useRef(0);
  const loadingMoreRef = useRef(false);
  // Mirror of state the stream handler reads outside React's render cycle.
  const filtersRef = useRef({ search, status });
  const pausedRef = useRef(false);
  const pendingNewRef = useRef(0);
  const pendingUpdates = useRef(new Map<string, RequestLog>());
  const flushTimer = useRef<number | undefined>(undefined);
  const scrollAnchor = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    filtersRef.current = { search, status };
  }, [search, status]);

  const flushPendingUpdates = useCallback(() => {
    flushTimer.current = undefined;
    if (!pendingUpdates.current.size) return;
    const updates = pendingUpdates.current;
    pendingUpdates.current = new Map();
    setLogs((current) => current.map((log) => updates.get(log.id) ?? log));
  }, []);

  const queueUpdate = useCallback((log: RequestLog) => {
    pendingUpdates.current.set(log.id, log);
    if (flushTimer.current === undefined) {
      flushTimer.current = window.setTimeout(flushPendingUpdates, LIVE_FLUSH_MS);
    }
  }, [flushPendingUpdates]);

  const applyEvent = useCallback((event: import("../api/client").RequestLogStreamEvent) => {
    if (event.type === "cleared") {
      listGeneration.current += 1;
      pendingUpdates.current.clear();
      pendingNewRef.current = 0;
      setPendingNew(0);
      setLogs([]);
      setTotal(0);
      setHasMore(false);
      return;
    }
    const { log } = event;
    if (filtersRef.current.status && log.status !== filtersRef.current.status) return;
    if (filtersRef.current.search && !matchesSearch(log, filtersRef.current.search)) return;

    if (pausedRef.current) {
      if (event.type === "created") {
        pendingNewRef.current += 1;
        setPendingNew(pendingNewRef.current);
      }
      return;
    }

    if (event.type === "created") {
      setTotal((current) => (current == null ? current : current + 1));
      setLogs((current) => (current.some((item) => item.id === log.id) ? current : [log, ...current].slice(0, MAX_ROWS)));
      return;
    }

    // Updates to rows that are not loaded (older pages) are ignored.
    queueUpdate(log);
  }, [queueUpdate]);

  useEffect(() => {
    const controller = new AbortController();
    let retryTimer: number | undefined;
    let stopped = false;

    const connect = async () => {
      try {
        await requestLogs.stream(controller.signal, applyEvent);
      } catch {
        if (stopped || controller.signal.aborted) return;
      }
      // Server closed the stream; reconnect while the page is mounted.
      if (!stopped && !controller.signal.aborted) {
        retryTimer = window.setTimeout(connect, 3000);
      }
    };
    void connect();

    return () => {
      stopped = true;
      controller.abort();
      if (retryTimer) window.clearTimeout(retryTimer);
      if (flushTimer.current !== undefined) window.clearTimeout(flushTimer.current);
      pendingUpdates.current.clear();
    };
  }, [applyEvent]);

  // Locale timestamps ("10:30:05") age; refresh them periodically.
  const [, setClock] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setClock((tick) => tick + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const fetchPage = useCallback(async (before?: string) => {
    const generation = ++listGeneration.current;
    const isFirstPage = before === undefined;
    if (isFirstPage) {
      pendingNewRef.current = 0;
      setRefreshing(true);
      setPendingNew(0);
      if (!logs.length) setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const result = await requestLogs.list({
        limit: PAGE_SIZE,
        status: status || undefined,
        search: search || undefined,
        before,
        withTotal: isFirstPage,
      });
      if (generation !== listGeneration.current) return;
      if (isFirstPage && result.total != null) setTotal(result.total);
      setLogs((current) => {
        if (isFirstPage) return result.data;
        const seen = new Set(current.map((log) => log.id));
        return [...current, ...result.data.filter((log) => !seen.has(log.id))].slice(0, MAX_ROWS);
      });
      setHasMore(result.data.length === PAGE_SIZE);
      lastResult.current = result.data.length === PAGE_SIZE ? "full" : "short";
      setError(null);
    } catch (e: any) {
      if (generation === listGeneration.current) setError(e.message);
    } finally {
      // Always release the guard: a first-page load supersedes any in-flight
      // "load older" request, which then bails out before its own finally.
      loadingMoreRef.current = false;
      if (generation === listGeneration.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [logs.length, search, status]);

  // Reload the first page whenever filters change (search is already debounced).
  useEffect(() => {
    void fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  // Debounce the search input so each keystroke does not hit the API.
  useEffect(() => {
    if (searchInput === search) return;
    const timer = window.setTimeout(() => setSearch(searchInput), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, search]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !logs.length) return;
    loadingMoreRef.current = true;
    autoArmed.current = false;
    await fetchPage(logs[logs.length - 1].created_at);
  }, [fetchPage, logs]);

  // Auto-load the next page when the "Load older" button actually comes into
  // view. The last load must have returned a full page and the user must have
  // scrolled away in between, so a short page cannot trap us in a no-op loop.
  const sentinelObserver = useRef<IntersectionObserver | null>(null);
  const lastResult = useRef<"none" | "full" | "short">("none");
  const autoArmed = useRef(true);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;

  const sentinel = useCallback((node: HTMLButtonElement | null) => {
    sentinelObserver.current?.disconnect();
    if (!node) return;
    sentinelObserver.current = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        autoArmed.current = lastResult.current !== "short";
        return;
      }
      if (!autoArmed.current || !hasMoreRef.current) return;
      autoArmed.current = false;
      void loadMoreRef.current();
    }, { rootMargin: "0px" });
    sentinelObserver.current.observe(node);
  }, []);

  // Pause live inserts once the table header scrolls out of view so new rows
  // never push content under the cursor; resume automatically on return or via
  // the "new requests" button. Updates to visible rows keep flowing.
  useEffect(() => {
    const anchor = scrollAnchor.current;
    if (!anchor) return;
    const root = anchor.closest("main");
    const observer = new IntersectionObserver(([entry]) => {
      pausedRef.current = !entry.isIntersecting;
      if (entry.isIntersecting) {
        pendingNewRef.current = 0;
        setPendingNew(0);
      }
    }, { root, threshold: 0 });
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [loading]);

  const jumpToLatest = () => {
    pausedRef.current = false;
    pendingNewRef.current = 0;
    setPendingNew(0);
    autoArmed.current = true;
    lastResult.current = "none";
    scrollAnchor.current?.closest("main")?.scrollTo({ top: 0, behavior: "smooth" });
    void fetchPage();
  };



  const copy = async (value: string) => {
    await copyToClipboard(value);
  };

  const openDetail = async (log: RequestLog) => {
    setSelected(log);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      setDetail(await requestLogs.get(log.id));
    } catch (e: any) {
      setDetailError(e.message || "Unable to load request details");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await requestLogs.clear();
      setConfirmOpen(false);
      await fetchPage();
    } catch (e: any) {
      setError(e.message);
      setConfirmOpen(false);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="w-full space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Request logs
          </h1>
          <p className="mt-1 text-sm text-tertiary">
            Monitor every completion request routed through Klove.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void fetchPage()} disabled={loading || refreshing}>
            {refreshing ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RefreshIcon className="size-4" />
            )}
            Refresh
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmOpen(true)}
            disabled={total === 0}
          >
            <DeleteIcon className="size-4" />
            Clear logs
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="gap-0 overflow-hidden rounded-xl border border-border p-0 shadow-none ring-0">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 py-(--card-spacing)">
          <CardTitle className="text-base font-medium tracking-tight text-foreground">
            All requests{" "}
            <span className="font-mono text-tertiary">({total ?? "…"})</span>
            {refreshing && (
              <LoaderCircle
                className="ml-2 inline size-3.5 animate-spin text-tertiary"
                aria-label="Refreshing logs"
              />
            )}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tertiary" />
              <Input
                className="h-9 w-64 pl-9"
                placeholder="Search ID, model or account"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    className="h-9 min-w-32 justify-between gap-3 bg-background"
                  />
                }
              >
                <span>
                  {status
                    ? status.charAt(0).toUpperCase() + status.slice(1)
                    : "All statuses"}
                </span>
                <ArrowDown className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {[
                  ["", "All statuses"],
                  ["success", "Success"],
                  ["error", "Error"],
                  ["pending", "Pending"],
                ].map(([value, label]) => (
                  <DropdownMenuItem key={label} onClick={() => setStatus(value)}>
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative">
            {pendingNew > 0 && (
              <div className="sticky top-2 z-10 flex justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-card shadow-md"
                  onClick={jumpToLatest}
                >
                  <ArrowUp className="size-3.5" />
                  {pendingNew === 1 ? "1 new request" : `${pendingNew} new requests`}
                </Button>
              </div>
            )}
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full min-w-[1100px] text-sm">
                <thead ref={scrollAnchor}>
                  <tr className="border-b border-border bg-background/60 text-left text-xs font-medium text-tertiary">
                    <th className="h-9 px-3 py-2.5">Request</th>
                    <th className="h-9 px-3 py-2.5">Provider / model</th>
                    <th className="h-9 px-3 py-2.5">Requester</th>
                    <th className="h-9 px-3 py-2.5">Usage</th>
                    <th className="h-9 px-3 py-2.5">Cost</th>
                    <th className="h-9 px-3 py-2.5">Performance</th>
                    <th className="h-9 px-3 py-2.5">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <LogRow key={log.id} log={log} onOpen={openDetail} onCopy={copy} />
                  ))}
                  {loading && !logs.length && (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-sm text-tertiary">
                        <LoaderCircle className="mx-auto size-4 animate-spin" />
                      </td>
                    </tr>
                  )}
                  {!loading && !logs.length && (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center text-sm text-tertiary">
                        No request logs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border bg-background/60 px-4 py-2 text-xs text-tertiary">
            <span>
              {logs.length
                ? `Showing ${logs.length}${total != null ? ` of ${total}` : ""} request${logs.length === 1 ? "" : "s"}`
                : "0 requests"}
              {hasMore ? " · more available" : ""}
            </span>
            <Button
              size="sm"
              variant="outline"
              ref={hasMore ? sentinel : undefined}
              disabled={!hasMore || loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? <LoaderCircle className="size-3.5 animate-spin" /> : <ArrowDown className="size-3.5" />}
              Load older
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] gap-3 overflow-hidden rounded-xl border border-border bg-card shadow-[0px_4px_16px_0px_rgba(0,0,0,0.05)] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Request log details</DialogTitle>
            <DialogDescription>{selected?.id} · {selected ? formatTime(selected.created_at) : ""}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-3">
            {detailLoading && <LoaderCircle className="mx-auto my-8 size-5 animate-spin" />}
            {detailError && <Alert variant="destructive"><AlertDescription>Unable to load this request log: {detailError}</AlertDescription></Alert>}
            {detail && <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2"><StatusBadge log={detail} /><span>{detail.provider_name} / {detail.model_name}</span><span className="text-tertiary">{detail.credential_label || "credential masked"}</span></div>
              {([ ["Request metadata / payload", detail.request_details], ["Response payload", detail.response_details], ["Error details", detail.error_details] ] as const).map(([title, value]) => (
                <section key={title} className="space-y-1">
                  <div className="flex items-center justify-between"><h3 className="text-sm font-medium text-foreground">{title}</h3><Button variant="ghost" size="sm" disabled={value == null} onClick={() => copy(JSON.stringify(value, null, 2))}><CopyIcon className="size-3" /> Copy</Button></div>
                  <pre className="max-h-72 overflow-auto rounded-xl border border-border bg-background/60 p-3 font-mono text-xs text-foreground whitespace-pre-wrap break-words">{value == null ? "No details captured." : JSON.stringify(value, null, 2)}</pre>
                </section>
              ))}
              {detail.error_message && <section><h3 className="text-sm font-medium text-destructive">Error</h3><pre className="mt-1 whitespace-pre-wrap text-xs text-destructive">{detail.error_message}</pre></section>}
            </div>}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        title="Clear request logs"
        message="This permanently deletes all request logs. Token usage statistics are not affected."
        confirmLabel="Clear logs"
        loading={clearing}
        onConfirm={handleClear}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
