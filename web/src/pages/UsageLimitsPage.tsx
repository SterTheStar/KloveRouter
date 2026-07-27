import { useCallback, useEffect, useState } from "react";
import {
  RiLoader4Line as LoaderCircle,
  RiRefreshLine as RefreshCw,
  RiRestartLine as ResetLine,
} from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { antigravity, codex, freebuff, providers } from "../api/client";
import type {
  AntigravityQuota,
  CodexUsage,
  CodexUsageWindow,
  Provider,
  ProviderCredential,
} from "../types";

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

function UsageWindow({
  title,
  value,
}: {
  title: string;
  value?: CodexUsageWindow | null;
}) {
  const used = Math.min(100, Math.max(0, value?.used_percent ?? 0));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{title}</span>
        <span className="font-medium">{used.toFixed(0)}% used</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${used}%` }}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        {windowLabel(value)} · {resetLabel(value?.reset_at)}
      </div>
    </div>
  );
}

function FreebuffUsageSummary({ usage }: { usage: any }) {
  const rateLimit = usage?.rateLimit ?? usage?.rate_limit;
  const recentCount = Number(rateLimit?.recentCount ?? rateLimit?.recent_count ?? 0);
  const limit = Number(rateLimit?.limit ?? 0);
  const remaining = limit - recentCount;
  const hasRateLimit = Number.isFinite(limit) && limit > 0;
  const used = hasRateLimit ? Math.min(100, Math.max(0, (recentCount / limit) * 100)) : 0;
  const expires = usage?.expires_at ? new Date(usage.expires_at).toLocaleString() : null;
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>Shared Freebuff account limit</span>
          <span className="font-medium">{hasRateLimit ? `${Math.max(0, remaining).toFixed(1)} remaining` : "Quota data pending"}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${used}%` }} />
        </div>
        <div className="text-xs text-muted-foreground">
          {hasRateLimit
            ? `${recentCount.toFixed(1)} / ${limit} used`
            : "Quota counters unavailable"}
          {usage?.usage_cached_at
            ? ` · Last measurement: ${new Date(usage.usage_cached_at).toLocaleString()}`
            : ""}
          {usage?.usage_cache_stale
            ? " · Refresh available when a session is active"
            : ""}
          {rateLimit?.resetAt ? ` · Resets ${new Date(rateLimit.resetAt).toLocaleString()}` : rateLimit?.reset_at ? ` · Resets ${new Date(rateLimit.reset_at).toLocaleString()}` : ""}
          {expires ? ` · Session expires ${expires}` : ""}
        </div>
      </div>
    </div>
  );
}

function quotaTone(used: number) {
  if (used >= 90)
    return {
      bar: "bg-red-500",
      dot: "bg-red-500",
      text: "text-red-600 dark:text-red-400",
    };
  if (used >= 70)
    return {
      bar: "bg-amber-500",
      dot: "bg-amber-500",
      text: "text-amber-600 dark:text-amber-400",
    };
  return {
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  };
}

const quotaPalette = [
  "bg-blue-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-violet-500",
  "bg-lime-500",
];

function quotaColor(name: string) {
  const normalized = name.toLowerCase();
  if (normalized.includes("gemini")) return "bg-blue-500";
  if (
    normalized.includes("claude") ||
    normalized.includes("anthropic") ||
    normalized.includes("gpt")
  )
    return "bg-violet-500";
  if (normalized.includes("image")) return "bg-pink-500";
  let hash = 0;
  for (const character of name)
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return quotaPalette[Math.abs(hash) % quotaPalette.length];
}

function quotaFamily(quota: AntigravityQuota) {
  const value =
    `${quota.group_name} ${quota.limit_name} ${quota.model_ids.join(" ")}`.toLowerCase();
  return value.includes("gemini") ? "gemini" : "claude-gpt";
}

function quotaResetLabel(quotas: AntigravityQuota[]) {
  const reset = quotas.find((quota) => quota.reset_at)?.reset_at;
  const resetIn = quotas.find((quota) => quota.reset_in)?.reset_in;
  if (reset) {
    const date = new Date(reset);
    if (!Number.isNaN(date.getTime())) return `Resets ${date.toLocaleString()}`;
  }
  return resetIn ? `Resets in ${resetIn}` : "Reset time unavailable";
}

function AntigravityQuotaSummary({ quotas }: { quotas: AntigravityQuota[] }) {
  const isBlocked = (value: string) => {
    const normalized = value.toLowerCase();
    return (
      normalized === "chat_20706" ||
      normalized === "chat_23310" ||
      normalized.includes("tab_flash_lite_preview") ||
      normalized.includes("tab_jump_flash_lite_preview") ||
      normalized.includes("gemini-3.6-flash-tiered")
    );
  };
  const visibleQuotas = quotas.filter(
    (quota) =>
      !isBlocked(quota.group_name) &&
      !isBlocked(quota.limit_name) &&
      !quota.model_ids.some(isBlocked),
  );
  const sorted = [...visibleQuotas].sort(
    (a, b) => b.used_percent - a.used_percent,
  );
  const families = [
    {
      id: "gemini",
      label: "Gemini",
      quotas: sorted.filter((quota) => quotaFamily(quota) === "gemini"),
      color: "bg-blue-500",
    },
    {
      id: "claude-gpt",
      label: "Claude / GPT",
      quotas: sorted.filter((quota) => quotaFamily(quota) === "claude-gpt"),
      color: "bg-violet-500",
    },
  ]
    .filter((family) => family.quotas.length > 0)
    .map((family) => {
      const used = Math.max(
        ...family.quotas.map((quota) => quota.used_percent),
      );
      const remaining = Math.min(
        ...family.quotas.map((quota) => quota.remaining_fraction),
      );
      return {
        ...family,
        used,
        remaining,
        resetLabel: quotaResetLabel(family.quotas),
      };
    });
  return (
    <div className="space-y-3">
      <div className="space-y-5">
        {families.map((family) => (
          <Tooltip key={family.id}>
            <TooltipTrigger
              render={
                <div
                  className="space-y-2 cursor-help"
                  aria-label={`${family.label}: ${family.used}% used`}
                />
              }
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{family.label}</span>
                <span className="font-medium">{family.used}% used</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${family.color} transition-all`}
                  style={{ width: `${family.used}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Weekly limits · {family.resetLabel}
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="w-fit max-w-[min(420px,calc(100vw-2rem))] whitespace-normal p-3"
            >
              <div className="w-fit max-w-full space-y-2 overflow-hidden">
                <div className="flex items-center gap-2">
                  <span
                    className={`size-2 shrink-0 rounded-full ${family.color}`}
                  />
                  <span className="text-xs font-semibold">{family.label}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {family.used}% used · {Math.round(family.remaining * 100)}%
                  remaining
                </div>
                <div className="border-t border-border pt-2 text-xs text-muted-foreground">
                  <div className="max-h-24 overflow-y-auto break-all">
                    Models:{" "}
                    {[
                      ...new Set(
                        family.quotas.flatMap((quota) => quota.model_ids),
                      ),
                    ].join(", ")}
                  </div>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

function creditsFromPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.credits)) return payload.credits;
  if (Array.isArray(payload?.reset_credits)) return payload.reset_credits;
  if (Array.isArray(payload?.data)) return payload.data;
  if (payload && typeof payload === "object")
    return payload.available_credits ? [payload] : [];
  return [];
}

export default function UsageLimitsPage() {
  const [accounts, setAccounts] = useState<
    {
      provider: Provider;
      credential: ProviderCredential;
      usage: CodexUsage | null;
      credits: any[];
      antigravityQuota: AntigravityQuota[] | null;
      freebuffUsage: any | null;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [consuming, setConsuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState<string | null>(null);

  const accountIdentity = (
    provider: Provider,
    credential: ProviderCredential,
  ) =>
    provider.protocol === "antigravity"
      ? credential.id
      : credential.account_id || credential.label;

  const load = useCallback(async (refresh = false) => {
    try {
      refresh ? setRefreshing(true) : setLoading(true);
      const providerList = await providers.list();
      const oauthProviders = providerList.filter(
        (provider) =>
          provider.protocol === "codex" || provider.protocol === "antigravity" || provider.protocol === "freebuff",
      );
      const accountGroups = await Promise.all(
        oauthProviders.map(async (provider) => {
          const credentials = (await providers.credentials(provider.id)).filter(
            (credential) =>
              (credential.kind === "codex" && credential.account_id) ||
              (credential.kind === "antigravity" && credential.email) ||
              (credential.kind === "freebuff" && credential.masked_secret),
          );
          return Promise.all(
            credentials.map(async (credential) => {
              try {
                if (provider.protocol === "antigravity")
                  return {
                    provider,
                    credential,
                    usage: null,
                    credits: [],
                    antigravityQuota: await antigravity.usage(credential.id),
                    freebuffUsage: null,
                  };
                if (provider.protocol === "freebuff")
                  return {
                    provider,
                    credential,
                    usage: null,
                    credits: [],
                    antigravityQuota: null,
                    freebuffUsage: await freebuff.usage(credential.id),
                  };
                const [usageResult, creditResult] = await Promise.all([
                  codex.usage(credential.id),
                  codex.resetCredits(credential.id),
                ]);
                return {
                  provider,
                  credential,
                  usage: usageResult,
                  credits: creditsFromPayload(creditResult),
                  antigravityQuota: null,
                  freebuffUsage: null,
                };
              } catch {
                return {
                  provider,
                  credential,
                  usage: null,
                  credits: [],
                  antigravityQuota: null,
                };
              }
            }),
          );
        }),
      );
      const accountCards = accountGroups.flat();
      setAccounts(accountCards);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const consume = async (credentialId: string, creditId?: string) => {
    setConsuming(true);
    setError(null);
    try {
      await codex.consumeResetCredit(credentialId, creditId);
      await load(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setConsuming(false);
    }
  };

  const unlockFreebuff = async (credentialId: string) => {
    setUnlocking(credentialId);
    setError(null);
    try {
      await freebuff.unlock(credentialId);
      await load(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUnlocking(null);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center p-12">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="w-full space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Usage limits
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            OAuth account limits and reset credits.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => load(true)}
          disabled={refreshing}
        >
          {refreshing ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Refresh
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!accounts.length ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No OAuth accounts connected.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {accounts.map(
            ({ provider, credential, usage, credits, antigravityQuota, freebuffUsage: freebuffData }) => (
              <Card key={credential.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-11">
                        <AvatarImage src={provider.avatar ?? undefined} />
                        <AvatarFallback>
                          {(credential.email || credential.label)
                            .charAt(0)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle>
                          {provider.protocol === "antigravity"
                            ? credential.email || credential.label
                            : credential.label}
                        </CardTitle>
                        {provider.protocol === "freebuff" ? (
                          <div className="text-xs text-muted-foreground">
                            Session {freebuffData?.status ?? "none"} · Tier {freebuffData?.accessTier ?? freebuffData?.access_tier ?? "unknown"} · Country {freebuffData?.countryCode ?? freebuffData?.country_code ?? "unknown"}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            {accountIdentity(provider, credential)} ·{" "}
                            {provider.protocol === "antigravity"
                              ? "Antigravity account"
                              : usage?.plan_type ?? "Codex OAuth account"}
                          </div>
                        )}
                      </div>
                    </div>
                      {provider.protocol === "freebuff" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            freebuffData?.instance_id
                              ? unlockFreebuff(credential.id)
                              : load(true)
                          }
                          disabled={
                            unlocking === credential.id ||
                            refreshing ||
                            !freebuffData?.instance_id
                          }
                        >
                          {unlocking === credential.id || refreshing ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : (
                            <ResetLine className="size-4" />
                          )}
                          {freebuffData?.instance_id
                            ? `Unlock ${freebuffData.model ?? "current model"}`
                            : "No active session"}
                        </Button>
                      )}
                      {provider.protocol === "codex" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => consume(credential.id, credits[0]?.id)}
                        disabled={consuming || !credits.length}
                      >
                        <ResetLine className="size-4" />
                        {consuming
                          ? "Using..."
                          : `Reset credits (${credits.length})`}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                    {provider.protocol === "freebuff" ? (
                      <FreebuffUsageSummary usage={freebuffData} />
                    ) : provider.protocol === "antigravity" ? (
                    antigravityQuota?.length ? (
                      <AntigravityQuotaSummary quotas={antigravityQuota} />
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        No quota data returned.
                      </div>
                    )
                  ) : (
                    <>
                      <UsageWindow
                        title="Primary limit"
                        value={usage?.rate_limit?.primary_window}
                      />
                      <UsageWindow
                        title="Secondary limit"
                        value={usage?.rate_limit?.secondary_window}
                      />
                    </>
                  )}
                </CardContent>
              </Card>
            ),
          )}
        </div>
      )}
    </div>
  );
}
