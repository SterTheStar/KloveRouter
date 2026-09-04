import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  RiArrowDownLine as ArrowDown,
  RiArrowUpLine as ArrowUp,
  RiDatabase2Line as DatabaseLine,
  RiExchangeLine as ExchangeLine,
  RiFileList3Line as FileListLine,
  RiLineChartLine as ChartLine,
  RiLoader4Line as LoaderCircle,
  RiMoneyDollarCircleLine as CoinsLine,
  RiNumbersLine as NumbersLine,
  RiRefreshLine as RefreshIcon,
  RiSpeedLine as SpeedLine,
  RiTimeLine as TimeLine,
} from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { StatusPanel } from "@/components/stats/StatusPanel";
import { stats } from "../api/client";
import type {
  StatsOverview,
  StatsByProvider,
  StatsByModel,
  DailyStats,
  StatsUptime,
  StatsHealth,
} from "../types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = [
  "#5BCEFA",
  "#F5A9B8",
  "#FFD700",
  "#80C080",
  "#FF8C42",
  "#A78BFA",
  "#F472B6",
  "#34D399",
];
const TOKENS_COLOR = "#5BCEFA";
const COST_COLOR = "#F5A9B8";
const AXIS = { fontSize: 11, fill: "currentColor" };

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatCost(value: number): string {
  return `$${value.toFixed(value < 0.01 && value > 0 ? 4 : 2)}`;
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return (ms / 1000).toFixed(1) + "s";
  return ms.toFixed(0) + "ms";
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type ChartFormatters = Record<string, (value: number) => string>;

function ChartTooltipContent({
  active,
  payload,
  label,
  formatters,
}: {
  active?: boolean;
  payload?: any[];
  label?: string | number;
  formatters?: ChartFormatters;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter(
    (item) => item.value !== undefined && item.value !== null,
  );
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {label !== undefined && (
        <div className="mb-1.5 border-b border-border/60 pb-1 font-medium">
          {typeof label === "string" && /^\d{4}-\d{2}-\d{2}$/.test(label)
            ? formatDate(label)
            : label}
        </div>
      )}
      <div className="space-y-1">
        {rows.map((item, index) => {
          const key = String(item.dataKey ?? item.name);
          const format = formatters?.[key];
          return (
            <div
              key={`${key}-${index}`}
              className="flex items-center justify-between gap-6"
            >
              <span className="flex items-center gap-1.5 text-muted-foreground">
                {item.color && (
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: item.color }}
                  />
                )}
                {item.name ?? key}
              </span>
              <span className="font-mono font-medium tabular-nums">
                {typeof item.value === "number"
                  ? format
                    ? format(item.value)
                    : item.value.toLocaleString()
                  : item.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChartPanel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

type DonutItem = {
  name: string;
  value: number;
  color: string;
};

function DonutLegend({
  items,
  total,
  format,
}: {
  items: DonutItem[];
  total: number;
  format: (value: number) => string;
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => {
        const share = total > 0 ? (item.value / total) * 100 : 0;
        return (
          <li
            key={item.name}
            className="flex items-center gap-2 text-xs"
            title={item.name}
          >
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: item.color }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {item.name}
            </span>
            <span className="font-mono tabular-nums">{format(item.value)}</span>
            <span className="w-11 text-right font-medium tabular-nums">
              {share.toFixed(0)}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function DonutChart({
  data,
  dataKey,
  nameKey,
  format,
  centerLabel,
}: {
  data: StatsByProvider[];
  dataKey: keyof StatsByProvider;
  nameKey: keyof StatsByProvider;
  format: (value: number) => string;
  centerLabel: string;
}) {
  const items: DonutItem[] = data
    .map((entry, index) => ({
      name: String(entry[nameKey] ?? ""),
      value: Number(entry[dataKey]) || 0,
      color: COLORS[index % COLORS.length],
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!items.length) return null;

  return (
    <div className="flex h-full flex-col gap-5">
      <div className="relative mx-auto aspect-square w-44 sm:w-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="70%"
              outerRadius="100%"
              paddingAngle={2}
              cornerRadius={6}
              strokeWidth={0}
            >
              {items.map((item) => (
                <Cell key={item.name} fill={item.color} />
              ))}
            </Pie>
            <ChartTooltip
              content={<ChartTooltipContent formatters={{ value: format }} />}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {centerLabel}
          </span>
          <span className="font-heading text-xl font-semibold tabular-nums">
            {format(total)}
          </span>
        </div>
      </div>
      <DonutLegend items={items} total={total} format={format} />
    </div>
  );
}

type StatCardData = {
  icon: typeof ExchangeLine;
  title: string;
  value: string;
  sub?: string;
};

function StatCard({ icon: Icon, title, value, sub }: StatCardData) {
  return (
    <Card className="gap-0">
      <CardContent className="flex flex-1 items-center gap-4">
        <Icon className="size-9 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="truncate text-xs text-muted-foreground">{title}</div>
          <div className="mt-0.5 font-heading text-2xl font-semibold tracking-tight tabular-nums">
            {value}
          </div>
          {sub && (
            <div className="truncate text-xs text-muted-foreground">{sub}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TokenBreakdownTooltip({
  prompt,
  completion,
  cache,
  children,
}: {
  prompt: number;
  completion: number;
  cache: number;
  children: ReactNode;
}) {
  const rows = [
    { label: "Input", value: prompt },
    { label: "Output", value: completion },
    { label: "Cached", value: cache },
  ];
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="cursor-help" />}>
        {children}
      </TooltipTrigger>
      <TooltipContent side="top" className="flex-col items-stretch gap-1 py-2">
        <div className="text-[11px] font-medium text-muted-foreground">
          Token breakdown
        </div>
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between gap-6">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-mono font-medium tabular-nums">
              {formatNumber(value)}
            </span>
          </div>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

type ModelSortKey =
  | "model_name"
  | "provider_name"
  | "requests"
  | "tokens_total"
  | "tokens_cache_read"
  | "estimated_cost_usd"
  | "avg_duration_ms"
  | "tps";

function SortTh({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  align = "left",
}: {
  label: string;
  k: ModelSortKey;
  sortKey: ModelSortKey;
  sortDir: "asc" | "desc";
  onSort: (k: ModelSortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === k;
  const icon = active ? (
    sortDir === "asc" ? (
      <ArrowUp className="size-3" />
    ) : (
      <ArrowDown className="size-3" />
    )
  ) : null;
  return (
    <th className="p-3 font-medium whitespace-nowrap">
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn(
          "flex w-full items-center gap-1 transition-colors hover:text-foreground",
          align === "right" ? "justify-end" : "justify-start",
          active && "text-foreground",
        )}
      >
        {align === "right" && icon}
        {label}
        {align === "left" && icon}
      </button>
    </th>
  );
}

export default function StatsPage() {
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [byProvider, setByProvider] = useState<StatsByProvider[]>([]);
  const [byModel, setByModel] = useState<StatsByModel[]>([]);
  const [daily, setDaily] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(30);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("usage");
  const [uptime, setUptime] = useState<StatsUptime | null>(null);
  const [health, setHealth] = useState<StatsHealth | null>(null);
  const [sortKey, setSortKey] = useState<ModelSortKey>("tokens_total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const loadingRef = useRef(false);

  const load = useCallback(async (background = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      if (background) setRefreshing(true);
      else setLoading(true);
      const [ov, bp, bm, dl, uptimeData, healthData] = await Promise.all([
        stats.overview(days),
        stats.byProvider(days),
        stats.byModel(days),
        stats.daily(days),
        stats.uptime(days),
        stats.health(days),
      ]);
      setOverview(ov);
      setByProvider(bp);
      setByModel(bm);
      setDaily(dl);
      setUptime(uptimeData);
      setHealth(healthData);
      setError(null);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const daysOptions: { label: string; value: number | null }[] = [
    { label: "7d", value: 7 },
    { label: "30d", value: 30 },
    { label: "90d", value: 90 },
    { label: "All", value: null },
  ];

  const statCards = useMemo<StatCardData[]>(() => {
    if (!overview) return [];
    const daysWithData = daily.length;
    const cacheShare =
      overview.total_tokens > 0
        ? (overview.total_tokens_cache / overview.total_tokens) * 100
        : 0;
    return [
      {
        icon: ExchangeLine,
        title: "Requests",
        value: formatNumber(overview.total_requests),
        sub:
          daysWithData > 1
            ? `${formatNumber(Math.round(overview.total_requests / daysWithData))} / day avg`
            : undefined,
      },
      {
        icon: NumbersLine,
        title: "Total tokens",
        value: formatNumber(overview.total_tokens),
        sub: `${formatNumber(overview.total_tokens_prompt)} in · ${formatNumber(overview.total_tokens_completion)} out`,
      },
      {
        icon: DatabaseLine,
        title: "Cached tokens",
        value: formatNumber(overview.total_tokens_cache),
        sub: `${cacheShare.toFixed(0)}% of all tokens`,
      },
      {
        icon: FileListLine,
        title: "Avg tokens/req",
        value: formatNumber(Math.round(overview.avg_tokens_per_request)),
      },
      {
        icon: SpeedLine,
        title: "Avg duration",
        value: formatDuration(overview.avg_duration_ms),
      },
      {
        icon: CoinsLine,
        title: "Estimated cost",
        value: formatCost(overview.estimated_cost_usd),
        sub:
          overview.total_requests > 0
            ? `${formatCost(overview.estimated_cost_usd / overview.total_requests)} / request avg`
            : undefined,
      },
    ];
  }, [overview, daily.length]);

  const sortedModels = useMemo(() => {
    const arr = [...byModel];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [byModel, sortKey, sortDir]);

  const modelTotals = useMemo(() => {
    let requests = 0;
    let tokens = 0;
    let prompt = 0;
    let completion = 0;
    let cache = 0;
    let cost = 0;
    let weightedDuration = 0;
    for (const m of byModel) {
      requests += m.requests;
      tokens += m.tokens_total;
      prompt += m.tokens_prompt;
      completion += m.tokens_completion;
      cache += m.tokens_cache_read;
      cost += m.estimated_cost_usd;
      weightedDuration += m.avg_duration_ms * m.requests;
    }
    return {
      requests,
      tokens,
      prompt,
      completion,
      cache,
      cost,
      avgDuration: requests > 0 ? weightedDuration / requests : 0,
    };
  }, [byModel]);

  const handleSort = (k: ModelSortKey) => {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "model_name" || k === "provider_name" ? "asc" : "desc");
    }
  };

  if (loading)
    return (
      <div className="flex justify-center p-12">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="w-full space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {activeTab === "status" ? "Provider status" : "Usage statistics"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeTab === "status"
              ? "Availability, latency and routing health across your providers."
              : "Token usage, cost and performance across your providers."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg bg-muted p-0.5">
            {daysOptions.map(({ label, value }) => (
              <button
                key={label}
                onClick={() => setDays(value)}
                className={cn(
                  "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                  days === value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(true)}
            disabled={refreshing}
          >
            {refreshing ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <RefreshIcon className="size-3.5" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs
        tabs={[
          { id: "usage", label: "Usage" },
          { id: "status", label: "Status" },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "status" && uptime && health ? (
        <StatusPanel uptime={uptime} health={health} />
      ) : null}

      {activeTab === "usage" && overview && (
        <>
          {overview.total_requests === 0 ? (
            <div className="rounded-xl border border-dashed p-12 text-center">
              <ChartLine className="mx-auto size-8 text-muted-foreground/60" />
              <h2 className="mt-3 font-heading text-lg font-medium">
                No usage data yet
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Token usage will appear here after you make requests through the
                API proxy.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {statCards.map(({ icon: Icon, title, value, sub }) => (
                  <StatCard
                    key={title}
                    icon={Icon}
                    title={title}
                    value={value}
                    sub={sub}
                  />
                ))}
              </div>

              {daily.length > 0 && (
                <ChartPanel
                  title="Daily usage"
                  description="Token volume and estimated cost per day"
                  className="min-h-[22rem]"
                  action={
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-2 rounded-full"
                          style={{ background: TOKENS_COLOR }}
                        />
                        Tokens
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="size-2 rounded-full"
                          style={{ background: COST_COLOR }}
                        />
                        Est. cost
                      </span>
                    </div>
                  }
                >
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={daily}
                        margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="tokensGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor={TOKENS_COLOR}
                              stopOpacity={0.35}
                            />
                            <stop
                              offset="100%"
                              stopColor={TOKENS_COLOR}
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          vertical={false}
                          strokeDasharray="4 4"
                          className="stroke-border/60"
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
                          yAxisId="cost"
                          orientation="right"
                          tick={AXIS}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={formatCost}
                          width={52}
                        />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatters={{
                                tokens_total: formatNumber,
                                estimated_cost_usd: formatCost,
                              }}
                            />
                          }
                        />
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
                        <Line
                          yAxisId="cost"
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
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </ChartPanel>
              )}

              {byProvider.length > 0 && (
                <ChartPanel
                  title="By provider"
                  description="Token volume grouped by provider"
                >
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={byProvider}
                        layout="vertical"
                        margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                      >
                        <CartesianGrid
                          horizontal={false}
                          strokeDasharray="4 4"
                          className="stroke-border/60"
                        />
                        <XAxis
                          type="number"
                          tick={AXIS}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={formatNumber}
                        />
                        <YAxis
                          type="category"
                          dataKey="provider_name"
                          tick={AXIS}
                          axisLine={false}
                          tickLine={false}
                          width={Math.min(
                            150,
                            Math.max(
                              72,
                              ...byProvider.map(
                                (p) => p.provider_name.length * 7.5,
                              ),
                            ),
                          )}
                          tickFormatter={(value: string) =>
                            value.length > 18 ? `${value.slice(0, 17)}…` : value
                          }
                        />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatters={{ tokens_total: formatNumber }}
                            />
                          }
                          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                        />
                        <Bar
                          dataKey="tokens_total"
                          name="Tokens"
                          radius={[0, 6, 6, 0]}
                          maxBarSize={26}
                        >
                          {byProvider.map((_, index) => (
                            <Cell
                              key={index}
                              fill={COLORS[index % COLORS.length]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartPanel>
              )}

              {byProvider.length > 0 && (
                <div className="grid gap-6 md:grid-cols-2">
                  <ChartPanel
                    title="Token share"
                    description="Share of total tokens by provider"
                  >
                    <div className="min-h-80">
                      <DonutChart
                        data={byProvider}
                        dataKey="tokens_total"
                        nameKey="provider_name"
                        format={formatNumber}
                        centerLabel="Tokens"
                      />
                    </div>
                  </ChartPanel>

                  <ChartPanel
                    title="Requests by provider"
                    description="Request distribution by provider"
                  >
                    <div className="min-h-80">
                      <DonutChart
                        data={byProvider}
                        dataKey="requests"
                        nameKey="provider_name"
                        format={formatNumber}
                        centerLabel="Requests"
                      />
                    </div>
                  </ChartPanel>
                </div>
              )}

              {byModel.length > 0 && (
                <Card className="gap-0 overflow-hidden p-0">
                  <CardHeader className="py-(--card-spacing)">
                    <CardTitle>By model</CardTitle>
                    <CardAction>
                      <span className="text-xs text-muted-foreground">
                        {byModel.length} models
                      </span>
                    </CardAction>
                  </CardHeader>
                  <div className="max-h-[30rem] overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-y bg-muted/30 text-left text-xs text-muted-foreground">
                          <SortTh
                            label="Model"
                            k="model_name"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                          />
                          <SortTh
                            label="Provider"
                            k="provider_name"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                          />
                          <SortTh
                            label="Requests"
                            k="requests"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                            align="right"
                          />
                          <SortTh
                            label="Tokens"
                            k="tokens_total"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                            align="right"
                          />
                          <SortTh
                            label="Cache"
                            k="tokens_cache_read"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                            align="right"
                          />
                          <SortTh
                            label="Est. cost"
                            k="estimated_cost_usd"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                            align="right"
                          />
                          <SortTh
                            label="Avg duration"
                            k="avg_duration_ms"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                            align="right"
                          />
                          <SortTh
                            label="TPS"
                            k="tps"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                            align="right"
                          />
                        </tr>
                      </thead>
                      <tbody>
                        {sortedModels.map((m) => (
                          <tr
                            key={m.model_id}
                            className="border-b last:border-0 hover:bg-muted/30"
                          >
                            <td
                              className="max-w-56 truncate p-3 font-mono text-xs"
                              title={m.model_name}
                            >
                              {m.model_name}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {m.provider_name}
                            </td>
                            <td className="p-3 text-right tabular-nums">
                              {formatNumber(m.requests)}
                            </td>
                            <td className="p-3 text-right tabular-nums">
                              <TokenBreakdownTooltip
                                prompt={m.tokens_prompt}
                                completion={m.tokens_completion}
                                cache={m.tokens_cache_read}
                              >
                                {formatNumber(m.tokens_total)}
                              </TokenBreakdownTooltip>
                            </td>
                            <td
                              className="p-3 text-right tabular-nums text-muted-foreground"
                              title={
                                m.tokens_total > 0
                                  ? `${((m.tokens_cache_read / m.tokens_total) * 100).toFixed(0)}% cached`
                                  : undefined
                              }
                            >
                              {formatNumber(m.tokens_cache_read)}
                            </td>
                            <td className="p-3 text-right font-medium tabular-nums">
                              {formatCost(m.estimated_cost_usd)}
                            </td>
                            <td className="p-3 text-right tabular-nums">
                              {formatDuration(m.avg_duration_ms)}
                            </td>
                            <td className="p-3 text-right font-mono text-xs tabular-nums">
                              {m.tps !== null ? m.tps.toFixed(1) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/30 text-xs font-medium">
                          <td className="p-3" colSpan={2}>
                            Total · {byModel.length} models
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {formatNumber(modelTotals.requests)}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            <TokenBreakdownTooltip
                              prompt={modelTotals.prompt}
                              completion={modelTotals.completion}
                              cache={modelTotals.cache}
                            >
                              {formatNumber(modelTotals.tokens)}
                            </TokenBreakdownTooltip>
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {formatNumber(modelTotals.cache)}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {formatCost(modelTotals.cost)}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {formatDuration(modelTotals.avgDuration)}
                          </td>
                          <td className="p-3 text-right">—</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
