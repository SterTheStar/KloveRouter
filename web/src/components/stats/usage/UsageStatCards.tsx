import {
  RiPulseLine,
  RiSwapLine,
  RiHardDrive2Line,
  RiMoneyDollarCircleLine,
  RiVipCrownLine,
  RiTimeLine,
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
  const paygRequests = overview.requests_pay_as_you_go ?? totalRequests;
  const avgCostPerPaygReq =
    paygRequests > 0
      ? (overview.estimated_cost_usd ?? 0) / paygRequests
      : 0;

  const subTokens = overview.tokens_subscription ?? 0;
  const subPercent =
    overview.total_tokens > 0
      ? ((subTokens / overview.total_tokens) * 100).toFixed(0)
      : "0";

  const statCards = [
    {
      icon: RiPulseLine,
      title: "Total requests",
      value: (overview.total_requests ?? 0).toLocaleString(),
      sub: overview.requests_subscription !== undefined && overview.requests_subscription > 0
        ? `${overview.requests_subscription.toLocaleString()} sub · ${(overview.requests_pay_as_you_go ?? 0).toLocaleString()} payg`
        : `${formatDuration(overview.avg_duration_ms)} avg latency`,
    },
    {
      icon: RiSwapLine,
      title: "Total tokens",
      value: formatNumber(overview.total_tokens),
      sub: `${formatNumber(overview.avg_tokens_per_request)} per request`,
    },
    {
      icon: RiVipCrownLine,
      title: "Subscription tokens",
      value: formatNumber(subTokens),
      sub: `${subPercent}% of tokens · $0 direct API`,
    },
    {
      icon: RiMoneyDollarCircleLine,
      title: "Pay-as-you-go spend",
      value: formatCost(overview.estimated_cost_usd),
      sub: `${formatCost(avgCostPerPaygReq)} direct avg / req`,
    },
    {
      icon: RiHardDrive2Line,
      title: "Cache read tokens",
      value: formatNumber(cacheTokens),
      sub: `${cachePercent}% prompt hit rate`,
    },
    {
      icon: RiTimeLine,
      title: "Avg latency",
      value: formatDuration(overview.avg_duration_ms),
      sub: `${formatNumber(promptTokens)} in · ${formatNumber(overview.total_tokens_completion)} out`,
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
