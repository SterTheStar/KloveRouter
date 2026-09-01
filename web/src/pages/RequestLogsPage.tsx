import { useCallback, useEffect, useRef, useState } from "react";
import {
  RiArrowDownSLine as ArrowDown,
  RiDeleteBinLine as DeleteIcon,
  RiFileCopyLine as CopyIcon,
  RiLoader4Line as LoaderCircle,
  RiRefreshLine as RefreshIcon,
  RiSearchLine as SearchIcon,
} from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import type { RequestLog } from "../types";
import { copyToClipboard } from "../lib/clipboard";

const PAGE_SIZE = 50;

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
  return (
    <Badge
      variant={
        log.status === "success"
          ? "secondary"
          : log.status === "error"
            ? "destructive"
            : "outline"
      }
    >
      {log.status}
      {log.status_code ? ` ${log.status_code}` : ""}
    </Badge>
  );
}

export default function RequestLogsPage() {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [selected, setSelected] = useState<RequestLog | null>(null);
  const [detail, setDetail] = useState<import("../types").RequestLogDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const requestRef = useRef(false);

  const load = useCallback(async () => {
    if (requestRef.current) return;
    requestRef.current = true;
    setRefreshing(true);
    if (!loadedRef.current) setLoading(true);
    try {
      const result = await requestLogs.list({
        limit: PAGE_SIZE,
        offset,
        status: status || undefined,
        search: search || undefined,
      });
      setLogs(result.data);
      setTotal(result.total);
      setError(null);
      loadedRef.current = true;
    } catch (e: any) {
      setError(e.message);
    } finally {
      requestRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [offset, search, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const interval = window.setInterval(load, 5000);
    return () => window.clearInterval(interval);
  }, [load]);

  // Debounce the search input so each keystroke does not hit the API.
  useEffect(() => {
    if (searchInput === search) return;
    const timer = window.setTimeout(() => {
      setOffset(0);
      setSearch(searchInput);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, search]);

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
      setOffset(0);
      setConfirmOpen(false);
      await load();
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
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Request Logs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor every completion request routed through Klove.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RefreshIcon className="size-4" />
            )}
            Refresh
          </Button>
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={!total}
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

      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3 py-(--card-spacing)">
          <CardTitle>
            All requests{" "}
            <span className="text-muted-foreground">({total})</span>
            {refreshing && (
              <LoaderCircle
                className="ml-2 inline size-3.5 animate-spin text-muted-foreground"
                aria-label="Refreshing logs"
              />
            )}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
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
                    className="h-9 min-w-32 justify-between gap-3 bg-muted/30 dark:bg-muted/30"
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
                <DropdownMenuItem
                  onClick={() => {
                    setOffset(0);
                    setStatus("");
                  }}
                >
                  All statuses
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setOffset(0);
                    setStatus("success");
                  }}
                >
                  Success
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setOffset(0);
                    setStatus("error");
                  }}
                >
                  Error
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setOffset(0);
                    setStatus("pending");
                  }}
                >
                  Pending
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-y bg-muted/30 text-left text-xs text-muted-foreground">
                  <th className="p-3">Request</th>
                  <th className="p-3">Provider / model</th>
                  <th className="p-3">Requester</th>
                  <th className="p-3">Usage</th>
                  <th className="p-3">Cost</th>
                  <th className="p-3">Performance</th>
                  <th className="p-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="cursor-pointer border-b align-top last:border-0 hover:bg-muted/20"
                    onClick={() => openDetail(log)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") openDetail(log);
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open request log ${log.id}`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <span>{mask(log.id)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          onClick={(event) => { event.stopPropagation(); copy(log.id); }}
                          title="Copy request ID"
                        >
                          <CopyIcon className="size-3" />
                        </Button>
                      </div>
                      <StatusBadge log={log} />
                      {log.error_message && (
                        <div
                          className="mt-1 max-w-[220px] truncate text-xs text-destructive"
                          title={log.error_message}
                        >
                          {log.error_message}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{log.provider_name}</div>
                      <div className="mt-1 flex items-center gap-1">
                        <div
                          className="max-w-[240px] truncate font-mono text-xs text-muted-foreground"
                          title={log.model_name}
                        >
                          {log.model_name}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0"
                          onClick={() =>
                            copy(`${log.provider_name}/${log.model_name}`)
                          }
                          title="Copy provider/model"
                        >
                          <CopyIcon className="size-3" />
                        </Button>
                      </div>
                    </td>
                    <td className="p-3">
                      <div title={log.credential_identity ?? undefined}>
                        {mask(log.credential_identity)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {log.credential_label || log.requester_name || "—"}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {log.client_ip || "—"}
                      </div>
                    </td>
                    <td className="p-3 align-middle">
                      {log.tokens_total === 0 && log.status === "success" ? (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground"
                        >
                          Not supported
                        </Badge>
                      ) : (
                        <>
                          <div>{formatNumber(log.tokens_total)} tokens</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            In {formatNumber(log.tokens_prompt)} · Out{" "}
                            {formatNumber(log.tokens_completion)}
                          </div>
                          {log.tokens_cache_read > 0 && (
                            <div className="text-xs text-blue-500">
                              Cache {formatNumber(log.tokens_cache_read)}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="p-3 font-medium">
                      {formatCost(log.estimated_cost_usd)}
                    </td>
                    <td className="p-3">
                      <div>
                        {log.tps != null ? `${log.tps.toFixed(1)} TPS` : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDuration(log.duration_ms)}
                      </div>
                    </td>
                    <td
                      className="whitespace-nowrap p-3 text-xs text-muted-foreground"
                      title={formatTime(log.created_at)}
                    >
                      {formatRelative(log.created_at)}
                    </td>
                  </tr>
                ))}
                {loading && !logs.length && (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-6 text-center text-sm text-muted-foreground"
                    >
                      <LoaderCircle className="mx-auto size-4 animate-spin" />
                    </td>
                  </tr>
                )}
                {!loading && !logs.length && (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-6 text-center text-sm text-muted-foreground"
                    >
                      No request logs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
            <span>
              {total
                ? `${offset + 1}-${Math.min(offset + logs.length, total)} of ${total}`
                : "0 requests"}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={offset === 0 || loading}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={offset + PAGE_SIZE >= total || loading}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] gap-3 overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Request log details</DialogTitle>
            <DialogDescription>{selected?.id} · {selected ? formatTime(selected.created_at) : ""}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-3">
            {detailLoading && <LoaderCircle className="mx-auto my-8 size-5 animate-spin" />}
            {detailError && <Alert variant="destructive"><AlertDescription>Unable to load this request log: {detailError}</AlertDescription></Alert>}
            {detail && <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2"><StatusBadge log={detail} /><span>{detail.provider_name} / {detail.model_name}</span><span className="text-muted-foreground">{detail.credential_label || "credential masked"}</span></div>
              {([ ["Request metadata / payload", detail.request_details], ["Response payload", detail.response_details], ["Error details", detail.error_details] ] as const).map(([title, value]) => (
                <section key={title} className="space-y-1">
                  <div className="flex items-center justify-between"><h3 className="font-medium">{title}</h3><Button variant="ghost" size="sm" disabled={value == null} onClick={() => copy(JSON.stringify(value, null, 2))}><CopyIcon className="size-3" /> Copy</Button></div>
                  <pre className="max-h-72 overflow-auto rounded-md bg-muted/50 p-3 text-xs whitespace-pre-wrap break-words">{value == null ? "No details captured." : JSON.stringify(value, null, 2)}</pre>
                </section>
              ))}
              {detail.error_message && <section><h3 className="font-medium text-destructive">Error</h3><pre className="mt-1 whitespace-pre-wrap text-xs text-destructive">{detail.error_message}</pre></section>}
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