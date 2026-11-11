import {
  RiPulseLine,
  RiSwapLine,
  RiFileTextLine,
  RiSparklingLine,
  RiHardDrive2Line,
  RiMoneyDollarCircleLine,
} from "@remixicon/react";
import type { StatsOverview } from "@/types";
import { formatNumber, formatCost, formatDuration } from "./usage-utils";

interface UsageStatCardsProps {
  overview: StatsOverview;
}

export function UsageStatCards({ overview }: UsageStatCardsProps) {
  const cacheTokens = overview.total_tokens_cache ?? (overview as any).tokens_cache_read ?? 0;
  const promptTokens = overview.total_tokens_prompt ?? 0;
  const cachePercent =
    promptTokens > 0
      ? ((cacheTokens / promptTokens) * 100).toFixed(1)
      : "0";

  const totalRequests = overview.total_requests ?? 0;
  const avgCostPerReq =
    totalRequests > 0
      ? (overview.estimated_cost_usd ?? 0) / totalRequests
      : 0;

  const statCards = [
    {
      icon: RiPulseLine,
      title: "Total requests",
      value: (overview.total_requests ?? 0).toLocaleString(),
      sub: `${formatDuration(overview.avg_duration_ms)} avg latency`,
    },
    {
      icon: RiSwapLine,
      title: "Total tokens",
      value: formatNumber(overview.total_tokens),
      sub: `${formatNumber(overview.avg_tokens_per_request)} per request`,
    },
    {
      icon: RiFileTextLine,
      title: "Prompt tokens",
      value: formatNumber(overview.total_tokens_prompt),
      sub: `${overview.total_tokens > 0 ? (((overview.total_tokens_prompt ?? 0) / overview.total_tokens) * 100).toFixed(0) : 0}% of volume`,
    },
    {
      icon: RiSparklingLine,
      title: "Completion tokens",
      value: formatNumber(overview.total_tokens_completion),
      sub: `${overview.total_tokens > 0 ? (((overview.total_tokens_completion ?? 0) / overview.total_tokens) * 100).toFixed(0) : 0}% of volume`,
    },
    {
      icon: RiHardDrive2Line,
      title: "Cache read tokens",
      value: formatNumber(cacheTokens),
      sub: `${cachePercent}% prompt hit rate`,
    },
    {
      icon: RiMoneyDollarCircleLine,
      title: "Estimated cost",
      value: formatCost(overview.estimated_cost_usd),
      sub: `${formatCost(avgCostPerReq)} avg / req`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {statCards.map(({ icon: Icon, title, value, sub }) => (
        <div
          key={title}
          className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-none"
        >
          <div className="flex items-center justify-between text-tertiary">
            <span className="truncate text-xs font-normal">{title}</span>
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-normal tabular-nums text-foreground">
            {value}
          </div>
          {sub && (
            <div className="mt-1 truncate text-xs text-muted-foreground">{sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}
