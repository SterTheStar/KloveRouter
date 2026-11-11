import { useMemo, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
} from "recharts";
import { RiSearchLine, RiArrowRightSLine, RiArrowUpSLine } from "@remixicon/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { StatsByProvider } from "@/types";
import {
  COLORS,
  formatNumber,
  formatCost,
  ChartPanel,
} from "./usage-utils";

interface UsageDistributionChartsProps {
  byProvider: StatsByProvider[];
}

type DistributionMetric = "tokens" | "requests" | "cost";

const MAX_PRIMARY_SLICES = 5;
const OTHER_COLOR = "#64748b";

interface DonutSlice {
  name: string;
  value: number;
  color: string;
  raw: StatsByProvider;
  isOther: boolean;
  totalTokens: number;
  totalRequests: number;
  totalCost: number;
  /** Only set on the consolidated "Other" slice. */
  otherCount?: number;
  share?: number;
  cost?: number;
}

function ProviderCustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  if (item.isOther) {
    return (
      <div className="min-w-60 rounded-xl border border-border bg-popover/95 p-3.5 text-xs text-popover-foreground shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-border/80 pb-2">
          <span className="font-normal text-foreground">{item.name}</span>
          <span
            className="h-2 w-3 rounded-xs shrink-0"
            style={{ background: item.color }}
          />
        </div>

        <div className="mt-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Volume share</span>
            <span className="font-mono tabular-nums font-normal text-foreground">
              {item.share?.toFixed(1)}% of total
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Tokens routed</span>
            <span className="font-mono tabular-nums font-normal text-foreground">
              {formatNumber(item.value)} tokens
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Consolidated providers</span>
            <span className="font-mono tabular-nums font-normal text-foreground">
              {item.otherCount} smaller providers
            </span>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-border/60">
            <span className="text-muted-foreground">Estimated spend</span>
            <span className="font-mono tabular-nums font-normal text-foreground">
              {formatCost(item.cost)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  const provider: StatsByProvider = item.raw;
  const totalTokens: number = item.totalTokens || 1;
  const totalRequests: number = item.totalRequests || 1;
  const totalCost: number = item.totalCost || 1;

  const tokenShare = ((provider.tokens_total / totalTokens) * 100).toFixed(1);
  const reqShare = ((provider.requests / totalRequests) * 100).toFixed(1);
  const costShare = ((provider.estimated_cost_usd / totalCost) * 100).toFixed(1);
  const avgCostPer1M =
    provider.tokens_total > 0
      ? (provider.estimated_cost_usd / (provider.tokens_total / 1_000_000)).toFixed(2)
      : "0.00";

  return (
    <div className="min-w-60 rounded-xl border border-border bg-popover/95 p-3.5 text-xs text-popover-foreground shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-border/80 pb-2">
        <span className="font-normal text-foreground">{provider.provider_name}</span>
        <span
          className="h-2 w-3 rounded-xs shrink-0"
          style={{ background: item.color }}
        />
      </div>

      <div className="mt-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Tokens routed</span>
          <span className="font-mono tabular-nums font-normal text-foreground">
            {formatNumber(provider.tokens_total)} ({tokenShare}%)
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Total requests</span>
          <span className="font-mono tabular-nums font-normal text-foreground">
            {provider.requests.toLocaleString()} ({reqShare}%)
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Estimated spend</span>
          <span className="font-mono tabular-nums font-normal text-foreground">
            {formatCost(provider.estimated_cost_usd)} ({costShare}%)
          </span>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-border/60 text-muted-foreground">
          <span>Unit cost</span>
          <span className="font-mono tabular-nums">
            ${avgCostPer1M} / 1M tokens
          </span>
        </div>
      </div>
    </div>
  );
}

export function UsageDistributionCharts({
  byProvider,
}: UsageDistributionChartsProps) {
  const [metric, setMetric] = useState<DistributionMetric>("tokens");
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");

  const hasMany = byProvider.length > 6;

  const totals = useMemo(() => {
    const totalTokens = byProvider.reduce((s, p) => s + p.tokens_total, 0);
    const totalRequests = byProvider.reduce((s, p) => s + p.requests, 0);
    const totalCost = byProvider.reduce((s, p) => s + p.estimated_cost_usd, 0);
    return { totalTokens, totalRequests, totalCost };
  }, [byProvider]);

  // Full sorted list
  const fullSortedList = useMemo(() => {
    return [...byProvider].sort((a, b) => {
      let av = a.tokens_total;
      let bv = b.tokens_total;
      if (metric === "requests") {
        av = a.requests;
        bv = b.requests;
      } else if (metric === "cost") {
        av = a.estimated_cost_usd;
        bv = b.estimated_cost_usd;
      }
      return bv - av;
    });
  }, [byProvider, metric]);

  const currentTotal =
    metric === "tokens"
      ? totals.totalTokens
      : metric === "requests"
      ? totals.totalRequests
      : totals.totalCost;

  // Sliced data for Donut Chart (Top 5 + "Other" if many providers)
  const donutChartData = useMemo<DonutSlice[]>(() => {
    if (!hasMany) {
      return fullSortedList.map((p, idx) => {
        let value = p.tokens_total;
        if (metric === "requests") value = p.requests;
        else if (metric === "cost") value = p.estimated_cost_usd;

        return {
          name: p.provider_name,
          value,
          color: COLORS[idx % COLORS.length],
          raw: p,
          isOther: false,
          totalTokens: totals.totalTokens,
          totalRequests: totals.totalRequests,
          totalCost: totals.totalCost,
        };
      });
    }

    const topItems: DonutSlice[] = fullSortedList.slice(0, MAX_PRIMARY_SLICES).map((p, idx) => {
      let value = p.tokens_total;
      if (metric === "requests") value = p.requests;
      else if (metric === "cost") value = p.estimated_cost_usd;

      return {
        name: p.provider_name,
        value,
        color: COLORS[idx % COLORS.length],
        raw: p,
        isOther: false,
        totalTokens: totals.totalTokens,
        totalRequests: totals.totalRequests,
        totalCost: totals.totalCost,
      };
    });

    const otherItems = fullSortedList.slice(MAX_PRIMARY_SLICES);
    let otherValue = 0;
    let otherTokens = 0;
    let otherCost = 0;
    let otherReqs = 0;

    for (const p of otherItems) {
      if (metric === "tokens") otherValue += p.tokens_total;
      else if (metric === "requests") otherValue += p.requests;
      else if (metric === "cost") otherValue += p.estimated_cost_usd;

      otherTokens += p.tokens_total;
      otherCost += p.estimated_cost_usd;
      otherReqs += p.requests;
    }

    if (otherValue > 0) {
      const share = currentTotal > 0 ? (otherValue / currentTotal) * 100 : 0;
      topItems.push({
        name: `Other (${otherItems.length} providers)`,
        value: otherValue,
        color: OTHER_COLOR,
        raw: {
          provider_id: "other",
          provider_name: `Other (${otherItems.length} providers)`,
          requests: otherReqs,
          tokens_total: otherTokens,
          estimated_cost_usd: otherCost,
        },
        isOther: true,
        otherCount: otherItems.length,
        share,
        cost: otherCost,
        totalTokens: totals.totalTokens,
        totalRequests: totals.totalRequests,
        totalCost: totals.totalCost,
      });
    }

    return topItems;
  }, [fullSortedList, hasMany, metric, totals, currentTotal]);

  // Filtered list for the right-side breakdown
  const displayedList = useMemo(() => {
    let list = fullSortedList;
    if (showAll && search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.provider_name.toLowerCase().includes(q));
    } else if (!showAll && hasMany) {
      list = list.slice(0, MAX_PRIMARY_SLICES);
    }
    return list;
  }, [fullSortedList, showAll, hasMany, search]);

  const otherCount = byProvider.length - MAX_PRIMARY_SLICES;
  const otherSummary = useMemo(() => {
    if (!hasMany || showAll) return null;
    const remaining = fullSortedList.slice(MAX_PRIMARY_SLICES);
    const tokens = remaining.reduce((s, p) => s + p.tokens_total, 0);
    const requests = remaining.reduce((s, p) => s + p.requests, 0);
    const cost = remaining.reduce((s, p) => s + p.estimated_cost_usd, 0);
    let val = tokens;
    if (metric === "requests") val = requests;
    else if (metric === "cost") val = cost;
    const share = currentTotal > 0 ? (val / currentTotal) * 100 : 0;
    return { tokens, requests, cost, share, val };
  }, [hasMany, showAll, fullSortedList, metric, currentTotal]);

  if (!byProvider.length) return null;

  const centerLabel =
    metric === "tokens" ? "Tokens" : metric === "requests" ? "Requests" : "Spend";

  const centerValue =
    metric === "cost" ? formatCost(currentTotal) : formatNumber(currentTotal);

  return (
    <ChartPanel
      title="Provider distribution & economics"
      description={
        hasMany
          ? `Showing top contributors with consolidation of ${otherCount} smaller providers`
          : "Comparative token volume, request distribution, and cost contribution per provider"
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
            <button
              onClick={() => setMetric("tokens")}
              className={`h-6 rounded-md px-2.5 text-xs font-normal transition-colors ${
                metric === "tokens"
                  ? "bg-card text-foreground"
                  : "text-tertiary hover:text-foreground"
              }`}
            >
              Tokens
            </button>
            <button
              onClick={() => setMetric("requests")}
              className={`h-6 rounded-md px-2.5 text-xs font-normal transition-colors ${
                metric === "requests"
                  ? "bg-card text-foreground"
                  : "text-tertiary hover:text-foreground"
              }`}
            >
              Requests
            </button>
            <button
              onClick={() => setMetric("cost")}
              className={`h-6 rounded-md px-2.5 text-xs font-normal transition-colors ${
                metric === "cost"
                  ? "bg-card text-foreground"
                  : "text-tertiary hover:text-foreground"
              }`}
            >
              Cost
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
        {/* Left Side: Sliced Donut Chart (Max 5 + Other) */}
        <div className="flex flex-col items-center justify-center lg:col-span-5">
          <div className="relative aspect-square w-48 sm:w-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="70%"
                  outerRadius="100%"
                  paddingAngle={3}
                  cornerRadius={6}
                  strokeWidth={0}
                >
                  {donutChartData.map((item) => (
                    <Cell key={item.name} fill={item.color} />
                  ))}
                </Pie>
                <ChartTooltip content={<ProviderCustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs font-normal text-tertiary">{centerLabel}</span>
              <span className="font-heading text-xl font-normal tracking-tight tabular-nums text-foreground">
                {centerValue}
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Seamless Breakdown with Max-Height and Toggle */}
        <div className="space-y-3 lg:col-span-7">
          {/* Header Controls for Many Providers */}
          {hasMany && (
            <div className="flex items-center justify-between pb-1 text-xs">
              <span className="text-muted-foreground">
                {showAll
                  ? `All ${byProvider.length} providers`
                  : `Top ${MAX_PRIMARY_SLICES} contributors`}
              </span>

              <div className="flex items-center gap-2">
                {showAll && (
                  <div className="relative w-36 sm:w-44">
                    <RiSearchLine className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Filter..."
                      className="h-6 pl-6 text-xs"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowAll((prev) => !prev);
                    setSearch("");
                  }}
                  className="text-xs text-primary hover:underline font-normal"
                >
                  {showAll ? "Show top 5" : `View all (${byProvider.length})`}
                </button>
              </div>
            </div>
          )}

          {/* Scrollable container with fixed max height to prevent layout break */}
          <div className="max-h-[22rem] overflow-y-auto pr-1.5 space-y-3">
            {displayedList.map((p, idx) => {
              let val = p.tokens_total;
              if (metric === "requests") val = p.requests;
              else if (metric === "cost") val = p.estimated_cost_usd;

              const share = currentTotal > 0 ? (val / currentTotal) * 100 : 0;
              const color =
                idx < MAX_PRIMARY_SLICES
                  ? COLORS[idx % COLORS.length]
                  : OTHER_COLOR;

              return (
                <div key={p.provider_id} className="space-y-1.5 py-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2 w-3 rounded-xs shrink-0"
                        style={{ background: color }}
                      />
                      <span className="font-normal text-foreground truncate max-w-44 sm:max-w-64">
                        {p.provider_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-xs tabular-nums shrink-0">
                      <span className="text-muted-foreground hidden sm:inline">
                        {p.requests.toLocaleString()} reqs
                      </span>
                      <span className="font-normal text-foreground">
                        {metric === "cost"
                          ? formatCost(p.estimated_cost_usd)
                          : formatNumber(p.tokens_total) + " tokens"}
                      </span>
                      <span className="w-12 text-right text-tertiary">
                        {share.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Relative Share Progress Bar */}
                  <div className="h-1.5 w-full overflow-hidden rounded-sm bg-surface">
                    <div
                      className="h-full rounded-sm transition-all duration-300"
                      style={{
                        width: `${Math.max(1, share)}%`,
                        background: color,
                      }}
                    />
                  </div>
                </div>
              );
            })}

            {/* Other Consolidated Row (When not showing all) */}
            {otherSummary && (
              <div className="space-y-1.5 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-3 rounded-xs shrink-0"
                      style={{ background: OTHER_COLOR }}
                    />
                    <span className="font-normal text-muted-foreground">
                      Other ({otherCount} smaller providers)
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
                    <span className="text-muted-foreground hidden sm:inline">
                      {otherSummary.requests.toLocaleString()} reqs
                    </span>
                    <span className="font-normal text-foreground">
                      {metric === "cost"
                        ? formatCost(otherSummary.cost)
                        : formatNumber(otherSummary.tokens) + " tokens"}
                    </span>
                    <span className="w-12 text-right text-tertiary">
                      {otherSummary.share.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-sm bg-surface">
                  <div
                    className="h-full rounded-sm transition-all duration-300"
                    style={{
                      width: `${Math.max(1, otherSummary.share)}%`,
                      background: OTHER_COLOR,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ChartPanel>
  );
}
