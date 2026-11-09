import { credentialService } from "../../services/credential.service";
import {
  antigravityAuthService,
  discoverProject,
  DEFAULT_ANTIGRAVITY_PROJECT_ID,
} from "./antigravity-auth.service";
import { getImpersonationHeaders, buildHubUserAgent } from "./antigravity.headers";
import {
  deriveSessionId,
  googleStreamToOpenAI,
  toGoogleBody,
} from "./antigravity.transform";
import {
  filterAntigravityModels,
  isBlockedAntigravityModel,
} from "./antigravity.models";
import { logger } from "../../logger";

const CLOUDCODE_STREAM_ENDPOINTS = [
  "https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse",
  "https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse",
];
export type AntigravityQuotaBucket = {
  bucket_id: string;
  label: string;
  window: "weekly" | "5h" | string;
  remaining_fraction: number | null;
  remaining_amount: number | null;
  used_percent: number | null;
  disabled: boolean;
  unlimited: boolean;
  reset_at: string | null;
  reset_in: string | null;
};

export type AntigravityQuotaGroup = {
  id: string;
  group_name: string;
  description: string | null;
  available: boolean;
  buckets: AntigravityQuotaBucket[];
};

export type AntigravityUsage = {
  fetched_at: string;
  plan: string | null;
  groups: AntigravityQuotaGroup[];
  models: {
    model_id: string;
    display_name: string | null;
    group_id: string | null;
    remaining_fraction: number | null;
    used_percent: number | null;
    reset_at: string | null;
    reset_in: string | null;
  }[];
};
export async function antigravityResponses(
  body: any,
  model: string,
  credentialInput: any,
) {
  if (isBlockedAntigravityModel(model))
    throw new Error(`Antigravity model is blocked: ${model}`);
  let credential = await antigravityAuthService.ensure(credentialInput.id);
  if (!credential.project_id && credential.access_token) {
    const project = await discoverProject(credential.access_token);
    if (project)
      credential = credentialService.findById(
        credentialService.update(credential.id, { project_id: project })?.id ??
          credential.id,
      )!;
  }
  const projectId = credential.project_id || DEFAULT_ANTIGRAVITY_PROJECT_ID;
  if (!credential.access_token)
    throw new Error("Antigravity account has no access token");
  const fingerprint = antigravityAuthService.fingerprint(credential);
  const sessionId = deriveSessionId(body, credential.email || credential.id);
  const headers = getImpersonationHeaders(
    credential.access_token,
    fingerprint,
    model,
    sessionId,
    "text/event-stream",
  );
  const payload = JSON.stringify(
    await toGoogleBody({ ...body, model }, projectId, sessionId),
  );
  let response: Response | null = null;
  let lastError: unknown;
  for (const endpoint of CLOUDCODE_STREAM_ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const requestStarted = performance.now();
        response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: payload,
        });
        logger.debug("Antigravity response headers received", {
          model,
          endpoint,
          attempt: attempt + 1,
          duration_ms: Math.round(performance.now() - requestStarted),
          status: response.status,
        });
        if (response.ok) break;
        if (response.status === 401) {
          const refreshed = await antigravityAuthService.ensure(credential.id);
          headers.Authorization = `Bearer ${refreshed.access_token}`;
        }
        if (response.status < 500 && response.status !== 401 && response.status !== 429) {
          break;
        }
        lastError = new Error(`Antigravity upstream returned ${response.status}`);
      } catch (error) {
        lastError = error;
      }
      if (attempt === 0) await Bun.sleep(400);
    }
    if (response?.ok) break;
  }
  if (!response)
    throw new Error(
      lastError instanceof Error
        ? `Antigravity connection failed: ${lastError.message}`
        : "Antigravity connection failed",
    );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Antigravity request failed (${response.status})`);
  }
  return googleStreamToOpenAI(
    response,
    model,
    `chatcmpl-${crypto.randomUUID()}`,
  );
}
function titleizeModelId(id: string) {
  return id
    .replace(/^models\//, "")
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) =>
      /^v?\d/.test(part) ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1),
    )
    .join(" ");
}

const QUOTA_SUMMARY_ENDPOINTS = [
  "https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
  "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
  "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:retrieveUserQuotaSummary",
] as const;

const AVAILABLE_MODELS_ENDPOINTS = [
  "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels",
  "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
  "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
] as const;

const CODE_ASSIST_ENDPOINTS = [
  "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
  "https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
] as const;

async function callCloudCodeWithFallback(
  endpoints: readonly string[],
  token: string,
  fingerprint: ReturnType<typeof antigravityAuthService.fingerprint>,
  initialPayload: Record<string, any>,
  customUserAgent?: string,
): Promise<{ data: any; text: string; status: number }> {
  let lastResult = { data: null as any, text: "", status: 0 };
  const baseHeaders = getImpersonationHeaders(token, fingerprint);
  const headers: Record<string, string> = {
    ...baseHeaders,
    "User-Agent": customUserAgent || baseHeaders["User-Agent"] || buildHubUserAgent(),
  };

  for (let i = 0; i < endpoints.length; i++) {
    const url = endpoints[i];
    let currentPayload = { ...initialPayload };
    let retriedWithoutProject = false;

    while (true) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(currentPayload),
        });
        const text = await response.text().catch(() => "");
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
        lastResult = { data, text, status: response.status };

        if (response.status >= 200 && response.status < 300) {
          return lastResult;
        }

        // 403 retry without project ID if project was passed
        if (response.status === 403 && "project" in currentPayload && !retriedWithoutProject) {
          delete currentPayload.project;
          retriedWithoutProject = true;
          continue;
        }

        // Abort immediately for 401
        if (response.status === 401) {
          return lastResult;
        }

        break;
      } catch (err: any) {
        lastResult = { data: null, text: err?.message || String(err), status: 0 };
        break;
      }
    }
  }

  return lastResult;
}

export async function antigravityModels(credential: any) {
  const account = await antigravityAuthService.ensure(credential.id);
  if (!account.access_token)
    throw new Error("Antigravity account is not ready");

  const fingerprint = antigravityAuthService.fingerprint(account);
  const payload = account.project_id ? { project: account.project_id } : {};
  const hubUa = buildHubUserAgent();

  const response = await callCloudCodeWithFallback(
    AVAILABLE_MODELS_ENDPOINTS,
    account.access_token,
    fingerprint,
    payload,
    hubUa,
  );

  if (response.status >= 200 && response.status < 300) {
    const raw = response.data?.availableModels ?? response.data?.models ?? [];
    const entries = Array.isArray(raw)
      ? raw.map((m: any) => ({
          ...m,
          id: m.model?.name || m.name || m.displayName,
          display_name:
            m.displayMetadata?.label || m.displayName || m.model?.name,
        }))
      : Object.entries(raw).map(([id, m]: any) => ({
          ...m,
          id: id.replace(/^models\//, ""),
          display_name: m.displayMetadata?.label || m.displayName || id,
        }));
    const models = filterAntigravityModels(
      entries
        .filter((m: any) => m.id)
        .map((m: any, index: number) => ({
          ...m,
          id: m.id,
          display_name: m.display_name || undefined,
          _index: index,
        })),
    )
      .sort(
        (a: any, b: any) =>
          Number(!a.display_name) - Number(!b.display_name) ||
          a._index - b._index,
      )
      .map((m: any) => ({
        ...m,
        display_name: m.display_name || titleizeModelId(m.id),
      }));
    if (models.length) return models;
    throw new Error("Antigravity returned no available models");
  }

  const lastError =
    response.data?.error?.message ||
    response.data?.message ||
    response.text ||
    `HTTP ${response.status}`;
  if (response.status === 401) {
    throw new Error(
      `Antigravity authentication failed while syncing models: ${lastError}`,
    );
  }
  throw new Error(`Antigravity models request failed: ${lastError}`);
}

function parseResetTime(raw: unknown): string | null {
  if (typeof raw === "number")
    return new Date(raw < 10_000_000_000 ? raw * 1000 : raw).toISOString();
  if (typeof raw === "string" && /^\d+(\.\d+)?s$/.test(raw))
    return new Date(Date.now() + Number.parseFloat(raw) * 1000).toISOString();
  if (typeof raw === "string" && !Number.isNaN(new Date(raw).getTime()))
    return new Date(raw).toISOString();
  return null;
}

function quotaBucket(
  bucketId: string,
  label: string,
  window: string,
  resetRaw: unknown,
  remaining: number | null,
  remainingAmount: number | null,
  disabled: boolean,
  unlimited: boolean,
): AntigravityQuotaBucket {
  const resetAt = parseResetTime(resetRaw);
  return {
    bucket_id: bucketId,
    label,
    window,
    remaining_fraction: remaining,
    remaining_amount: remainingAmount,
    used_percent: remaining === null ? null : Math.round((1 - remaining) * 100),
    disabled,
    unlimited,
    reset_at: resetAt,
    reset_in: resetAt
      ? formatDuration(Math.max(0, new Date(resetAt).getTime() - Date.now()))
      : null,
  };
}

const GROUP_ORDER = ["gemini models", "claude and gpt models", "gemini 4 argon"];

function groupSortKey(name: string) {
  const index = GROUP_ORDER.findIndex((key) => name.toLowerCase().startsWith(key));
  return index === -1 ? GROUP_ORDER.length : index;
}

function bucketWindowRank(bucket: AntigravityQuotaBucket) {
  const window = `${bucket.window} ${bucket.bucket_id}`.toLowerCase();
  if (window.includes("5h") || window.includes("5-hour")) return 0;
  if (window.includes("week") || window.includes("7d")) return 1;
  return 2;
}

function modelGroupId(modelId: string): string | null {
  const id = modelId.toLowerCase();
  if (id.includes("argon")) return "argon";
  if (id.includes("gemini")) return "gemini";
  if (id.includes("claude") || id.includes("gpt") || id.includes("openai"))
    return "3p";
  return null;
}

function toFraction(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number));
}

function groupsFromSummary(raw: any): AntigravityQuotaGroup[] {
  const groups: { name: string; description: string | null; buckets: any[] }[] = Array.isArray(raw?.groups)
    ? raw.groups.map((group: any) => ({
        name: String(group?.displayName || "Antigravity"),
        description: group?.description ? String(group.description) : null,
        buckets: Array.isArray(group?.buckets) ? group.buckets : [],
      }))
    : Array.isArray(raw?.buckets)
      ? [{
          name: "Antigravity",
          description: raw?.description ? String(raw.description) : null,
          buckets: raw.buckets,
        }]
      : [];
  return groups.flatMap((group) => {
    const buckets = group.buckets.map((bucket: any) => {
      const hasFraction = bucket?.remainingFraction !== undefined && bucket?.remainingFraction !== null;
      const remaining = hasFraction ? toFraction(bucket.remainingFraction) : null;
      const amount = Number(bucket?.remainingAmount);
      return quotaBucket(
        String(bucket?.bucketId || ""),
        String(bucket?.displayName || bucket?.bucketId || "Limit"),
        String(bucket?.window || bucket?.bucketId || ""),
        bucket?.resetTime,
        remaining,
        Number.isFinite(amount) ? amount : null,
        bucket?.disabled === true,
        remaining === null && hasFraction,
      );
    });
    if (!buckets.length) return [];
    const normalized = group.name.toLowerCase();
    const id = normalized.includes("argon")
      ? "argon"
      : normalized.includes("gemini")
        ? "gemini"
        : "3p";
    return [{
      id,
      group_name: group.name,
      description: group.description,
      available: buckets.some((bucket: AntigravityQuotaBucket) => !bucket.disabled),
      buckets: buckets.sort((a: AntigravityQuotaBucket, b: AntigravityQuotaBucket) =>
        bucketWindowRank(a) - bucketWindowRank(b) || a.label.localeCompare(b.label),
      ),
    }];
  });
}

function fallbackGroupsFromModels(models: AntigravityUsage["models"]): AntigravityQuotaGroup[] {
  if (!models.length) return [];
  const byGroup: Record<string, AntigravityUsage["models"]> = {};
  for (const model of models) {
    const gid = model.group_id || "gemini";
    if (!byGroup[gid]) byGroup[gid] = [];
    byGroup[gid].push(model);
  }

  const result: AntigravityQuotaGroup[] = [];
  const groupMeta: Record<string, { name: string; desc: string }> = {
    gemini: { name: "Gemini Models", desc: "Per-model rate limits" },
    "3p": { name: "Claude and GPT Models", desc: "Anthropic and OpenAI model limits" },
    argon: { name: "Gemini 4 Argon", desc: "Gemini 4 Argon rate limits" },
  };

  for (const [gid, mList] of Object.entries(byGroup)) {
    const meta = groupMeta[gid] || { name: gid.toUpperCase(), desc: "Model limits" };
    const withFraction = mList.filter((m) => m.remaining_fraction !== null);
    const minFraction = withFraction.length > 0
      ? Math.min(...withFraction.map((m) => m.remaining_fraction!))
      : null;
    const sortedResets = withFraction
      .map((m) => m.reset_at)
      .filter((r): r is string => Boolean(r))
      .sort();
    const earliestReset = sortedResets[0] || null;

    result.push({
      id: gid,
      group_name: meta.name,
      description: meta.desc,
      available: mList.length > 0,
      buckets: [
        quotaBucket(
          `fallback-${gid}`,
          meta.name,
          "Model Limits",
          earliestReset,
          minFraction,
          null,
          mList.length === 0,
          minFraction === null,
        ),
      ],
    });
  }

  return result.sort((a, b) => groupSortKey(a.group_name) - groupSortKey(b.group_name));
}

function groupsFromModels(raw: any): {
  groups: AntigravityQuotaGroup[];
  models: AntigravityUsage["models"];
} {
  const models: AntigravityUsage["models"] = [];
  const entries = Array.isArray(raw)
    ? raw.map((item: any) => ({ id: item.model?.name || item.name, item }))
    : Object.entries(raw ?? {}).map(([id, item]: any) => ({
        id: id.replace(/^models\//, ""),
        item,
      }));
  for (const entry of entries) {
    const info = entry.item?.quotaInfo;
    const id = String(entry.id || "");
    const displayName = entry.item?.displayName ? String(entry.item.displayName) : null;
    if (!id || isBlockedAntigravityModel(id) || (displayName && isBlockedAntigravityModel(displayName)))
      continue;
    const remaining = info ? toFraction(info.remainingFraction) : null;
    const resetAt = parseResetTime(info?.resetTime);
    const family =
      modelGroupId(id) ||
      modelGroupId(String(entry.item?.apiProvider || "")) ||
      (String(entry.item?.modelProvider || "").includes("GOOGLE") ? "gemini" : "3p");
    models.push({
      model_id: id,
      display_name: displayName,
      group_id: family,
      remaining_fraction: remaining,
      used_percent: remaining === null ? null : Math.round((1 - remaining) * 100),
      reset_at: resetAt,
      reset_in: resetAt
        ? formatDuration(Math.max(0, new Date(resetAt).getTime() - Date.now()))
        : null,
    });
  }
  return { groups: fallbackGroupsFromModels(models), models };
}

export function populateSyntheticArgonModels(
  models: AntigravityUsage["models"],
  quotaGroups?: readonly AntigravityQuotaGroup[],
): void {
  if (!quotaGroups || quotaGroups.length === 0) return;

  const hasArgon = models.some((m) => {
    const normalized = m.model_id.replace(/^models\//i, "").toLowerCase();
    return normalized.startsWith("gemini-4-argon");
  });
  if (hasArgon) return;

  for (const group of quotaGroups) {
    const isArgonGroup =
      group.id === "argon" ||
      group.group_name.toLowerCase().includes("argon") ||
      group.buckets.some((b) => b.bucket_id.toLowerCase().includes("argon"));
    if (!isArgonGroup) continue;

    const bucket =
      group.buckets.find((b) => b.bucket_id.toLowerCase().includes("argon")) ?? group.buckets[0];
    if (!bucket) continue;

    const remaining = bucket.remaining_fraction ?? 1;
    models.push({
      model_id: "gemini-4-argon-high",
      display_name: "Gemini 4 Argon (High)",
      group_id: "argon",
      remaining_fraction: remaining,
      used_percent: bucket.used_percent ?? (remaining !== null ? Math.round((1 - remaining) * 100) : 0),
      reset_at: bucket.reset_at,
      reset_in: bucket.reset_in,
    });
    break;
  }
}

function resolveSubscriptionTier(payload: any): string | null {
  const paidTier = payload?.paidTier;
  if (typeof paidTier?.name === "string" && paidTier.name.trim()) {
    return paidTier.name;
  }
  if (typeof paidTier?.id === "string" && paidTier.id.trim()) {
    return paidTier.id;
  }

  const ineligible = Array.isArray(payload?.ineligibleTiers) && payload.ineligibleTiers.length > 0;
  if (!ineligible) {
    const currentTier = payload?.currentTier;
    if (typeof currentTier?.name === "string" && currentTier.name.trim()) {
      return currentTier.name;
    }
    if (typeof currentTier?.id === "string" && currentTier.id.trim()) {
      return currentTier.id;
    }
  }

  if (Array.isArray(payload?.allowedTiers) && payload.allowedTiers.length > 0) {
    const preferred = payload.allowedTiers.find((t: any) => t.is_default === true) ?? payload.allowedTiers[0];
    if (typeof preferred?.name === "string" && preferred.name.trim()) {
      return ineligible ? `${preferred.name} (Restricted)` : preferred.name;
    }
    if (typeof preferred?.id === "string" && preferred.id.trim()) {
      return ineligible ? `${preferred.id} (Restricted)` : preferred.id;
    }
  }

  return null;
}

export async function antigravityUsage(credential: any): Promise<AntigravityUsage> {
  const account = await antigravityAuthService.ensure(credential.id);
  if (!account.access_token)
    throw new Error("Antigravity account is not ready");
  const fingerprint = antigravityAuthService.fingerprint(account);
  const hubUa = buildHubUserAgent();

  const summaryPayload = account.project_id ? { project: account.project_id } : {};
  const summary = await callCloudCodeWithFallback(
    QUOTA_SUMMARY_ENDPOINTS,
    account.access_token,
    fingerprint,
    summaryPayload,
    hubUa,
  );

  const modelsResponse = await callCloudCodeWithFallback(
    AVAILABLE_MODELS_ENDPOINTS,
    account.access_token,
    fingerprint,
    summaryPayload,
    hubUa,
  );

  if (summary.status !== 200 && modelsResponse.status !== 200) {
    throw new Error(
      modelsResponse.data?.error?.message ||
        modelsResponse.data?.message ||
        summary.data?.error?.message ||
        summary.data?.message ||
        modelsResponse.text ||
        summary.text ||
        `Antigravity quota failed (${modelsResponse.status || summary.status})`,
    );
  }

  const summaryGroups = summary.status === 200 ? groupsFromSummary(summary.data) : [];
  const modelResult = groupsFromModels(
    modelsResponse.data?.models ?? modelsResponse.data?.availableModels,
  );

  const groups = summaryGroups.length > 0 ? summaryGroups : modelResult.groups;

  // Synthesize Gemini 4 Argon model if missing from models catalog
  populateSyntheticArgonModels(modelResult.models, groups);

  const tiers = await callCloudCodeWithFallback(
    CODE_ASSIST_ENDPOINTS,
    account.access_token,
    fingerprint,
    {
      metadata: {
        ideType: fingerprint.ideType || "ANTIGRAVITY",
        platform: "PLATFORM_UNSPECIFIED",
        pluginType: "GEMINI",
      },
    },
    hubUa,
  );

  const plan = tiers.status === 200 ? resolveSubscriptionTier(tiers.data) : null;

  const usage: AntigravityUsage = {
    fetched_at: new Date().toISOString(),
    plan,
    groups: groups.sort((a, b) => groupSortKey(a.group_name) - groupSortKey(b.group_name)),
    models: modelResult.models,
  };

  credentialService.update(credential.id, {
    quota_json: JSON.stringify(usage),
  });
  return usage;
}

function formatDuration(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
export async function antigravityTest(model: string, credential: any) {
  const response = await antigravityResponses(
    {
      messages: [{ role: "user", content: "Say 'ok' and nothing else." }],
      stream: true,
    },
    model,
    credential,
  );
  const text = await response.text();
  if (!text.includes("data:"))
    throw new Error("Antigravity returned an empty response");
  return text;
}
