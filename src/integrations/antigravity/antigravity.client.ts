import { credentialService } from "../../services/credential.service";
import {
  antigravityAuthService,
  discoverProject,
} from "./antigravity-auth.service";
import { getImpersonationHeaders } from "./antigravity.headers";
import { googleStreamToOpenAI, toGoogleBody } from "./antigravity.transform";
import {
  filterAntigravityModels,
  isBlockedAntigravityModel,
} from "./antigravity.models";
import { logger } from "../../logger";

const ENDPOINT =
  "https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse";
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
  if (!credential.access_token || !credential.project_id)
    throw new Error("Antigravity account has no access token or project");
  const fingerprint = antigravityAuthService.fingerprint(credential);
  const headers = getImpersonationHeaders(
    credential.access_token,
    fingerprint,
    model,
  );
  const payload = JSON.stringify(
    await toGoogleBody({ ...body, model }, credential.project_id),
  );
  let response: Response | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const requestStarted = performance.now();
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers,
        body: payload,
      });
      logger.debug("Antigravity response headers received", {
        model,
        attempt: attempt + 1,
        duration_ms: Math.round(performance.now() - requestStarted),
        status: response.status,
      });
      if (response.status < 500) break;
      lastError = new Error(`Antigravity upstream returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt === 0) await Bun.sleep(350);
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

export async function antigravityModels(credential: any) {
  const account = await antigravityAuthService.ensure(credential.id);
  if (!account.access_token || !account.project_id)
    throw new Error("Antigravity account is not ready");

  const fingerprint = antigravityAuthService.fingerprint(account);
  const endpoints = [
    "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
    "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
  ];
  let lastError = "";
  for (const endpoint of endpoints) {
    const headers = {
      ...getImpersonationHeaders(account.access_token, fingerprint),
      "User-Agent": "antigravity",
    };
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ project: account.project_id }),
    });
    const text = await response.text().catch(() => "");
    const data = (() => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })();
    if (response.ok) {
      const raw = data?.availableModels ?? data?.models ?? [];
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
      lastError = "Antigravity returned no available models";
      continue;
    }
    lastError =
      data?.error?.message ||
      data?.message ||
      text ||
      `HTTP ${response.status}`;
    if (response.status === 401) {
      throw new Error(
        `Antigravity authentication failed while syncing models: ${lastError}`,
      );
    }
  }
  throw new Error(`Antigravity models request failed: ${lastError}`);
}

const CLOUDCODE_HOSTS = [
  "https://daily-cloudcode-pa.googleapis.com",
  "https://cloudcode-pa.googleapis.com",
];

async function cloudCodePost(
  endpoint: string,
  token: string,
  fingerprint: ReturnType<typeof antigravityAuthService.fingerprint>,
  body: unknown,
): Promise<{ data: any; text: string; status: number }> {
  const response = await fetch(`${CLOUDCODE_HOSTS[0]}/v1internal:${endpoint}`, {
    method: "POST",
    headers: {
      ...getImpersonationHeaders(token, fingerprint),
      "User-Agent": "antigravity",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text().catch(() => "");
  const data = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();
  return { data, text, status: response.status };
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
  return { groups: [], models };
}

export async function antigravityUsage(credential: any): Promise<AntigravityUsage> {
  const account = await antigravityAuthService.ensure(credential.id);
  if (!account.access_token || !account.project_id)
    throw new Error("Antigravity account is not ready");
  const fingerprint = antigravityAuthService.fingerprint(account);
  let plan: string | null = null;

  const summary = await cloudCodePost(
    "retrieveUserQuotaSummary",
    account.access_token,
    fingerprint,
    { project: account.project_id },
  );
  const modelsResponse = await cloudCodePost(
    "fetchAvailableModels",
    account.access_token,
    fingerprint,
    { project: account.project_id },
  );
  if (summary.status !== 200 && modelsResponse.status !== 200)
    throw new Error(
      modelsResponse.data?.error?.message ||
        modelsResponse.data?.message ||
        modelsResponse.text ||
        `Antigravity quota failed (${modelsResponse.status})`,
    );
  const groups = summary.status === 200 ? groupsFromSummary(summary.data) : [];
  const fallback = groupsFromModels(
    modelsResponse.data?.models ?? modelsResponse.data?.availableModels,
  );

  const tiers = await cloudCodePost("loadCodeAssist", account.access_token, fingerprint, {
    metadata: {
      ideType: fingerprint.ideType,
      platform: "PLATFORM_UNSPECIFIED",
      pluginType: "GEMINI",
    },
  });
  if (tiers.status === 200)
    plan =
      tiers.data?.paidTier?.name ||
      tiers.data?.paidTier?.id ||
      tiers.data?.currentTier?.name ||
      tiers.data?.currentTier?.id ||
      null;

  const usage: AntigravityUsage = {
    fetched_at: new Date().toISOString(),
    plan,
    groups: groups.sort((a, b) => groupSortKey(a.group_name) - groupSortKey(b.group_name)),
    models: fallback.models,
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
