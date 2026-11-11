import { RiLineChartLine } from "@remixicon/react";
import type {
  DailyStats,
  StatsByModel,
  StatsByProvider,
  StatsOverview,
} from "@/types";
import { UsageStatCards } from "./UsageStatCards";
import { UsageDailyChart } from "./UsageDailyChart";
import { UsageDistributionCharts } from "./UsageDistributionCharts";
import { UsageModelTable } from "./UsageModelTable";

interface UsagePanelProps {
  overview: StatsOverview;
  byProvider: StatsByProvider[];
  byModel: StatsByModel[];
  daily: DailyStats[];
}

export function UsagePanel({
  overview,
  byProvider,
  byModel,
  daily,
}: UsagePanelProps) {
  if (overview.total_requests === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
        <RiLineChartLine className="mx-auto size-8 text-tertiary" />
        <h2 className="mt-3 font-heading text-sm font-normal text-foreground">
          No usage data yet
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Token usage, costs and request metrics will appear here after you make requests through the API proxy.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <UsageStatCards overview={overview} />
      <UsageDailyChart daily={daily} />
      <UsageDistributionCharts byProvider={byProvider} />
      <UsageModelTable byModel={byModel} />
    </div>
  );
}
