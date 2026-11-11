import { useCallback, useEffect, useRef, useState } from "react";
import {
  RiLoader4Line as LoaderCircle,
  RiRefreshLine as RefreshIcon,
} from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { StatusPanel } from "@/components/stats/StatusPanel";
import { UsagePanel } from "@/components/stats/usage/UsagePanel";
import { stats } from "../api/client";
import type {
  DailyStats,
  StatsByModel,
  StatsByProvider,
  StatsHealth,
  StatsOverview,
  StatsUptime,
} from "../types";

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

  if (loading)
    return (
      <div className="flex justify-center p-12">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="w-full space-y-6 p-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-normal tracking-tight text-foreground">
            {activeTab === "status" ? "Provider status" : "Usage statistics"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeTab === "status"
              ? "Request outcomes for the selected period"
              : "Token usage, cost and performance across your providers"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
            {daysOptions.map(({ label, value }) => (
              <button
                key={label}
                onClick={() => setDays(value)}
                className={cn(
                  "h-7 rounded-md px-2.5 text-xs font-normal transition-colors",
                  days === value
                    ? "bg-card text-foreground"
                    : "text-tertiary hover:text-foreground"
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
            <RefreshIcon className={cn("size-3.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: "usage", label: "Usage" },
          { id: "status", label: "Status" },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* Tab Panels */}
      {activeTab === "status" && uptime && health ? (
        <StatusPanel uptime={uptime} health={health} />
      ) : null}

      {activeTab === "usage" && overview ? (
        <UsagePanel
          overview={overview}
          byProvider={byProvider}
          byModel={byModel}
          daily={daily}
        />
      ) : null}
    </div>
  );
}
