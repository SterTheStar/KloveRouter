import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { RiLoader4Line as LoaderCircle, RiExchangeLine as ExchangeLine, RiNumbersLine as NumbersLine, RiSpeedLine as SpeedLine, RiTimeLine as TimeLine } from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { stats } from "../api/client";
import type { StatsOverview, StatsByProvider, StatsByModel, DailyStats } from "../types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#5BCEFA", "#F5A9B8", "#FFD700", "#80C080", "#FF8C42", "#A78BFA", "#F472B6", "#34D399"];
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
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ChartTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
    {label !== undefined && <div className="mb-1 font-medium">{typeof label === "string" && /^\d{4}-\d{2}-\d{2}$/.test(label) ? formatDate(label) : label}</div>}
    <div className="space-y-1">{payload.map((item: any, index: number) => <div key={`${item.dataKey ?? item.name}-${index}`} className="flex items-center justify-between gap-5"><span className="text-muted-foreground">{item.name ?? item.dataKey}</span><span className="font-mono font-medium">{typeof item.value === "number" ? item.value.toLocaleString() : item.value}</span></div>)}</div>
  </div>;
}

function ChartPanel({ title, description, children, className = "" }: { title: string; description: string; children: ReactNode; className?: string }) {
  return <Card className={`overflow-hidden ${className}`}><CardHeader className="border-b bg-muted/20"><CardTitle>{title}</CardTitle><div className="text-xs text-muted-foreground">{description}</div></CardHeader><CardContent className="pt-5">{children}</CardContent></Card>;
}

const statCards = [
  { icon: ExchangeLine, title: "Requests", key: "total_requests" as const, format: (v: number) => formatNumber(v) },
  { icon: NumbersLine, title: "Total tokens", key: "total_tokens" as const, format: (v: number) => formatNumber(v) },
  { icon: NumbersLine, title: "Cached tokens", key: "total_tokens_cache" as const, format: (v: number) => formatNumber(v) },
  { icon: SpeedLine, title: "Avg tokens/req", key: "avg_tokens_per_request" as const, format: (v: number) => formatNumber(Math.round(v)) },
  { icon: TimeLine, title: "Avg duration", key: "avg_duration_ms" as const, format: (v: number) => formatDuration(v) },
  { icon: NumbersLine, title: "Estimated cost", key: "estimated_cost_usd" as const, format: (v: number) => formatCost(v) },
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

  const load = useCallback(async () => {
    try {
       setLoading(true);
      const [ov, bp, bm, dl] = await Promise.all([
        stats.overview(days),
        stats.byProvider(days),
        stats.byModel(days),
        stats.daily(days),
      ]);
      setOverview(ov);
      setByProvider(bp);
      setByModel(bm);
      setDaily(dl);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        setRefreshing(true);
        const [ov, bp, bm, dl] = await Promise.all([
          stats.overview(days),
          stats.byProvider(days),
          stats.byModel(days),
          stats.daily(days),
        ]);
        setOverview(ov);
        setByProvider(bp);
        setByModel(bm);
        setDaily(dl);
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

  const daysOptions: { label: string; value: number | null }[] = [{ label: "7d", value: 7 }, { label: "30d", value: 30 }, { label: "90d", value: 90 }, { label: "Total", value: null }];

  if (loading) return <div className="flex justify-center p-12"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="w-full space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2"><h1 className="font-heading text-2xl font-semibold tracking-tight">Usage statistics</h1>{refreshing && <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="Refreshing statistics" />}</div>
        <div className="flex gap-1">
           {daysOptions.map(({ label, value }) => (
             <Button key={label} variant={days === value ? "default" : "outline"} size="sm" onClick={() => setDays(value)}>
               {label}
            </Button>
          ))}
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {overview && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {statCards.map(({ icon: Icon, title, key, format }) => (
            <div key={key} className="flex items-center gap-4 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Icon className="size-9 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{title}</div>
                <div className="mt-0.5 text-2xl font-bold tracking-tight">{format(overview[key])}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {daily.length > 0 && (
        <ChartPanel title="Daily usage" description="Token volume over the selected period" className="min-h-[22rem]">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs><linearGradient id="tokensGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5BCEFA" stopOpacity={0.35} /><stop offset="100%" stopColor="#5BCEFA" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" className="stroke-border/60" />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={formatNumber} width={48} />
                   <ChartTooltip content={<ChartTooltipContent />} />
                  <Area type="monotone" dataKey="tokens_total" stroke="#5BCEFA" strokeWidth={2.5} fill="url(#tokensGradient)" name="Tokens" dot={false} activeDot={{ r: 4, strokeWidth: 2, fill: "var(--popover)" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
        </ChartPanel>
      )}

      {byProvider.length > 0 && (
        <ChartPanel title="By provider" description="Token volume grouped by provider">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byProvider} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}>
                  <CartesianGrid vertical={false} strokeDasharray="4 4" className="stroke-border/60" />
                   <XAxis dataKey="provider_name" tick={AXIS} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={55} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={formatNumber} width={48} />
                   <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="tokens_total" name="Tokens" radius={[8, 8, 2, 2]} maxBarSize={56}>
                    {byProvider.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
        </ChartPanel>
      )}

      {byProvider.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          <ChartPanel title="Token share" description="Share of total tokens by provider">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byProvider} dataKey="tokens_total" nameKey="provider_name" cx="50%" cy="50%" innerRadius={56} outerRadius={88} paddingAngle={3} stroke="var(--card)" strokeWidth={3} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {byProvider.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                     <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
          </ChartPanel>

          <ChartPanel title="Requests by provider" description="Request distribution by provider">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byProvider} dataKey="requests" nameKey="provider_name" cx="50%" cy="50%" innerRadius={56} outerRadius={88} paddingAngle={3} stroke="var(--card)" strokeWidth={3} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {byProvider.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                     <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ResponsiveContainer>
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
                  <tr key={m.model_id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">{m.model_name}</td>
                    <td className="p-3">{m.provider_name}</td>
                    <td className="p-3 text-right">{formatNumber(m.requests)}</td>
                    <td className="p-3 text-right">{formatNumber(m.tokens_total)}</td>
                    <td className="p-3 text-right">{formatNumber(m.tokens_cache_read)}</td>
                    <td className="p-3 text-right font-medium">{formatCost(m.estimated_cost_usd)}</td>
                    <td className="p-3 text-right">{formatDuration(m.avg_duration_ms)}</td>
                    <td className="p-3 text-right font-mono text-xs">{m.tps !== null ? m.tps.toFixed(1) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!loading && !error && overview && overview.total_requests === 0 && (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <h2 className="font-heading text-lg font-medium">No usage data yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Token usage will appear here after you make requests through the API proxy.</p>
        </div>
      )}
    </div>
  );
}
