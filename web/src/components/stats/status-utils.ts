export function formatStatusDate(value: string | null): string {
  if (!value) return "—";
  try {
    const iso = value.replace(" ", "T") + (value.includes("Z") ? "" : "Z");
    const d = new Date(iso);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

export function getUptimeTone(value: number): string {
  if (value >= 99) return "text-foreground";
  if (value >= 90) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}
