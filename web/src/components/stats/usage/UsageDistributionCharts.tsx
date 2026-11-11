import { useMemo, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
} from "recharts";
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

function ProviderCustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

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

  const totals = useMemo(() => {
    const totalTokens = byProvider.reduce((s, p) => s + p.tokens_total, 0);
    const totalRequests = byProvider.reduce((s, p) => s + p.requests, 0);
    const totalCost = byProvider.reduce((s, p) => s + p.estimated_cost_usd, 0);
    return { totalTokens, totalRequests, totalCost };
  }, [byProvider]);

  const chartData = useMemo(() => {
    return byProvider.map((p, idx) => {
      let value = p.tokens_total;
      if (metric === "requests") value = p.requests;
      else if (metric === "cost") value = p.estimated_cost_usd;

      return {
        name: p.provider_name,
        value,
        color: COLORS[idx % COLORS.length],
        raw: p,
        totalTokens: totals.totalTokens,
        totalRequests: totals.totalRequests,
        totalCost: totals.totalCost,
      };
    }).sort((a, b) => b.value - a.value);
  }, [byProvider, metric, totals]);

  if (!byProvider.length) return null;

  const currentTotal =
    metric === "tokens"
      ? totals.totalTokens
      : metric === "requests"
      ? totals.totalRequests
      : totals.totalCost;

  const centerLabel =
    metric === "tokens" ? "Tokens" : metric === "requests" ? "Requests" : "Spend";

  const centerValue =
    metric === "cost" ? formatCost(currentTotal) : formatNumber(currentTotal);

  return (
    <ChartPanel
      title="Provider distribution & economics"
      description="Comparative token volume, request distribution, and cost contribution per provider"
      action={
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
      }
    >
      <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
        {/* Left Side: Donut Chart with Center Metric */}
        <div className="flex flex-col items-center justify-center lg:col-span-5">
          <div className="relative aspect-square w-48 sm:w-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
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
                  {chartData.map((item) => (
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

        {/* Right Side: Clean, Seamless Provider Breakdown (No nested cards) */}
        <div className="space-y-4 lg:col-span-7">
          {chartData.map((item) => {
            const p = item.raw;
            const share = currentTotal > 0 ? (item.value / currentTotal) * 100 : 0;

            return (
              <div
                key={p.provider_id}
                className="space-y-2 py-1"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-3 rounded-xs shrink-0"
                      style={{ background: item.color }}
                    />
                    <span className="font-normal text-foreground">
                      {p.provider_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
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
                      width: `${Math.max(3, share)}%`,
                      background: item.color,
                    }}
                  />
                </div>

                {/* Sub metrics row */}
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                  <span>{p.requests.toLocaleString()} requests</span>
                  <span>{formatNumber(p.tokens_total)} tokens</span>
                  <span>{formatCost(p.estimated_cost_usd)} total spend</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ChartPanel>
  );
}
