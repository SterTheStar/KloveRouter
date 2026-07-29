import { logger } from "../../logger";
import { credentialService } from "../../services/credential.service";

const DEFAULT_BASE_URL = "https://www.codebuff.com";
const AGENTS_URL =
  "https://raw.githubusercontent.com/CodebuffAI/codebuff/main/common/src/constants/free-agents.ts";
const MODEL_SOURCES = [
  "https://raw.githubusercontent.com/CodebuffAI/codebuff/main/common/src/constants/freebuff-models.ts",
  "https://raw.githubusercontent.com/CodebuffAI/codebuff/main/common/src/constants/freebuff-model-ids.ts",
  "https://raw.githubusercontent.com/CodebuffAI/codebuff/main/common/src/constants/model-config.ts",
];
const CLI_USER_AGENT = "Freebuff-CLI/0.0.95";
const CHAT_USER_AGENT = "ai-sdk/openai-compatible/0.0.95/codebuff";
const BUN_USER_AGENT = "Bun/1.3.11";

type FreebuffCredential = {
  id: string;
  secret?: string | null;
  fingerprint_json?: string | null;
};

type Session = {
  instanceId: string;
  status?: string;
  model?: string;
  accessTier?: string;
  countryCode?: string;
  countryBlockReason?: string;
  remainingMs?: number;
  rateLimit?: unknown;
  rateLimitsByModel?: unknown;
  admittedAt?: string;
  expiresAt?: number;
  requestedModel?: string;
  fallbackFrom?: string;
  lastUsedAt: number;
  inFlight: number;
  credential: FreebuffCredential;
  endpoint: string;
};

const sessions = new Map<string, Session>();
const sessionLocks = new Map<string, Promise<Session>>();
const usageSnapshots = new Map<string, { fetchedAt: number; value: any }>();
const USAGE_REFRESH_INTERVAL = 10 * 60 * 1000;
const SESSION_IDLE_TIMEOUT = 10 * 60 * 1000;

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [credentialId, session] of sessions) {
    if (
      session.inFlight === 0 &&
      now - session.lastUsedAt > SESSION_IDLE_TIMEOUT
    ) {
      void endSession(session.credential, session.endpoint).catch((error) =>
        logger.warn("Freebuff idle session cleanup failed", {
          credential_id: credentialId,
          error: String(error),
        }),
      );
    }
  }
}, 60_000);
cleanupTimer.unref?.();

function tokenOf(credential: FreebuffCredential) {
  if (!credential.secret) throw new Error("Freebuff token is not configured");
  return credential.secret;
}

function baseUrl(url?: string) {
  return (url || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

async function request(
  credential: FreebuffCredential,
  url: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${tokenOf(credential)}`);
  headers.set("x-codebuff-api-key", tokenOf(credential));
  if (!headers.has("User-Agent")) headers.set("User-Agent", CLI_USER_AGENT);
  if (!headers.has("Accept")) headers.set("Accept", "*/*");
  const metadata = credentialMetadata(credential);
  if (metadata.fingerprintId) headers.set("x-freebuff-fingerprint-id", metadata.fingerprintId);
  if (metadata.fingerprintHash) headers.set("x-freebuff-fingerprint-hash", metadata.fingerprintHash);
  headers.set("x-freebuff-acting-user-id", metadata.userId || credential.id);
  const retryable = new Set([408, 429, 500, 502, 503, 504]);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { ...init, headers });
      if (!retryable.has(response.status) || attempt === 2) return response;
      await response.body?.cancel().catch(() => {});
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(10_000, 1_000 * 2 ** attempt)));
  }
  throw lastError instanceof Error ? lastError : new Error("Freebuff request failed");
}

function credentialMetadata(credential: FreebuffCredential) {
  try {
    const parsed = credential.fingerprint_json
      ? JSON.parse(credential.fingerprint_json)
      : {};
    return {
      userId: parsed.userId as string | undefined,
      fingerprintId: parsed.fingerprintId as string | undefined,
      fingerprintHash: parsed.fingerprintHash as string | undefined,
      instanceId: parsed.instanceId as string | undefined,
    };
  } catch {
    return {};
  }
}

function instanceIdFor(credential: FreebuffCredential) {
  return credentialMetadata(credential).instanceId || `klove-${credential.id}`;
}

async function persistInstanceId(credential: FreebuffCredential, instanceId: string) {
  const metadata = credentialMetadata(credential);
  if (metadata.instanceId === instanceId) return;
  const fingerprint_json = JSON.stringify({
    ...credentialMetadata(credential),
    instanceId,
  });
  credential.fingerprint_json = fingerprint_json;
  credentialService.update(credential.id, { fingerprint_json });
}

async function jsonError(response: Response, action: string) {
  const text = await response.text().catch(() => "");
  throw new Error(`${action} failed (${response.status}): ${text.slice(0, 1000)}`);
}

async function createSession(
  credential: FreebuffCredential,
  endpoint: string,
  model: string,
): Promise<Session> {
  let response = await request(credential, `${baseUrl(endpoint)}/api/v1/freebuff/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": CLI_USER_AGENT,
      "x-freebuff-model": model,
    },
    body: "{}",
  });
  if (response.status === 409) {
    const locked = (await response.json().catch(() => null)) as {
      status?: string;
      currentModel?: string;
    } | null;
    if (locked?.status === "model_locked" && locked.currentModel && locked.currentModel !== model) {
      await endSession(credential, baseUrl(endpoint));
      response = await request(credential, `${baseUrl(endpoint)}/api/v1/freebuff/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": CLI_USER_AGENT,
          "x-freebuff-model": model,
        },
        body: "{}",
      });
    } else {
      throw new Error(`Freebuff session model locked (${response.status})`);
    }
  }
  if (response.status === 404)
    return {
      instanceId: "",
      status: "disabled",
      model,
      lastUsedAt: Date.now(),
      inFlight: 0,
      credential,
      endpoint: baseUrl(endpoint),
    };
  if (!response.ok) await jsonError(response, "Freebuff session");
  const state = (await response.json()) as any;
  if (state.status === "queued") {
    const polled = await pollSession(credential, endpoint, state);
    if (polled) return polled;
    throw new Error("Freebuff waiting room did not become active");
  }
  if (state.status !== "active" || !state.instanceId)
    throw new Error("Freebuff session did not become active");
  const expiresAt = state.expiresAt ? Date.parse(state.expiresAt) : undefined;
  const session: Session = {
    instanceId: state.instanceId,
    status: state.status,
    model: state.model ?? model,
    accessTier: state.accessTier,
    countryCode: state.countryCode,
    countryBlockReason: state.countryBlockReason,
    remainingMs: state.remainingMs,
    rateLimit: state.rateLimit,
    rateLimitsByModel: state.rateLimitsByModel,
    admittedAt: state.admittedAt,
    expiresAt,
    requestedModel: model,
    lastUsedAt: Date.now(),
    inFlight: 0,
    credential,
    endpoint: baseUrl(endpoint),
  } satisfies Session;
  sessions.set(credential.id, session);
  await persistInstanceId(credential, state.instanceId);
  return session;
}

async function pollSession(
  credential: FreebuffCredential,
  endpoint: string,
  state: any,
): Promise<Session | null> {
  const upstream = baseUrl(endpoint);
  const deadline = Date.now() + 5 * 60_000;
  for (let attempt = 0; Date.now() < deadline; attempt++) {
    const waitMs = state.status === "queued"
      ? 5_000
      : Math.max(1_000, Math.min(Number(state.remainingMs || 5_000), 30_000));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    const poll = await request(credential, `${upstream}/api/v1/freebuff/session`, {
      method: "GET",
      headers: { "User-Agent": CLI_USER_AGENT, "x-freebuff-instance-id": state.instanceId || "" },
    });
    if (!poll.ok) {
      if (poll.status === 401) continue;
      return null;
    }
    const next = (await poll.json()) as any;
    if (next.status === "active" && next.instanceId) {
      const expiresAt = next.expiresAt ? Date.parse(next.expiresAt) : undefined;
      const session: Session = {
        instanceId: next.instanceId,
        status: next.status,
        model: next.model ?? state.requestedModel,
        accessTier: next.accessTier,
        countryCode: next.countryCode,
        expiresAt,
        requestedModel: state.requestedModel,
        lastUsedAt: Date.now(),
        inFlight: 0,
        credential,
        endpoint: upstream,
      };
      sessions.set(credential.id, session);
      await persistInstanceId(credential, next.instanceId);
      return session;
    }
    state = next;
    if (["country_blocked", "banned", "model_locked", "model_unavailable", "rate_limited", "disabled"].includes(next.status))
      throw new Error(`Freebuff session ${next.status}`);
  }
  return null;
}

async function ensureSession(
  credential: FreebuffCredential,
  endpoint: string,
  model: string,
): Promise<Session> {
  const lockKey = `${credential.id}:${model}`;
  const existing = sessionLocks.get(lockKey);
  if (existing) return existing;
  const operation = (async (): Promise<Session> => {
    const cached = sessions.get(credential.id);
    if (
      cached &&
      cached.model === model &&
      cached.status === "active" &&
      (!cached.expiresAt || cached.expiresAt > Date.now() + 5000)
    )
      return cached;
    if (cached?.inFlight && cached.model !== model)
      throw new Error(`Freebuff credential is busy with model ${cached.model}`);
    if (cached?.instanceId) await endSession(credential, endpoint);
    return createSession(credential, endpoint, model);
  })();
  sessionLocks.set(lockKey, operation);
  try {
    return await operation;
  } finally {
    if (sessionLocks.get(lockKey) === operation) sessionLocks.delete(lockKey);
  }
}

function isModelLockError(status: number, body: string) {
  return (
    status === 409 ||
    status === 426 ||
    /model_locked|session_model_mismatch|currentModel/i.test(body)
  );
}

function lockedModelFrom(body: string) {
  try {
    const parsed = JSON.parse(body);
    return (
      parsed?.currentModel ||
      parsed?.model ||
      parsed?.error?.currentModel ||
      parsed?.error?.model ||
      null
    );
  } catch {
    return body.match(/(?:currentModel|model)["'\s:]+([\w./:-]+)/i)?.[1] ?? null;
  }
}

async function endSession(credential: FreebuffCredential, endpoint: string) {
  const current = sessions.get(credential.id);
  const response = await request(
    credential,
    `${baseUrl(endpoint)}/api/v1/freebuff/session`,
    {
      method: "DELETE",
      headers: {
        "User-Agent": CLI_USER_AGENT,
        "x-freebuff-instance-id": current?.instanceId || instanceIdFor(credential),
      },
    },
  );
  if (!response.ok && response.status !== 404)
    await jsonError(response, "Freebuff session unlock");
  sessions.delete(credential.id);
  await response.body?.cancel().catch(() => {});
  return { unlocked: true };
}

async function startRun(credential: FreebuffCredential, endpoint: string, agentId: string, ancestorRunIds: string[] = []) {
  const response = await request(credential, `${baseUrl(endpoint)}/api/v1/agent-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": BUN_USER_AGENT },
    body: JSON.stringify({ action: "START", agentId, ancestorRunIds }),
  });
  if (!response.ok) await jsonError(response, "Freebuff run");
  const body = (await response.json()) as { runId?: string };
  if (!body.runId) throw new Error("Freebuff run response missing runId");
  return body.runId;
}

async function recordRunStep(
  credential: FreebuffCredential,
  endpoint: string,
  runId: string,
  stepNumber: number,
  childRunIds: string[],
  messageId: string | null,
  startTime: string,
) {
  const response = await request(
    credential,
    `${baseUrl(endpoint)}/api/v1/agent-runs/${runId}/steps`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": BUN_USER_AGENT },
      body: JSON.stringify({
        stepNumber,
        credits: 0,
        childRunIds,
        messageId,
        status: "completed",
        startTime,
      }),
    },
  );
  if (!response.ok)
    logger.warn("Freebuff run step failed", { status: response.status });
  await response.body?.cancel().catch(() => {});
}

async function finishRun(credential: FreebuffCredential, endpoint: string, runId: string, totalSteps: number) {
  const response = await request(credential, `${baseUrl(endpoint)}/api/v1/agent-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": BUN_USER_AGENT },
    body: JSON.stringify({
      action: "FINISH",
      runId,
      status: "completed",
      totalSteps,
      directCredits: 0,
      totalCredits: 0,
    }),
  });
  if (!response.ok) logger.warn("Freebuff run finish failed", { status: response.status });
  await response.body?.cancel().catch(() => {});
}

async function startRunChain(
  credential: FreebuffCredential,
  endpoint: string,
  agentId: string,
): Promise<{ runId: string; startedAt: string; childRunId: string }> {
  const upstream = baseUrl(endpoint);
  const startedAt = new Date().toISOString();
  const runId = await startRun(credential, upstream, agentId, []);
  await recordRunStep(credential, upstream, runId, 1, [], null, startedAt);
  return { runId, startedAt, childRunId: "" };
}

async function finalizeRunChain(
  credential: FreebuffCredential,
  endpoint: string,
  runId: string,
  startedAt: string,
  messageId: string | null,
) {
  await recordRunStep(credential, baseUrl(endpoint), runId, 2, [], messageId, startedAt);
  await finishRun(credential, baseUrl(endpoint), runId, 2);
}

function clientSessionId() {
  return "freebuff-proxy-" + crypto.randomUUID().replace(/-/g, "").substring(0, 16);
}

const FREEBUFF_ROOT_AGENT_BY_MODEL: Record<string, string> = {
  "deepseek/deepseek-v4-pro": "base2-free-deepseek",
  "deepseek/deepseek-v4-flash": "base2-free-deepseek-flash",
  "minimax/minimax-m2.7": "base2-free",
  "minimax/minimax-m3": "base2-free-minimax-m3",
  "moonshotai/kimi-k2.6": "base2-free-kimi",
  "moonshotai/kimi-k2.7": "base2-free-kimi",
  "moonshotai/kimi-k2.7-code": "base2-free-kimi",
  "mimo/mimo-v2.5-pro": "base2-free-mimo-pro",
  "mimo/mimo-v2.5": "base2-free-mimo",
  "z-ai/glm-5.2": "base2-free-glm",
  "crof/glm-5.2": "base2-free-glm-crof",
  "poolside/laguna-s-2.1": "base2-free-laguna-s-2-1",
  "openrouter/poolside/laguna-s-2.1": "base2-free-laguna-s-2-1-openrouter",
  "inclusionai/ling-3.0-flash:free": "base2-free-ling-3-flash",
};

const FREEBUFF_ROOT_AGENT_IDS = new Set([
  "base2-free",
  "base2-free-kimi",
  "base2-free-deepseek",
  "base2-free-deepseek-flash",
  "base2-free-mimo-pro",
  "base2-free-mimo",
  "base2-free-minimax-m3",
  "base2-free-glm",
  "base2-free-glm-crof",
  "base2-free-laguna-s-2-1",
  "base2-free-laguna-s-2-1-openrouter",
  "base2-free-ling-3-flash",
]);

function freebuffRootAgent(model: string) {
  const agent = FREEBUFF_ROOT_AGENT_BY_MODEL[model];
  if (!agent || !FREEBUFF_ROOT_AGENT_IDS.has(agent))
    throw new Error(`Freebuff model has no supported root agent: ${model}`);
  return agent;
}

async function preRequestChain(
  credential: FreebuffCredential,
  endpoint: string,
  messages: any[],
) {
  const upstream = baseUrl(endpoint);
  try {
    await request(credential, `${upstream}/api/agents/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": BUN_USER_AGENT },
      body: JSON.stringify({}),
    });
  } catch {}
  try {
    await request(credential, `${upstream}/api/v1/ads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": CLI_USER_AGENT },
      body: JSON.stringify({
        provider: "gravity",
        messages,
        device: { os: "windows", timezone: "Asia/Shanghai", locale: "zh-CN" },
        userAgent: BUN_USER_AGENT,
      }),
    });
  } catch {}
  try {
    await request(credential, `${upstream}/api/v1/freebuff/streak`, {
      method: "GET",
      headers: { "User-Agent": BUN_USER_AGENT },
    });
  } catch {}
}

export async function freebuffResponses(
  body: any,
  model: string,
  credential: FreebuffCredential,
  endpoint?: string,
) {
  const upstream = baseUrl(endpoint);
  let session = await ensureSession(credential, upstream, model);
  const activeModel = session.model || model;
  const agentId = freebuffRootAgent(activeModel);
  session.lastUsedAt = Date.now();
  session.inFlight += 1;
  const run = await startRunChain(credential, upstream, agentId);
  const payload = structuredClone(body);
  payload.model = activeModel;
  payload.stream = body.stream ?? false;
  const codebuffMetadata = {
    ...(payload.codebuff_metadata || {}),
    run_id: run.runId,
    // cost_mode intentionally omitted to bypass CLI-only check
    client_id: clientSessionId(),
    trace_session_id: crypto.randomUUID(),
    ...(session.instanceId ? { freebuff_instance_id: session.instanceId } : {}),
  };
  payload.codebuff = {
    ...(payload.codebuff || {}),
    codebuff_metadata: codebuffMetadata,
    provider: {
      ...(payload.codebuff?.provider || {}),
      order: [],
      allow_fallbacks: true,
    },
  };
  payload.codebuff_metadata = codebuffMetadata;
  payload.provider = { ...(payload.provider || {}), data_collection: "deny" };
  let messageId: string | null = null;
  const finalize = () => finalizeRunChain(credential, upstream, run.runId, run.startedAt, messageId).catch(() => {});
  try {
    let response = await request(credential, `${upstream}/api/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": CHAT_USER_AGENT },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      if (isModelLockError(response.status, text)) {
        const lockedModel = lockedModelFrom(text);
        await endSession(credential, upstream).catch(() => {});
        if (lockedModel && lockedModel !== model) {
          session = await ensureSession(credential, upstream, lockedModel);
          session.inFlight += 1;
          session.lastUsedAt = Date.now();
          payload.model = lockedModel;
            const fallbackMetadata = {
              ...codebuffMetadata,
              freebuff_instance_id: session.instanceId,
              fallback_from_model: model,
            };
            payload.codebuff.codebuff_metadata = fallbackMetadata;
            payload.codebuff_metadata = fallbackMetadata;
          response = await request(credential, `${upstream}/api/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": CHAT_USER_AGENT },
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            const retryText = await response.text().catch(() => "");
            throw new Error(`Freebuff fallback request failed (${response.status}): ${retryText.slice(0, 1000)}`);
          }
          session.fallbackFrom = model;
        } else {
          throw new Error(`Freebuff model lock (${response.status}): ${text.slice(0, 1000)}`);
        }
      } else {
        throw new Error(`Freebuff request failed (${response.status}): ${text.slice(0, 1000)}`);
      }
    }
    if (!payload.stream) {
      const result = await response.json();
      messageId = result?.id ?? null;
      await finalize();
      session.inFlight = Math.max(0, session.inFlight - 1);
      session.lastUsedAt = Date.now();
      return new Response(JSON.stringify(result), { status: response.status, headers: { "content-type": "application/json" } });
    }
    return new Response(
      new ReadableStream({
        async start(controller) {
          try {
            const reader = response.body?.getReader();
            if (!reader) throw new Error("Freebuff returned an empty response");
            while (true) {
              const part = await reader.read();
              if (part.value) {
                const chunk = new TextDecoder().decode(part.value);
                if (!messageId) {
                  const m = chunk.match(/"id"\s*:\s*"([^"]+)"/);
                  if (m) messageId = m[1];
                }
                controller.enqueue(part.value);
              }
              if (part.done) break;
            }
          } catch (error) {
            controller.error(error);
          } finally {
            await finalize();
            session.inFlight = Math.max(0, session.inFlight - 1);
            session.lastUsedAt = Date.now();
            controller.close();
          }
        },
      }),
      { headers: response.headers },
    );
  } catch (error) {
    await finalize();
    session.inFlight = Math.max(0, session.inFlight - 1);
    session.lastUsedAt = Date.now();
    throw error;
  }
}

export async function freebuffUnlock(
  credential: FreebuffCredential,
  endpoint?: string,
) {
  return endSession(credential, baseUrl(endpoint));
}

export async function freebuffUsage(
  credential: FreebuffCredential,
  endpoint?: string,
  model = "deepseek/deepseek-v4-flash",
) {
  const upstream = baseUrl(endpoint);
  const usageHeaders = new Headers({
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": CLI_USER_AGENT,
  });
  const usageMetadata = credentialMetadata(credential);
  if (usageMetadata.fingerprintId)
    usageHeaders.set("x-freebuff-fingerprint-id", usageMetadata.fingerprintId);
  const usageResponse = await fetch(`${upstream}/api/v1/usage`, {
    method: "POST",
    headers: usageHeaders,
    body: JSON.stringify({
      fingerprintId: usageMetadata.fingerprintId || "cli-usage",
      authToken: tokenOf(credential),
    }),
  }).catch(() => null);
  if (usageResponse?.ok) {
    const usage = await usageResponse.json().catch(() => null);
    if (usage && typeof usage === "object") {
      const value = { authenticated: true, ...usage, model, status: "usage" };
      usageSnapshots.set(credential.id, { fetchedAt: Date.now(), value });
      return value;
    }
  }
  const cached = sessions.get(credential.id);
  const snapshot = usageSnapshots.get(credential.id);
  if (!cached && snapshot)
    return {
      ...snapshot.value,
      status: "none",
      instance_id: null,
      instanceId: null,
      expires_at: null,
      remaining_ms: null,
      usage_cached_at: new Date(snapshot.fetchedAt).toISOString(),
      usage_cache_stale:
        Date.now() - snapshot.fetchedAt >= USAGE_REFRESH_INTERVAL,
    };

  const session = cached;
  if (!session?.instanceId) {
    const value = {
      authenticated: true,
      status: "none",
      model,
      instance_id: null,
      access_tier: null,
      country_code: null,
      country_block_reason: null,
      remaining_ms: null,
      rate_limits_by_model: null,
      expires_at: null,
      requested_model: model,
      fallback_from_model: null,
      usage_cached_at: null,
      usage_cache_stale: false,
    };
    usageSnapshots.set(credential.id, { fetchedAt: Date.now(), value });
    return value;
  }
  const response = await request(credential, `${upstream}/api/v1/freebuff/session`, {
    method: "GET",
    headers: {
      "User-Agent": CLI_USER_AGENT,
      "x-freebuff-model": model,
      "x-freebuff-instance-id": session.instanceId,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) await jsonError(response, "Freebuff session status");
  const state = payload as any;
  const previous = sessions.get(credential.id);
  const merged = {
    ...(previous ?? {}),
    ...(state ?? {}),
    rateLimit: state?.rateLimit ?? previous?.rateLimit ?? null,
    rateLimitsByModel:
      state?.rateLimitsByModel ?? previous?.rateLimitsByModel ?? null,
  };
  const modelLimits = merged.rateLimitsByModel as Record<string, any> | null;
  if (!merged.rateLimit && modelLimits) {
    const preferred = modelLimits[model] ?? Object.values(modelLimits)[0];
    if (preferred) merged.rateLimit = preferred;
  }
  const expiresAt = merged?.expiresAt ? Date.parse(merged.expiresAt) : undefined;
  if (merged?.instanceId)
    sessions.set(credential.id, {
      instanceId: merged.instanceId,
      status: merged.status,
      model: merged.model ?? model,
      accessTier: merged.accessTier,
      countryCode: merged.countryCode,
      countryBlockReason: merged.countryBlockReason,
      remainingMs: merged.remainingMs,
      rateLimit: merged.rateLimit,
      rateLimitsByModel: merged.rateLimitsByModel,
      admittedAt: merged.admittedAt,
      expiresAt,
      requestedModel: model,
      fallbackFrom: (sessions.get(credential.id) as Session | undefined)?.fallbackFrom,
      lastUsedAt: Date.now(),
       inFlight: session.inFlight,
      credential,
      endpoint: upstream,
    });
  const value = {
    authenticated: true,
    ...merged,
    rate_limit: merged.rateLimit,
    instance_id: merged?.instanceId ?? null,
    access_tier: merged?.accessTier ?? null,
    country_code: merged?.countryCode ?? null,
    country_block_reason: merged?.countryBlockReason ?? null,
    remaining_ms: merged?.remainingMs ?? null,
    rate_limits_by_model: merged?.rateLimitsByModel ?? null,
    expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    requested_model: model,
    fallback_from_model: sessions.get(credential.id)?.fallbackFrom ?? null,
  };
  usageSnapshots.set(credential.id, { fetchedAt: Date.now(), value });
  return value;
}

const fallbackModels = [
  "minimax/minimax-m2.7",
  "z-ai/glm-5.1",
  "google/gemini-2.5-flash-lite",
  "google/gemini-3.1-flash-lite-preview",
];

let modelAgents = new Map<string, string>();
let refreshedAt = 0;

export async function freebuffModels() {
  if (Date.now() - refreshedAt < 6 * 60 * 60 * 1000 && modelAgents.size)
    return [...modelAgents.keys()].sort().map((id) => ({ id, display_name: id }));
  try {
    const response = await fetch(AGENTS_URL, { headers: { Accept: "text/plain" } });
    if (!response.ok) throw new Error(`model source returned ${response.status}`);
    const source = await response.text();
    const relatedSources = await Promise.all(
      MODEL_SOURCES.map(async (url) => {
        const sourceResponse = await fetch(url, {
          headers: { Accept: "text/plain" },
        });
        if (!sourceResponse.ok)
          throw new Error(`model constants returned ${sourceResponse.status}`);
        return sourceResponse.text();
      }),
    );
    const constants = new Map<string, string>();
    const allSources = [source, ...relatedSources];
    for (const text of allSources) {
      for (const match of text.matchAll(
        /(?:export\s+)?const\s+([A-Z][A-Z0-9_]+)\s*=\s*(?:\n\s*)?'([^']+)'/g,
      ))
        constants.set(match[1], match[2]);
      for (const match of text.matchAll(
        /(?:export\s+)?const\s+([A-Za-z][A-Za-z0-9_]*)\s*=\s*['"]([^'"]+)['"]/g,
      ))
        constants.set(match[1], match[2]);
      for (const match of text.matchAll(
        /\b([A-Za-z][A-Za-z0-9_]*)\s*:\s*['"]([^'"]+)['"]/g,
      ))
        constants.set(match[1], match[2]);
    }
    for (let pass = 0; pass < 3; pass++) {
      for (const text of allSources) {
        for (const match of text.matchAll(
          /(?:export\s+)?const\s+([A-Za-z][A-Za-z0-9_]*)\s*=\s*([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+)/g,
        )) {
          const reference = match[2].split(".").at(-1)!;
          const value = constants.get(reference);
          if (value) constants.set(match[1], value);
        }
      }
    }
    const sets = new Map<string, string[]>();
    for (const text of allSources) {
      for (const match of text.matchAll(
        /(?:const|export\s+const)\s+([A-Za-z][A-Za-z0-9_]*)\s*=\s*new\s+Set\(\[([\s\S]*?)\]\)/g,
      )) {
        sets.set(match[1], resolveModelTokens(match[2], constants));
      }
    }
    const block = /'([^']+)'\s*:\s*new\s+Set\(\[([\s\S]*?)\]\)/g;
    const models = new Map<string, string>();
    for (const match of source.matchAll(block)) {
      for (const model of resolveModelTokens(match[2], constants, sets))
        models.set(model, match[1]);
    }
    for (const match of source.matchAll(
      /'([^']+)'\s*:\s*([A-Za-z][A-Za-z0-9_]*)/g,
    )) {
      for (const model of sets.get(match[2]) ?? []) models.set(model, match[1]);
    }
    if (!models.size) throw new Error("no free models found");
    modelAgents = models;
    refreshedAt = Date.now();
  } catch (error) {
    logger.warn("Freebuff model refresh failed; using fallback", { error: String(error) });
    modelAgents = new Map(fallbackModels.map((model) => [model, "base2-free"]));
  }
  return [...modelAgents.keys()].sort().map((id) => ({ id, display_name: id }));
}

function resolveModelTokens(
  expression: string,
  constants: Map<string, string>,
  sets = new Map<string, string[]>(),
) {
  const result: string[] = [];
  for (const match of expression.matchAll(/'([^']+)'|([A-Za-z][A-Za-z0-9_]*)/g)) {
    if (match[1]) result.push(match[1]);
    else {
      const set = sets.get(match[2]);
      if (set) result.push(...set);
      else {
        const value = constants.get(match[2]);
        if (value) result.push(value);
      }
    }
  }
  return result;
}

async function freebuffAgentForModel(model: string) {
  await freebuffModels();
  const agent = modelAgents.get(model);
  if (!agent) throw new Error(`Freebuff model not found: ${model}`);
  return agent;
}

function freebuffRootAgentForModel(model: string) {
  const roots: Record<string, string> = {
    "deepseek/deepseek-v4-pro": "base2-free-deepseek",
    "deepseek/deepseek-v4-flash": "base2-free-deepseek-flash",
    "minimax/minimax-m2.7": "base2-free",
    "minimax/minimax-m3": "base2-free-minimax-m3",
    "moonshotai/kimi-k2.6": "base2-free-kimi",
    "moonshotai/kimi-k2.7": "base2-free-kimi",
    "mimo/mimo-v2.5-pro": "base2-free-mimo-pro",
    "mimo/mimo-v2.5": "base2-free-mimo",
    "z-ai/glm-5.2": "base2-free-glm",
  };
  return roots[model] ?? "base2-free";
}
