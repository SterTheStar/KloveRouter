import { useCallback, useEffect, useMemo, useState } from "react";
import { RiLoader4Line as LoaderCircle, RiExchangeLine as ExchangeLine, RiNumbersLine as NumbersLine, RiSpeedLine as SpeedLine, RiTimeLine as TimeLine } from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { stats } from "../api/client";
import type { StatsOverview, StatsByProvider, StatsByModel, DailyStats } from "../types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";

const COLORS = ["#5BCEFA", "#F5A9B8", "#FFD700", "#80C080", "#FF8C42", "#A78BFA", "#F472B6", "#34D399"];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return (ms / 1000).toFixed(1) + "s";
  return ms.toFixed(0) + "ms";
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const statCards = [
  { icon: ExchangeLine, title: "Requests", key: "total_requests" as const, format: (v: number) => formatNumber(v) },
  { icon: NumbersLine, title: "Total tokens", key: "total_tokens" as const, format: (v: number) => formatNumber(v) },
  { icon: SpeedLine, title: "Avg tokens/req", key: "avg_tokens_per_request" as const, format: (v: number) => formatNumber(Math.round(v)) },
  { icon: TimeLine, title: "Avg duration", key: "avg_duration_ms" as const, format: (v: number) => formatDuration(v) },
];

export default function StatsPage() {
  const [overview, setOverview] = useState<StatsOverview | null>(null);
  const [byProvider, setByProvider] = useState<StatsByProvider[]>([]);
  const [byModel, setByModel] = useState<StatsByModel[]>([]);
  const [daily, setDaily] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
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

  const daysOptions = [7, 30, 90];

  if (loading) return <div className="flex justify-center p-12"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="w-full space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2"><h1 className="font-heading text-2xl font-semibold tracking-tight">Usage statistics</h1>{refreshing && <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="Refreshing statistics" />}</div>
        <div className="flex gap-1">
          {daysOptions.map((d) => (
            <Button key={d} variant={days === d ? "default" : "outline"} size="sm" onClick={() => setDays(d)}>
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {overview && (
        <div className="grid grid-cols-4 gap-3">
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
        <Card>
          <CardHeader><CardTitle>Daily usage</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                   <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} className="text-muted-foreground" interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <Tooltip />
                  <Line type="monotone" dataKey="tokens_total" stroke="#5BCEFA" strokeWidth={2} name="Tokens" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {byProvider.length > 0 && (
        <Card>
          <CardHeader><CardTitle>By provider</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byProvider}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                   <XAxis dataKey="provider_name" tick={{ fontSize: 12 }} className="text-muted-foreground" interval={0} angle={-20} textAnchor="end" height={55} />
                  <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <Tooltip />
                  <Bar dataKey="tokens_total" name="Tokens" radius={[6, 6, 0, 0]}>
                    {byProvider.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {byProvider.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Token share</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byProvider} dataKey="tokens_total" nameKey="provider_name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {byProvider.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Requests by provider</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byProvider} dataKey="requests" nameKey="provider_name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {byProvider.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
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
