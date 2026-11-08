import { useCallback, useEffect, useState } from "react";
import {
  RiLoader4Line as LoaderCircle,
  RiRefreshLine as RefreshCw,
  RiRestartLine as ResetLine,
} from "@remixicon/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { antigravity, codex, deepai, freebuff, perch, providers } from "../api/client";
import type {
  AntigravityQuotaBucket,
  AntigravityUsage,
  CodexUsage,
  CodexUsageWindow,
  PerchUsage,
  Provider,
  ProviderCredential,
} from "../types";
import ProviderIcon from "../components/ProviderIcon";

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
        <span className="text-foreground">{title}</span>
        <span className="font-medium text-foreground tabular-nums">{used.toFixed(0)}% used</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-overlay">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${used}%` }}
        />
      </div>
      <div className="text-xs text-tertiary">
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
          <span className="text-foreground">Shared Freebuff account limit</span>
          <span className="font-medium text-foreground tabular-nums">{hasRateLimit ? `${Math.max(0, remaining).toFixed(1)} remaining` : "Quota data pending"}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-overlay">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${used}%` }} />
        </div>
        <div className="text-xs text-tertiary">
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

function usageNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  return new Intl.NumberFormat().format(value);
}

function usageUsd(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  return value > 0 && value < 0.01
    ? `$${value.toFixed(4)}`
    : `$${value.toFixed(2)}`;
}

function usageDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

function PerchRollingLimit({
  label,
  used,
  cap,
  reset,
}: {
  label: string;
  used: number | null;
  cap: number | null;
  reset: string | null;
}) {
  const percent =
    used !== null && cap !== null && cap > 0
      ? Math.min(100, Math.max(0, (used / cap) * 100))
      : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="font-medium">
          {used !== null && cap !== null
            ? `${usageUsd(used)} / ${usageUsd(cap)}`
            : "—"}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        {reset ? `Frees up ${usageDate(reset)}` : "Reset time unavailable"}
      </div>
    </div>
  );
}

function PerchUsageSummary({ usage }: { usage: PerchUsage | null }) {
  if (!usage)
    return (
      <div className="text-sm text-muted-foreground">
        No Perch usage data returned.
      </div>
    );

  const windows = [
    { label: "Daily", value: usage.usage.daily },
    { label: "Weekly", value: usage.usage.weekly },
    { label: "Monthly", value: usage.usage.monthly },
  ];
  const rolling = usage.usage.rolling;
  const updated = usageDate(usage.fetched_at);

  return (
    <div className="space-y-5">
      {usage.source === "local" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          {usage.warning ||
            "Perch usage endpoint unavailable. Showing local KloveRouter usage."}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {windows.map(({ label, value }) => (
          <div key={label} className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-lg font-semibold">
              {usageNumber(value.tokens)}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                tokens
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {usageNumber(value.calls)} calls · {usageUsd(value.usd)}
              {value.points !== null
                ? ` · ${usageNumber(value.points)} pt`
                : ""}
            </div>
          </div>
        ))}
      </div>

      {rolling?.enabled && (
        <div className="space-y-4">
          <PerchRollingLimit
            label="5-hour spend limit"
            used={rolling.window_5h_usd}
            cap={rolling.cap_5h_usd}
            reset={rolling.next_free_5h}
          />
          <PerchRollingLimit
            label="7-day spend limit"
            used={rolling.window_7d_usd}
            cap={rolling.cap_7d_usd}
            reset={rolling.next_free_7d}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Plan: {usage.plan?.name || usage.plan?.code || "unknown"}
        </span>
        {usage.credits.enabled !== null && (
          <span>
            Credits:{" "}
            {usage.credits.enabled
              ? `${usageNumber(usage.credits.balance_points)} pt`
              : "disabled"}
          </span>
        )}
        {updated && <span>Updated: {updated}</span>}
        {usage.cached && <span>cached</span>}
        {usage.source === "local" && <span>source: local usage log</span>}
      </div>
    </div>
  );
}

const ARGON_NOTE =
  "For paid Pro plans, Argon quota is separate. Higher Argon quota (included as part of the larger Gemini quota bucket) is available on Ultra plans.";

function quotaTone(used: number) {
  if (used >= 90) return "bg-red-500";
  if (used >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function windowTitle(bucket: AntigravityQuotaBucket) {
  const window = `${bucket.window} ${bucket.bucket_id}`.toLowerCase();
  if (window.includes("week") || window.includes("7d"))
    return "Weekly Limit Remaining";
  if (window.includes("5h") || window.includes("5-hour"))
    return "Five Hour Limit Remaining";
  return bucket.label || bucket.window || "Limit";
}

function AntigravityQuotaBucketBar({
  bucket,
}: {
  bucket: AntigravityQuotaBucket;
}) {
  if (bucket.disabled)
    return (
      <div className="space-y-2">
        <div className="text-sm text-foreground">{windowTitle(bucket)}</div>
        <div className="text-xs text-tertiary">Not available on this plan</div>
      </div>
    );
  if (bucket.unlimited)
    return (
      <div className="space-y-2">
        <div className="text-sm text-foreground">{windowTitle(bucket)}</div>
        <div className="text-xs text-tertiary">Unlimited on this account</div>
      </div>
    );
  if (bucket.remaining_fraction === null)
    return (
      <div className="space-y-2">
        <div className="text-sm text-foreground">{windowTitle(bucket)}</div>
        <div className="text-xs text-tertiary">
          {bucket.remaining_amount !== null
            ? `${usageNumber(bucket.remaining_amount)} remaining`
            : "Quota data unavailable"}
        </div>
      </div>
    );
  const remaining = Math.min(
    100,
    Math.max(0, (bucket.remaining_fraction ?? 0) * 100),
  );
  const tone = quotaTone(bucket.used_percent ?? 0);
  const reset = bucket.reset_at ? new Date(bucket.reset_at) : null;
  const resetLabel =
    reset && !Number.isNaN(reset.getTime())
      ? bucket.reset_in
        ? `Refreshes in ${bucket.reset_in} (${reset.toLocaleString()})`
        : `Refreshes ${reset.toLocaleString()}`
      : bucket.reset_in
        ? `Refreshes in ${bucket.reset_in}`
        : "Quota available";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-foreground">{windowTitle(bucket)}</span>
        <span className="font-medium text-foreground tabular-nums">
          {remaining.toFixed(2)}% left
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-overlay">
        <div
          className={`h-full rounded-full ${tone} transition-all`}
          style={{ width: `${remaining}%` }}
        />
      </div>
      <div className="text-xs text-tertiary">{resetLabel}</div>
    </div>
  );
}

function AntigravityQuotaSummary({ usage }: { usage: AntigravityUsage }) {
  const groups = usage.groups.filter((group) => group.buckets.length > 0);
  return (
    <div className="space-y-5">
      {groups.length === 0 && (
        <div className="text-sm text-tertiary">
          Antigravity returned no quota groups for this account.
        </div>
      )}
      {groups.map((group) => {
        const modelNames = [
          ...new Set(
            usage.models
              .filter((model) => model.group_id === group.id)
              .map((model) => model.display_name || model.model_id),
          ),
        ];
        return (
          <div key={group.group_name} className="space-y-3">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">
                {group.group_name}
              </div>
              {group.description && (
                <div className="text-xs text-tertiary">{group.description}</div>
              )}
              {group.id === "argon" && (
                <div className="text-xs text-tertiary">{ARGON_NOTE}</div>
              )}
            </div>
            {group.available ? (
              <div className="space-y-4">
                {group.buckets.map((bucket) => (
                  <AntigravityQuotaBucketBar
                    key={bucket.bucket_id}
                    bucket={bucket}
                  />
                ))}
              </div>
            ) : (
              <div className="text-xs text-tertiary">
                Not available on this plan
              </div>
            )}
            {modelNames.length > 0 && (
              <div className="max-h-16 overflow-y-auto break-all text-xs text-tertiary">
                Models: {modelNames.join(", ")}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tertiary">
        {usage.plan && <span>Plan: {usage.plan}</span>}
        {usage.fetched_at && (
          <span>Updated: {new Date(usage.fetched_at).toLocaleString()}</span>
        )}
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
      antigravityQuota: AntigravityUsage | null;
      freebuffUsage: any | null;
      perchUsage: PerchUsage | null;
      deepaiUsage: any | null;
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
      const usageProviders = providerList.filter(
        (provider) =>
          provider.protocol === "codex" ||
          provider.protocol === "antigravity" ||
          provider.protocol === "freebuff" ||
          provider.protocol === "perch" ||
          provider.protocol === "deepai",
      );
      const accountGroups = await Promise.all(
        usageProviders.map(async (provider) => {
          const credentials = (await providers.credentials(provider.id)).filter(
            (credential) =>
              (credential.kind === "codex" && credential.account_id) ||
              (credential.kind === "antigravity" && credential.email) ||
              (credential.kind === "freebuff" && credential.masked_secret) ||
              credential.kind === "perch" ||
              (provider.protocol === "deepai" && credential.kind === "api_key" && Boolean(credential.masked_secret)),
          );
          return Promise.all(
            credentials.map(async (credential) => {
              try {
                if (provider.protocol === "perch")
                  return {
                    provider,
                    credential,
                    usage: null,
                    credits: [],
                    antigravityQuota: null,
                    freebuffUsage: null,
                    perchUsage: await perch.usage(credential.id),
                    deepaiUsage: null,
                  };
                if (provider.protocol === "deepai")
                  return {
                    provider,
                    credential,
                    usage: null,
                    credits: [],
                    antigravityQuota: null,
                    freebuffUsage: null,
                    perchUsage: null,
                    deepaiUsage: await deepai.usage(credential.id),
                  };
                if (provider.protocol === "antigravity")
                  return {
                    provider,
                    credential,
                    usage: null,
                    credits: [],
                    antigravityQuota: await antigravity.usage(credential.id),
                    freebuffUsage: null,
                    perchUsage: null,
                    deepaiUsage: null,
                  };
                if (provider.protocol === "freebuff")
                  return {
                    provider,
                    credential,
                    usage: null,
                    credits: [],
                    antigravityQuota: null,
                    freebuffUsage: await freebuff.usage(credential.id),
                    perchUsage: null,
                    deepaiUsage: null,
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
                    perchUsage: null,
                    deepaiUsage: null,
                };
              } catch {
                return {
                  provider,
                  credential,
                  usage: null,
                  credits: [],
                  antigravityQuota: null,
                  freebuffUsage: null,
                  perchUsage: null,
                  deepaiUsage: null,
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
        <LoaderCircle className="size-5 animate-spin text-tertiary" />
      </div>
    );

  return (
    <div className="w-full space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            Usage limits
          </h1>
          <p className="mt-1 text-sm text-tertiary">
            Account usage, limits and reset credits.
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
        <Card className="border border-border shadow-none">
          <CardContent className="p-10 text-center text-sm text-tertiary">
            No usage-tracked accounts connected.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {accounts.map(
            ({ provider, credential, usage, credits, antigravityQuota, freebuffUsage: freebuffData, perchUsage: perchData, deepaiUsage: deepaiData }) => (
        <Card key={credential.id} className="border border-border shadow-none">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <ProviderIcon name={provider.name} src={provider.avatar} fallbackLabel={perchData?.profile?.email || credential.email || credential.label} className="size-11" />
                      <div>
                        <CardTitle className="text-foreground">
                            {provider.protocol === "antigravity"
                              ? credential.email || credential.label
                              : provider.protocol === "perch"
                                ? perchData?.profile?.email || credential.label
                                : provider.protocol === "deepai"
                                  ? deepaiData?.summary?.username || credential.label
                              : credential.label}
                        </CardTitle>
                        {provider.protocol === "freebuff" ? (
                          <div className="text-xs text-tertiary">
                            Session {freebuffData?.status ?? "none"} · Tier {freebuffData?.accessTier ?? freebuffData?.access_tier ?? "unknown"} · Country {freebuffData?.countryCode ?? freebuffData?.country_code ?? "unknown"}
                          </div>
                        ) : (
                          <div className="text-xs text-tertiary">
                            {provider.protocol === "perch" ? (
                              <>
                                {perchData?.plan?.name ||
                                  perchData?.plan?.code ||
                                  "Perch account"}{" "}
                                ·{" "}
                                {perchData?.source === "local"
                                  ? "local KloveRouter usage"
                                  : "Perch usage"}
                              </>
                            ) : (
                              <>
                                {accountIdentity(provider, credential)} ·{" "}
                                {provider.protocol === "antigravity"
                                  ? "Antigravity account"
                                  : provider.protocol === "deepai"
                                    ? deepaiData?.summary?.plan ?? "DeepAI account"
                                    : usage?.plan_type ?? "Codex OAuth account"}
                              </>
                            )}
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
                    {provider.protocol === "deepai" ? (
                      deepaiData?.allowance || deepaiData?.summary ? (
                        <div className="space-y-2 text-sm">
                          <div className="font-medium">Theos usage</div>
                          <div className="text-tertiary">
                            {deepaiData.allowance?.enabled
                              ? `Balance: ${deepaiData.allowance.balance ?? "unknown"} · Granted: ${deepaiData.allowance.granted ?? "unknown"} · Refresh: ${deepaiData.allowance.refresh_at ?? deepaiData.allowance.refreshAt ?? "unknown"}`
                              : "Theos allowance is not enabled or unavailable."}
                          </div>
                          {deepaiData.summary && <div className="text-tertiary">Plan: {deepaiData.summary.plan ?? "unknown"} · Pro: {deepaiData.summary.is_pro ? "yes" : "no"} · Credits: {deepaiData.summary.credits_remaining ?? "unknown"}</div>}
                        </div>
                      ) : <div className="text-sm text-tertiary">No DeepAI usage data returned.</div>
                    ) : provider.protocol === "freebuff" ? (
                      <FreebuffUsageSummary usage={freebuffData} />
                    ) : provider.protocol === "perch" ? (
                      <PerchUsageSummary usage={perchData} />
                    ) : provider.protocol === "antigravity" ? (
                    antigravityQuota?.groups?.length ? (
                      <AntigravityQuotaSummary usage={antigravityQuota} />
                    ) : (
                      <div className="text-sm text-tertiary">
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
