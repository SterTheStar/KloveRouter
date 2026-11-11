import { cn } from "@/lib/utils";
import type { StatsUptimeGroup } from "@/types";
import {
  formatStatusDate,
  formatPercent,
  formatLatency,
  getUptimeTone,
} from "./status-utils";

interface StatusModelListProps {
  groups: StatsUptimeGroup[];
}

export function StatusModelList({ groups }: StatusModelListProps) {
  if (!groups.length) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>Model routing breakdown</span>
        <span>{groups.length} {groups.length === 1 ? "model" : "models"}</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-background/50">
        <div className="divide-y divide-border">
          {groups.map((group) => (
            <div
              key={`${group.provider_id ?? "unknown"}-${group.model_name}`}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between text-xs hover:bg-accent/30 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <code className="font-mono text-xs font-normal text-foreground break-all">
                  {group.model_name}
                </code>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:gap-6 text-muted-foreground shrink-0">
                <div>
                  <span className="text-tertiary block sm:hidden">Requests</span>
                  <span className="font-mono tabular-nums text-foreground">
                    {group.total_requests.toLocaleString()}
                  </span>
                  <span className="ml-1 text-tertiary hidden sm:inline">reqs</span>
                </div>

                <div>
                  <span className="text-tertiary block sm:hidden">Success</span>
                  <span
                    className={cn(
                      "font-mono tabular-nums",
                      getUptimeTone(group.uptime_percent)
                    )}
                  >
                    {formatPercent(group.uptime_percent)}
                  </span>
                </div>

                <div>
                  <span className="text-tertiary block sm:hidden">P95</span>
                  <span className="font-mono tabular-nums text-foreground">
                    {formatLatency(group.p95_latency_ms)}
                  </span>
                </div>

                <div>
                  <span className="text-tertiary block sm:hidden">Last active</span>
                  <span className="tabular-nums">
                    {formatStatusDate(group.last_used_at)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
