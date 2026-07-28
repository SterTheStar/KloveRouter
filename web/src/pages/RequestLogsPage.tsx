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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { requestLogs } from "../api/client";
import type { RequestLog } from "../types";
import { copyToClipboard } from "../lib/clipboard";

function formatNumber(value: number) {
  return value.toLocaleString();
}
function formatCost(value: number) {
  return value ? `$${value < 0.01 ? value.toFixed(4) : value.toFixed(2)}` : "—";
}
function formatDate(value: string) {
  return new Date(`${value}Z`).toLocaleString();
}
function mask(value: string | null) {
  if (!value) return "—";
  return value.length > 16
    ? `${value.slice(0, 8)}...${value.slice(-4)}`
    : value;
}

export default function RequestLogsPage() {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const requestRef = useRef(false);
  const load = useCallback(async () => {
    if (requestRef.current) return;
    requestRef.current = true;
    if (!loadedRef.current) setLoading(true);
    try {
      const result = await requestLogs.list({
        limit: 50,
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
    }
  }, [offset, search, status]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const interval = window.setInterval(load, 5000);
    return () => window.clearInterval(interval);
  }, [load]);
  const copy = async (value: string) => {
    await copyToClipboard(value);
  };
  const clear = async () => {
    if (!window.confirm("Delete all request logs?")) return;
    await requestLogs.clear();
    setOffset(0);
    load();
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
            onClick={clear}
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
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 w-64 pl-9"
                placeholder="Search ID, model or account"
                value={search}
                onChange={(e) => {
                  setOffset(0);
                  setSearch(e.target.value);
                }}
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
                    className="border-b align-top last:border-0 hover:bg-muted/20"
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <span>{mask(log.id)}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          onClick={() => copy(log.id)}
                          title="Copy request ID"
                        >
                          <CopyIcon className="size-3" />
                        </Button>
                      </div>
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
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{log.provider_name}</div>
                      <div
                        className="mt-1 max-w-[260px] truncate font-mono text-xs text-muted-foreground"
                        title={log.model_name}
                      >
                        {log.model_name}
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
                        <Badge variant="outline" className="text-muted-foreground">Not supported</Badge>
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
                      <div>{log.tps ? `${log.tps.toFixed(1)} TPS` : "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {log.duration_ms
                          ? `${(log.duration_ms / 1000).toFixed(2)}s`
                          : "—"}
                      </div>
                    </td>
                    <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">
                      {formatDate(log.created_at)}
                    </td>
                  </tr>
                ))}
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
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={offset + 50 >= total || loading}
                onClick={() => setOffset(offset + 50)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
