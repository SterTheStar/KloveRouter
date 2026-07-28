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
  "https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse";
export type AntigravityQuota = {
  group_name: string;
  limit_name: string;
  remaining_fraction: number;
  used_percent: number;
  reset_at: string | null;
  reset_in: string | null;
  model_ids: string[];
}[];
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
export async function antigravityModels(credential: any) {
  const account = await antigravityAuthService.ensure(credential.id);
  if (!account.access_token || !account.project_id)
    throw new Error("Antigravity account is not ready");

  const fingerprint = antigravityAuthService.fingerprint(account);
  const endpoints = [
    "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
    "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
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
          .map((m: any) => ({
            ...m,
            id: m.id,
            display_name: m.display_name || m.id,
          })),
      );
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

export async function antigravityUsage(
  credential: any,
): Promise<AntigravityQuota> {
  const account = await antigravityAuthService.ensure(credential.id);
  if (!account.access_token || !account.project_id)
    throw new Error("Antigravity account is not ready");
  const fingerprint = antigravityAuthService.fingerprint(account);
  const response = await fetch(
    "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
    {
      method: "POST",
      headers: {
        ...getImpersonationHeaders(account.access_token, fingerprint),
        "User-Agent": "antigravity",
      },
      body: JSON.stringify({ project: account.project_id }),
    },
  );
  const text = await response.text().catch(() => "");
  const data = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();
  if (!response.ok)
    throw new Error(
      data?.error?.message ||
        data?.message ||
        text ||
        `Antigravity quota failed (${response.status})`,
    );
  const raw = data?.availableModels ?? data?.models ?? [];
  const entries = Array.isArray(raw)
    ? raw.map((item: any) => ({
        id: item.model?.name || item.name || item.displayName,
        item,
      }))
    : Object.entries(raw).map(([id, item]: any) => ({
        id: id.replace(/^models\//, ""),
        item,
      }));
  const groups = new Map<string, AntigravityQuota[number]>();
  for (const entry of entries) {
    const info = entry.item?.quotaInfo;
    if (!info) continue;
    const groupName =
      entry.item?.displayMetadata?.label ||
      entry.item?.displayName ||
      entry.id ||
      "Antigravity";
    if (
      isBlockedAntigravityModel(entry.id || "") ||
      isBlockedAntigravityModel(groupName)
    )
      continue;
    const limitName = info.limitName || groupName;
    const remaining = Math.max(
      0,
      Math.min(1, Number(info.remainingFraction ?? 0)),
    );
    const resetRaw =
      info.quotaResetTime ||
      entry.item?.quotaResetTime ||
      info.resetTime ||
      entry.item?.resetTime;
    let resetAt: string | null = null;
    if (typeof resetRaw === "number")
      resetAt = new Date(
        resetRaw < 10_000_000_000 ? resetRaw * 1000 : resetRaw,
      ).toISOString();
    else if (typeof resetRaw === "string" && /^\d+(\.\d+)?s$/.test(resetRaw))
      resetAt = new Date(
        Date.now() + Number.parseFloat(resetRaw) * 1000,
      ).toISOString();
    else if (
      typeof resetRaw === "string" &&
      !Number.isNaN(new Date(resetRaw).getTime())
    )
      resetAt = new Date(resetRaw).toISOString();
    const resetIn = resetAt
      ? formatDuration(Math.max(0, new Date(resetAt).getTime() - Date.now()))
      : null;
    const existing = groups.get(limitName);
    if (existing) {
      existing.remaining_fraction = Math.min(
        existing.remaining_fraction,
        remaining,
      );
      existing.used_percent = Math.round(
        (1 - existing.remaining_fraction) * 100,
      );
      if (
        entry.id &&
        !isBlockedAntigravityModel(entry.id) &&
        !existing.model_ids.includes(entry.id)
      )
        existing.model_ids.push(entry.id);
    } else
      groups.set(limitName, {
        group_name: groupName,
        limit_name: limitName,
        remaining_fraction: remaining,
        used_percent: Math.round((1 - remaining) * 100),
        reset_at: resetAt,
        reset_in: resetIn,
        model_ids: entry.id ? [entry.id] : [],
      });
  }
  const quota = [...groups.values()].sort((a, b) =>
    a.group_name.localeCompare(b.group_name),
  );
  credentialService.update(credential.id, {
    quota_json: JSON.stringify(quota),
  });
  return quota;
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
