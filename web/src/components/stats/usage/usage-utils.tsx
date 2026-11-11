import type { ReactNode } from "react";

export const TOKENS_COLOR = "#0ea5e9";
export const COST_COLOR = "#10b981";

export const COLORS = [
  "#0ea5e9",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#ec4899",
  "#6366f1",
  "#14b8a6",
  "#f97316",
];

export const AXIS = {
  fontSize: 11,
  fill: "var(--muted-foreground)",
};

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "0";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

export function formatCost(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "$0.00";
  return `$${value.toFixed(value < 0.01 && value > 0 ? 4 : 2)}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "0ms";
  if (ms >= 1000) return (ms / 1000).toFixed(1) + "s";
  return ms.toFixed(0) + "ms";
}

export function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export type ChartFormatters = Record<string, (value: number) => string>;

export function ChartTooltipContent({
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
    (item) => item.value !== undefined && item.value !== null
  );
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {label !== undefined && (
        <div className="mb-1.5 border-b border-border pb-1 font-normal">
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
                    className="h-1.5 w-3 rounded-xs shrink-0"
                    style={{ background: item.color }}
                  />
                )}
                {item.name ?? key}
              </span>
              <span className="font-mono tabular-nums font-normal">
                {format ? format(item.value) : item.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChartPanel({
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
    <div className={`overflow-hidden rounded-xl border border-border bg-card shadow-none ${className}`}>
      <div className="flex flex-col gap-1 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-normal tracking-tight text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
