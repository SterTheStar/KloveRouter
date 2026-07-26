import { useCallback, useEffect, useState } from "react";
import { RiLoader4Line as LoaderCircle, RiRefreshLine as RefreshCw, RiRestartLine as ResetLine } from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { codex, providers } from "../api/client";
import type { CodexUsage, CodexUsageWindow, Provider } from "../types";

function windowLabel(window: CodexUsageWindow | null | undefined) {
  const seconds = window?.limit_window_seconds;
  if (seconds === 18_000) return "5-hour window";
  if (seconds === 604_800) return "Weekly window";
  if (!seconds) return "Usage window";
  return `${Math.round(seconds / 3600)}h window`;
}

function resetLabel(timestamp?: number) {
  if (!timestamp) return "Reset time unavailable";
  return `Resets ${new Date(timestamp * 1000).toLocaleString()}`;
}

function UsageWindow({ title, value }: { title: string; value?: CodexUsageWindow | null }) {
  const used = Math.min(100, Math.max(0, value?.used_percent ?? 0));
  return <div className="space-y-2"><div className="flex items-center justify-between gap-3 text-sm"><span>{title}</span><span className="font-medium">{used.toFixed(0)}% used</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${used}%` }} /></div><div className="text-xs text-muted-foreground">{windowLabel(value)} · {resetLabel(value?.reset_at)}</div></div>;
}

function creditsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.credits)) return payload.credits;
  if (Array.isArray(payload?.reset_credits)) return payload.reset_credits;
  if (Array.isArray(payload?.data)) return payload.data;
  if (payload && typeof payload === "object") return payload.available_credits ? [payload] : [];
  return [];
}

export default function UsageLimitsPage() {
  const [accounts, setAccounts] = useState<Provider[]>([]);
  const [usage, setUsage] = useState<CodexUsage | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [credits, setCredits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [consuming, setConsuming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    try {
      refresh ? setRefreshing(true) : setLoading(true);
      const providerList = await providers.list();
      const codexProviders = providerList.filter((provider) => provider.protocol === "codex");
      setAccounts(codexProviders);
      if (codexProviders.length) {
        const [usageResult, creditResult, status] = await Promise.all([codex.usage(), codex.resetCredits(), codex.status()]);
        setUsage(usageResult);
        setCredits(creditsFromPayload(creditResult));
        setAccountId(status.account_id);
      } else {
        setUsage(null); setCredits([]); setAccountId(null);
      }
      setError(null);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const consume = async (creditId?: string) => {
    setConsuming(true); setError(null);
    try { await codex.consumeResetCredit(creditId); await load(true); }
    catch (e: any) { setError(e.message); }
    finally { setConsuming(false); }
  };

  if (loading) return <div className="flex justify-center p-12"><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></div>;

  return <div className="w-full space-y-6 p-6">
    <div className="flex items-center justify-between gap-4"><div><h1 className="font-heading text-2xl font-semibold tracking-tight">Usage limits</h1><p className="mt-1 text-sm text-muted-foreground">OAuth account limits and reset credits.</p></div><Button variant="outline" onClick={() => load(true)} disabled={refreshing}>{refreshing ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Refresh</Button></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {!accounts.length ? <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">No Codex OAuth providers connected.</CardContent></Card> : <div className="grid gap-5 xl:grid-cols-2">{accounts.map((account) => <Card key={account.id}><CardHeader><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><Avatar className="size-11"><AvatarImage src={account.avatar ?? undefined} /><AvatarFallback>{account.name.charAt(0).toUpperCase()}</AvatarFallback></Avatar><div><CardTitle>{account.name}</CardTitle><div className="text-xs text-muted-foreground">{usage?.plan_type ?? "Codex OAuth account"}{accountId ? ` · ${accountId}` : ""}</div></div></div><Button size="sm" variant="outline" onClick={() => consume(credits[0]?.id)} disabled={consuming || !credits.length}><ResetLine className="size-4" />{consuming ? "Using..." : `Reset credits (${credits.length})`}</Button></div></CardHeader><CardContent className="space-y-5"><UsageWindow title="Primary limit" value={usage?.rate_limit?.primary_window} /><UsageWindow title="Secondary limit" value={usage?.rate_limit?.secondary_window} /></CardContent></Card>)}</div>}
    <p className="text-xs text-muted-foreground">Usage and reset credits use private Codex/ChatGPT endpoints and may be unavailable or change without notice.</p>
  </div>;
}
