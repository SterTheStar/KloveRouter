import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  RiLoader4Line as LoaderCircle,
  RiExchangeLine as ExchangeLine,
  RiNumbersLine as NumbersLine,
  RiSpeedLine as SpeedLine,
  RiTimeLine as TimeLine,
} from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { stats } from "../api/client";
import type {
  StatsOverview,
  StatsByProvider,
  StatsByModel,
  DailyStats,
  StatsUptime,
  StatsHealth,
} from "../types";
import { Tabs } from "@/components/ui/tabs";
import { StatusPanel } from "@/components/stats/StatusPanel";
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
  children,
  className = "",
}: {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`overflow-hidden ${className}`}>
      <CardHeader className="border-b bg-muted/20">
        <CardTitle>{title}</CardTitle>
        <div className="text-xs text-muted-foreground">{description}</div>
      </CardHeader>
      <CardContent className="pt-5">{children}</CardContent>
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

const statCards = [
  {
    icon: ExchangeLine,
    title: "Requests",
    key: "total_requests" as const,
    format: (v: number) => formatNumber(v),
  },
  {
    icon: NumbersLine,
    title: "Total tokens",
    key: "total_tokens" as const,
    format: (v: number) => formatNumber(v),
  },
  {
    icon: NumbersLine,
    title: "Cached tokens",
    key: "total_tokens_cache" as const,
    format: (v: number) => formatNumber(v),
  },
  {
    icon: SpeedLine,
    title: "Avg tokens/req",
    key: "avg_tokens_per_request" as const,
    format: (v: number) => formatNumber(Math.round(v)),
  },
  {
    icon: TimeLine,
    title: "Avg duration",
    key: "avg_duration_ms" as const,
    format: (v: number) => formatDuration(v),
  },
  {
    icon: NumbersLine,
    title: "Estimated cost",
    key: "estimated_cost_usd" as const,
    format: (v: number) => formatCost(v),
  },
];

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

  const load = useCallback(async () => {
    try {
      setLoading(true);
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
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        setRefreshing(true);
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
        setError(e.message);
      } finally {
        setRefreshing(false);
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [days]);

  const groupedByProvider = useMemo(() => {
    const groups: Record<string, StatsByModel[]> = {};
    for (const m of byModel) {
      if (!groups[m.provider_name]) groups[m.provider_name] = [];
      groups[m.provider_name].push(m);
    }
    return groups;
  }, [byModel]);

  const daysOptions: { label: string; value: number | null }[] = [
    { label: "7d", value: 7 },
    { label: "30d", value: 30 },
    { label: "90d", value: 90 },
    { label: "Total", value: null },
  ];

  if (loading)
    return (
      <div className="flex justify-center p-12">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="w-full space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Usage statistics
          </h1>
          {refreshing && (
            <LoaderCircle
              className="size-4 animate-spin text-muted-foreground"
              aria-label="Refreshing statistics"
            />
          )}
        </div>
        <div className="flex gap-1">
          {daysOptions.map(({ label, value }) => (
            <Button
              key={label}
              variant={days === value ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs tabs={[{ id: "usage", label: "Usage" }, { id: "status", label: "Status" }]} active={activeTab} onChange={setActiveTab} />
      {activeTab === "status" && uptime && health ? <StatusPanel uptime={uptime} health={health} /> : null}
      {activeTab === "usage" && overview && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {statCards.map(({ icon: Icon, title, key, format }) => (
            <div
              key={key}
              className="flex items-center gap-4 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Icon className="size-9 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{title}</div>
                <div className="mt-0.5 text-2xl font-bold tracking-tight">
                  {format(overview[key])}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "usage" && <>
      {daily.length > 0 && (
        <ChartPanel
          title="Daily usage"
          description="Token volume and estimated cost over the selected period"
          className="min-h-[22rem]"
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
                    <stop offset="0%" stopColor="#5BCEFA" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#5BCEFA" stopOpacity={0} />
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
                  stroke="#5BCEFA"
                  strokeWidth={2.5}
                  fill="url(#tokensGradient)"
                  name="Tokens"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, fill: "var(--popover)" }}
                />
                <Line
                  yAxisId="cost"
                  type="monotone"
                  dataKey="estimated_cost_usd"
                  stroke="#F5A9B8"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, fill: "var(--popover)" }}
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
                      ...byProvider.map((p) => p.provider_name.length * 7.5),
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
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
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
        <Card className="overflow-hidden p-0 gap-0">
          <CardHeader className="flex flex-row items-center justify-between py-(--card-spacing)">
            <CardTitle>By model</CardTitle>
          </CardHeader>
          <Separator />
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="p-3 font-medium">Model</th>
                  <th className="p-3 font-medium">Provider</th>
                  <th className="p-3 font-medium text-right">Requests</th>
                  <th className="p-3 font-medium text-right">Tokens</th>
                  <th className="p-3 font-medium text-right">Cache</th>
                  <th className="p-3 font-medium text-right">Est. cost</th>
                  <th className="p-3 font-medium text-right">Avg duration</th>
                  <th className="p-3 font-medium text-right">TPS</th>
                </tr>
              </thead>
              <tbody>
                {byModel.map((m) => (
                  <tr
                    key={m.model_id}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="p-3 font-mono text-xs">{m.model_name}</td>
                    <td className="p-3">{m.provider_name}</td>
                    <td className="p-3 text-right">
                      {formatNumber(m.requests)}
                    </td>
                    <td className="p-3 text-right">
                      {formatNumber(m.tokens_total)}
                    </td>
                    <td className="p-3 text-right">
                      {formatNumber(m.tokens_cache_read)}
                    </td>
                    <td className="p-3 text-right font-medium">
                      {formatCost(m.estimated_cost_usd)}
                    </td>
                    <td className="p-3 text-right">
                      {formatDuration(m.avg_duration_ms)}
                    </td>
                    <td className="p-3 text-right font-mono text-xs">
                      {m.tps !== null ? m.tps.toFixed(1) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!loading && !error && overview && overview.total_requests === 0 && (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <h2 className="font-heading text-lg font-medium">
            No usage data yet
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Token usage will appear here after you make requests through the API
            proxy.
          </p>
        </div>
      )}
      </>}
    </div>
  );
}