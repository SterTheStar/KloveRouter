import { useMemo, useState, type ReactNode } from "react";
import {
  RiArrowDownSLine as ArrowDown,
  RiArrowUpSLine as ArrowUp,
  RiCloudLine,
  RiCoinsLine,
  RiHardDrive2Line,
  RiMoneyDollarCircleLine,
  RiPulseLine,
  RiSearchLine,
  RiSparklingLine,
  RiSpeedUpLine,
  RiTimeLine,
} from "@remixicon/react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { StatsByModel } from "@/types";
import { formatNumber, formatCost, formatDuration } from "./usage-utils";

export type ModelSortKey =
  | "model_name"
  | "provider_name"
  | "requests"
  | "tokens_total"
  | "tokens_cache_read"
  | "estimated_cost_usd"
  | "avg_duration_ms"
  | "tps";

interface UsageModelTableProps {
  byModel: StatsByModel[];
}

function TokenBreakdownTooltip({
  prompt,
  completion,
  cache,
  children,
}: {
  prompt: number;
  completion: number;
  cache?: number;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        className="cursor-help underline-offset-4 hover:underline"
        render={<span />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        <div className="space-y-1">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Prompt:</span>
            <span className="font-mono tabular-nums">{formatNumber(prompt)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Completion:</span>
            <span className="font-mono tabular-nums">{formatNumber(completion)}</span>
          </div>
          {cache !== undefined && cache > 0 && (
            <div className="flex justify-between gap-4 text-emerald-600 dark:text-emerald-400">
              <span>Cached:</span>
              <span className="font-mono tabular-nums">{formatNumber(cache)}</span>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function SortTh({
  icon: Icon,
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  align = "left",
}: {
  icon?: typeof RiSparklingLine;
  label: string;
  k: ModelSortKey;
  sortKey: ModelSortKey;
  sortDir: "asc" | "desc";
  onSort: (key: ModelSortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === k;
  const sortIcon = active ? (
    sortDir === "asc" ? (
      <ArrowUp className="size-3 shrink-0" />
    ) : (
      <ArrowDown className="size-3 shrink-0" />
    )
  ) : null;

  return (
    <th className="px-3.5 py-3 whitespace-nowrap">
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "flex w-full items-center gap-1.5 text-xs font-normal text-tertiary transition-colors hover:text-foreground",
          align === "right" ? "justify-end" : "justify-start",
          active && "text-foreground font-normal"
        )}
      >
        {align === "right" && sortIcon}
        {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground" />}
        <span>{label}</span>
        {align === "left" && sortIcon}
      </button>
    </th>
  );
}

export function UsageModelTable({ byModel }: UsageModelTableProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<ModelSortKey>("tokens_total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: ModelSortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "model_name" || key === "provider_name" ? "asc" : "desc");
    }
  };

  const filteredModels = useMemo(() => {
    if (!search.trim()) return byModel;
    const query = search.toLowerCase();
    return byModel.filter(
      (m) =>
        m.model_name.toLowerCase().includes(query) ||
        m.provider_name.toLowerCase().includes(query)
    );
  }, [byModel, search]);

  const sortedModels = useMemo(() => {
    return [...filteredModels].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (av === null || av === undefined) av = -Infinity as any;
      if (bv === null || bv === undefined) bv = -Infinity as any;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
  }, [filteredModels, sortKey, sortDir]);

  const modelTotals = useMemo(() => {
    const requests = sortedModels.reduce((s, m) => s + m.requests, 0);
    const tokens = sortedModels.reduce((s, m) => s + m.tokens_total, 0);
    const prompt = sortedModels.reduce((s, m) => s + m.tokens_prompt, 0);
    const completion = sortedModels.reduce((s, m) => s + m.tokens_completion, 0);
    const cache = sortedModels.reduce((s, m) => s + m.tokens_cache_read, 0);
    const cost = sortedModels.reduce((s, m) => s + m.estimated_cost_usd, 0);
    const totalDuration = sortedModels.reduce((s, m) => s + m.avg_duration_ms * m.requests, 0);
    const avgDuration = requests > 0 ? totalDuration / requests : 0;
    return { requests, tokens, prompt, completion, cache, cost, avgDuration };
  }, [sortedModels]);

  if (!byModel.length) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-none">
      {/* Table Header and Search */}
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-normal tracking-tight text-foreground">
            Model performance & volume
          </h3>
          <p className="text-xs text-muted-foreground">
            {sortedModels.length} of {byModel.length} models tracked
          </p>
        </div>

        <div className="relative w-full sm:w-56">
          <RiSearchLine className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search model or provider..."
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Modern Data Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-background/50">
              <SortTh
                icon={RiSparklingLine}
                label="Model"
                k="model_name"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortTh
                icon={RiCloudLine}
                label="Provider"
                k="provider_name"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
              />
              <SortTh
                icon={RiPulseLine}
                label="Requests"
                k="requests"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortTh
                icon={RiCoinsLine}
                label="Tokens volume"
                k="tokens_total"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortTh
                icon={RiHardDrive2Line}
                label="Cache hits"
                k="tokens_cache_read"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortTh
                icon={RiMoneyDollarCircleLine}
                label="Estimated spend"
                k="estimated_cost_usd"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortTh
                icon={RiTimeLine}
                label="Avg latency"
                k="avg_duration_ms"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortTh
                icon={RiSpeedUpLine}
                label="Output TPS"
                k="tps"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                align="right"
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {sortedModels.map((m) => {
              const cacheHitPercent =
                m.tokens_prompt > 0
                  ? ((m.tokens_cache_read / m.tokens_prompt) * 100).toFixed(0)
                  : "0";

              return (
                <tr
                  key={`${m.provider_id}-${m.model_id}`}
                  className="transition-colors hover:bg-accent/30"
                >
                  <td className="px-3.5 py-3 font-mono text-xs font-normal text-foreground">
                    <span className="break-all" title={m.model_name}>
                      {m.model_name}
                    </span>
                  </td>

                  <td className="px-3.5 py-3">
                    <Badge variant="outline" className="text-xs font-normal">
                      {m.provider_name}
                    </Badge>
                  </td>

                  <td className="px-3.5 py-3 text-right font-mono text-xs tabular-nums text-foreground">
                    {m.requests.toLocaleString()}
                  </td>

                  <td className="px-3.5 py-3 text-right font-mono text-xs tabular-nums text-foreground">
                    <TokenBreakdownTooltip
                      prompt={m.tokens_prompt}
                      completion={m.tokens_completion}
                      cache={m.tokens_cache_read}
                    >
                      {formatNumber(m.tokens_total)}
                    </TokenBreakdownTooltip>
                  </td>

                  <td className="px-3.5 py-3 text-right font-mono text-xs tabular-nums">
                    {m.tokens_cache_read > 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {formatNumber(m.tokens_cache_read)} ({cacheHitPercent}%)
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  <td className="px-3.5 py-3 text-right font-mono text-xs tabular-nums text-foreground">
                    {formatCost(m.estimated_cost_usd)}
                  </td>

                  <td className="px-3.5 py-3 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {formatDuration(m.avg_duration_ms)}
                  </td>

                  <td className="px-3.5 py-3 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {m.tps !== null ? `${m.tps.toFixed(1)} tps` : "—"}
                  </td>
                </tr>
              );
            })}

            {sortedModels.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="py-8 text-center text-xs text-muted-foreground"
                >
                  No models match the filter &ldquo;{search}&rdquo;.
                </td>
              </tr>
            )}
          </tbody>

          {/* Aggregated Totals Footer */}
          <tfoot>
            <tr className="border-t border-border bg-background/60 text-xs font-normal">
              <td className="px-3.5 py-3" colSpan={2}>
                Total ({sortedModels.length} models)
              </td>
              <td className="px-3.5 py-3 text-right font-mono tabular-nums text-foreground">
                {modelTotals.requests.toLocaleString()}
              </td>
              <td className="px-3.5 py-3 text-right font-mono tabular-nums text-foreground">
                <TokenBreakdownTooltip
                  prompt={modelTotals.prompt}
                  completion={modelTotals.completion}
                  cache={modelTotals.cache}
                >
                  {formatNumber(modelTotals.tokens)}
                </TokenBreakdownTooltip>
              </td>
              <td className="px-3.5 py-3 text-right font-mono tabular-nums text-muted-foreground">
                {formatNumber(modelTotals.cache)}
              </td>
              <td className="px-3.5 py-3 text-right font-mono tabular-nums text-foreground">
                {formatCost(modelTotals.cost)}
              </td>
              <td className="px-3.5 py-3 text-right font-mono tabular-nums text-muted-foreground">
                {formatDuration(modelTotals.avgDuration)}
              </td>
              <td className="px-3.5 py-3 text-right text-muted-foreground">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
