import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import type { DailyStats } from "@/types";
import {
  TOKENS_COLOR,
  COST_COLOR,
  AXIS,
  formatNumber,
  formatCost,
  formatDate,
  ChartPanel,
} from "./usage-utils";

interface UsageDailyChartProps {
  daily: DailyStats[];
}

const REQUESTS_COLOR = "#8b5cf6";

function DailyCustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data: DailyStats | undefined = payload[0]?.payload;
  if (!data) return null;

  const promptPercent =
    data.tokens_total > 0 && data.tokens_prompt
      ? ((data.tokens_prompt / data.tokens_total) * 100).toFixed(0)
      : null;
  const compPercent =
    data.tokens_total > 0 && data.tokens_completion
      ? ((data.tokens_completion / data.tokens_total) * 100).toFixed(0)
      : null;
  const cacheHitPercent =
    data.tokens_prompt && data.tokens_cache_read && data.tokens_prompt > 0
      ? ((data.tokens_cache_read / data.tokens_prompt) * 100).toFixed(0)
      : null;
  const avgTokensPerReq =
    data.requests > 0 ? Math.round(data.tokens_total / data.requests) : 0;

  return (
    <div className="min-w-64 rounded-xl border border-border bg-popover/95 p-3.5 text-xs text-popover-foreground shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-border/80 pb-2">
        <span className="font-normal text-foreground">{formatDate(data.date)}</span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {data.requests.toLocaleString()} {data.requests === 1 ? "request" : "requests"}
        </span>
      </div>

      <div className="mt-2.5 space-y-2">
        {/* Total Tokens */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="h-1.5 w-3 rounded-xs shrink-0"
              style={{ background: TOKENS_COLOR }}
            />
            Total volume
          </span>
          <span className="font-mono font-normal text-foreground tabular-nums">
            {formatNumber(data.tokens_total)} tokens
          </span>
        </div>

        {/* Prompt / Completion Breakdown */}
        {data.tokens_prompt !== undefined && data.tokens_completion !== undefined && (
          <div className="rounded-lg bg-background/60 p-2 space-y-1 text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Prompt:</span>
              <span className="font-mono text-foreground tabular-nums">
                {formatNumber(data.tokens_prompt)} {promptPercent ? `(${promptPercent}%)` : ""}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Completion:</span>
              <span className="font-mono text-foreground tabular-nums">
                {formatNumber(data.tokens_completion)} {compPercent ? `(${compPercent}%)` : ""}
              </span>
            </div>
            {data.tokens_cache_read !== undefined && data.tokens_cache_read > 0 && (
              <div className="flex items-center justify-between pt-1 border-t border-border/50 text-emerald-600 dark:text-emerald-400">
                <span>Cache hit:</span>
                <span className="font-mono tabular-nums">
                  {formatNumber(data.tokens_cache_read)} {cacheHitPercent ? `(${cacheHitPercent}%)` : ""}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Estimated Cost & Averages */}
        <div className="flex items-center justify-between pt-1 border-t border-border/60">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="h-1.5 w-3 rounded-xs shrink-0"
              style={{ background: COST_COLOR }}
            />
            Estimated spend
          </span>
          <span className="font-mono font-normal text-foreground tabular-nums">
            {formatCost(data.estimated_cost_usd)}
          </span>
        </div>

        <div className="flex items-center justify-between text-muted-foreground">
          <span>Average per request</span>
          <span className="font-mono tabular-nums">
            {formatNumber(avgTokensPerReq)} tokens
          </span>
        </div>
      </div>
    </div>
  );
}

export function UsageDailyChart({ daily }: UsageDailyChartProps) {
  const [metricMode, setMetricMode] = useState<"tokens_cost" | "requests_tokens">(
    "tokens_cost"
  );

  if (!daily.length) return null;

  return (
    <ChartPanel
      title="Daily activity & trends"
      description="Token throughput, request volume, and estimated spend over time"
      className="min-h-[22rem]"
      action={
        <div className="flex flex-wrap items-center gap-3">
          {/* Mode Switcher */}
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
            <button
              onClick={() => setMetricMode("tokens_cost")}
              className={`h-6 rounded-md px-2 text-xs font-normal transition-colors ${
                metricMode === "tokens_cost"
                  ? "bg-card text-foreground"
                  : "text-tertiary hover:text-foreground"
              }`}
            >
              Tokens & cost
            </button>
            <button
              onClick={() => setMetricMode("requests_tokens")}
              className={`h-6 rounded-md px-2 text-xs font-normal transition-colors ${
                metricMode === "requests_tokens"
                  ? "bg-card text-foreground"
                  : "text-tertiary hover:text-foreground"
              }`}
            >
              Requests & tokens
            </button>
          </div>

          {/* Clean Legend */}
          <div className="flex items-center gap-3 text-xs text-tertiary">
            <span className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-3 rounded-xs shrink-0"
                style={{ background: TOKENS_COLOR }}
              />
              Tokens
            </span>
            {metricMode === "tokens_cost" ? (
              <span className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-3 rounded-xs shrink-0"
                  style={{ background: COST_COLOR }}
                />
                Est. cost
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-3 rounded-xs shrink-0"
                  style={{ background: REQUESTS_COLOR }}
                />
                Requests
              </span>
            )}
          </div>
        </div>
      }
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={daily} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="tokensGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TOKENS_COLOR} stopOpacity={0.35} />
                <stop offset="100%" stopColor={TOKENS_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              strokeDasharray="4 4"
              className="stroke-border"
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={AXIS}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              yAxisId="tokens"
              tick={AXIS}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatNumber}
              width={48}
            />
            <YAxis
              yAxisId="secondary"
              orientation="right"
              tick={AXIS}
              axisLine={false}
              tickLine={false}
              tickFormatter={
                metricMode === "tokens_cost" ? formatCost : formatNumber
              }
              width={52}
            />

            <ChartTooltip content={<DailyCustomTooltip />} />

            <Area
              yAxisId="tokens"
              type="monotone"
              dataKey="tokens_total"
              stroke={TOKENS_COLOR}
              strokeWidth={2.5}
              fill="url(#tokensGradient)"
              name="Tokens"
              dot={false}
              activeDot={{
                r: 4,
                strokeWidth: 2,
                fill: "var(--popover)",
              }}
            />

            {metricMode === "tokens_cost" ? (
              <Line
                yAxisId="secondary"
                type="monotone"
                dataKey="estimated_cost_usd"
                stroke={COST_COLOR}
                strokeWidth={2}
                dot={false}
                activeDot={{
                  r: 4,
                  strokeWidth: 2,
                  fill: "var(--popover)",
                }}
                name="Est. cost"
              />
            ) : (
              <Line
                yAxisId="secondary"
                type="monotone"
                dataKey="requests"
                stroke={REQUESTS_COLOR}
                strokeWidth={2}
                dot={false}
                activeDot={{
                  r: 4,
                  strokeWidth: 2,
                  fill: "var(--popover)",
                }}
                name="Requests"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartPanel>
  );
}
