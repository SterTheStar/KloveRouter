import { useMemo, useState } from "react";
import {
  RiSearchLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiHistoryLine,
  RiFilter3Line,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { StatsHealth, StatsUptime, StatsUptimeGroup } from "@/types";
import { StatusSummaryCards } from "./StatusSummaryCards";
import { StatusProviderCard } from "./StatusProviderCard";
import { StatusModelList } from "./StatusModelList";

interface StatusPanelProps {
  uptime: StatsUptime;
  health: StatsHealth;
}

type StatusFilter = "all" | "online" | "degraded" | "offline";

export function StatusPanel({ uptime, health }: StatusPanelProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [historicalOpen, setHistoricalOpen] = useState(false);

  // Group uptime records by provider_id
  const groupsByProvider = useMemo(() => {
    const map = new Map<string, StatsUptimeGroup[]>();
    for (const group of uptime.groups) {
      if (group.provider_id) {
        const existing = map.get(group.provider_id) ?? [];
        map.set(group.provider_id, [...existing, group]);
      }
    }
    return map;
  }, [uptime.groups]);

  // Historical or unknown provider requests
  const knownProviderIds = useMemo(
    () => new Set(health.providers.map((p) => p.provider_id)),
    [health.providers]
  );

  const historical = useMemo(
    () =>
      uptime.groups.filter(
        (group) => !group.provider_id || !knownProviderIds.has(group.provider_id)
      ),
    [uptime.groups, knownProviderIds]
  );

  // Filter providers
  const filteredProviders = useMemo(() => {
    return health.providers.filter((provider) => {
      // Status filter
      if (statusFilter !== "all" && provider.status !== statusFilter) {
        return false;
      }
      // Search filter
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesName = provider.provider_name.toLowerCase().includes(query);
        const matchesId = provider.provider_id.toLowerCase().includes(query);
        const providerGroups = groupsByProvider.get(provider.provider_id) ?? [];
        const matchesModel = providerGroups.some((g) =>
          g.model_name.toLowerCase().includes(query)
        );
        return matchesName || matchesId || matchesModel;
      }
      return true;
    });
  }, [health.providers, statusFilter, search, groupsByProvider]);

  // Status counts for filter chips
  const counts = useMemo(() => {
    let online = 0;
    let degraded = 0;
    let offline = 0;
    for (const p of health.providers) {
      if (p.status === "online") online++;
      else if (p.status === "degraded") degraded++;
      else if (p.status === "offline") offline++;
    }
    return { all: health.providers.length, online, degraded, offline };
  }, [health.providers]);

  return (
    <div className="space-y-6">
      {/* Top summary metrics */}
      <StatusSummaryCards
        summary={uptime.summary}
        providers={health.providers}
      />

      {/* Provider Controls and Filtering */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-normal tracking-tight text-foreground">
              Provider status
            </h2>
            <p className="text-xs text-muted-foreground">
              {filteredProviders.length} of {health.providers.length} providers shown
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative w-full sm:w-60">
              <RiSearchLine className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search provider or model..."
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant={statusFilter === "all" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("all")}
            className="h-7 px-2.5 text-xs font-normal"
          >
            All ({counts.all})
          </Button>

          <Button
            variant={statusFilter === "online" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("online")}
            className={cn(
              "h-7 px-2.5 text-xs font-normal",
              statusFilter === "online"
                ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                : ""
            )}
          >
            Online ({counts.online})
          </Button>

          <Button
            variant={statusFilter === "degraded" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("degraded")}
            className={cn(
              "h-7 px-2.5 text-xs font-normal",
              statusFilter === "degraded"
                ? "border-amber-500/30 text-amber-800 dark:text-amber-400"
                : ""
            )}
          >
            Degraded ({counts.degraded})
          </Button>

          <Button
            variant={statusFilter === "offline" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("offline")}
            className={cn(
              "h-7 px-2.5 text-xs font-normal",
              statusFilter === "offline"
                ? "border-destructive/30 text-destructive"
                : ""
            )}
          >
            Offline ({counts.offline})
          </Button>

          {(search || statusFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
              className="h-7 px-2 text-xs text-tertiary hover:text-foreground"
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Provider List */}
      <div className="space-y-3">
        {filteredProviders.map((provider) => (
          <StatusProviderCard
            key={provider.provider_id}
            provider={provider}
            groups={groupsByProvider.get(provider.provider_id) ?? []}
          />
        ))}

        {filteredProviders.length === 0 && health.providers.length > 0 && (
          <Card className="border border-dashed border-border bg-card/40 shadow-none">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <RiFilter3Line className="size-6 text-tertiary" />
              <p className="mt-2 text-sm font-normal text-foreground">
                No providers match your filter
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try searching with a different term or clear the active status filter.
              </p>
            </CardContent>
          </Card>
        )}

        {health.providers.length === 0 && uptime.groups.length === 0 && (
          <Card className="border border-dashed border-border bg-card/40 shadow-none">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm font-normal text-foreground">
                No requests in this period
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Provider health and response metrics will appear here after your first routed request.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Historical / Unknown Providers Section */}
      {historical.length > 0 && (
        <Card className="border border-border bg-card shadow-none">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setHistoricalOpen((prev) => !prev)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setHistoricalOpen((prev) => !prev);
              }
            }}
            className="flex cursor-pointer select-none items-center justify-between p-4 hover:bg-accent/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <RiHistoryLine className="size-4 text-tertiary" />
              <span className="text-sm font-normal text-foreground">
                Historical or unknown providers
              </span>
              <span className="text-xs text-muted-foreground">
                ({historical.length} records)
              </span>
            </div>

            <div className="text-tertiary">
              {historicalOpen ? (
                <RiArrowDownSLine className="size-4" />
              ) : (
                <RiArrowRightSLine className="size-4" />
              )}
            </div>
          </div>

          {historicalOpen && (
            <CardContent className="border-t border-border bg-card/40 p-4">
              <StatusModelList groups={historical} />
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
