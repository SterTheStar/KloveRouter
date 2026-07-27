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
const CLI_USER_AGENT = "Freebuff-CLI/0.0.105";
const CHAT_USER_AGENT = "ai-sdk/openai-compatible/0.0.0-test/codebuff ai-sdk/provider-utils/3.0.20 runtime/browser";
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
  if (!headers.has("User-Agent")) headers.set("User-Agent", CLI_USER_AGENT);
  if (!headers.has("Accept")) headers.set("Accept", "application/json, text/event-stream");
  return fetch(url, { ...init, headers });
}

function credentialMetadata(credential: FreebuffCredential) {
  try {
    const parsed = credential.fingerprint_json
      ? JSON.parse(credential.fingerprint_json)
      : {};
    return {
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
  const current = sessions.get(credential.id);
  if (
    current &&
    current.model === model &&
    (!current.expiresAt || current.expiresAt > Date.now() + 5000)
  )
    return current;

  let response = await request(credential, `${baseUrl(endpoint)}/api/v1/freebuff/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": CLI_USER_AGENT,
      "x-freebuff-instance-id": instanceIdFor(credential),
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
      // A limited account can only have one active model session. When the
      // requested model differs, explicitly switch sessions instead of
      // silently sending the request to the currently locked model.
      await endSession(credential, baseUrl(endpoint));
      response = await request(credential, `${baseUrl(endpoint)}/api/v1/freebuff/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": CLI_USER_AGENT,
          "x-freebuff-instance-id": instanceIdFor(credential),
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
  const state = (await response.json()) as {
    status?: string;
    instanceId?: string;
    expiresAt?: string;
    estimatedWaitMs?: number;
    position?: number;
    queueDepth?: number;
  };
  if (state.status === "queued") {
    const wait = Math.max(1000, Math.min(state.estimatedWaitMs || 5000, 5000));
    throw new Error(
      `Freebuff waiting room queued${state.position ? ` (position ${state.position}/${state.queueDepth || state.position})` : ""}; retry in about ${Math.ceil(wait / 1000)}s`,
    );
  }
  if (state.status !== "active" || !state.instanceId)
    throw new Error("Freebuff session did not become active");
  const expiresAt = state.expiresAt ? Date.parse(state.expiresAt) : undefined;
  const session: Session = {
    instanceId: state.instanceId,
    status: state.status,
    model: (state as any).model ?? model,
    accessTier: (state as any).accessTier,
    countryCode: (state as any).countryCode,
    countryBlockReason: (state as any).countryBlockReason,
    remainingMs: (state as any).remainingMs,
    rateLimit: (state as any).rateLimit,
    rateLimitsByModel: (state as any).rateLimitsByModel,
    admittedAt: (state as any).admittedAt,
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

async function ensureSession(
  credential: FreebuffCredential,
  endpoint: string,
  model: string,
): Promise<Session> {
  const existing = sessionLocks.get(credential.id);
  if (existing) return existing;
  const operation = ensureSessionUnlocked(credential, endpoint, model);
  sessionLocks.set(credential.id, operation);
  try {
    return await operation;
  } finally {
    if (sessionLocks.get(credential.id) === operation) sessionLocks.delete(credential.id);
  }
}

async function ensureSessionUnlocked(
  credential: FreebuffCredential,
  endpoint: string,
  model: string,
): Promise<Session> {
  const current = sessions.get(credential.id);
  const instanceId = current?.instanceId || instanceIdFor(credential);
  const response = await request(credential, `${baseUrl(endpoint)}/api/v1/freebuff/session`, {
    method: "GET",
    headers: {
      "User-Agent": CLI_USER_AGENT,
      "x-freebuff-instance-id": instanceId,
    },
  });
  if (response.ok) {
    const state = (await response.json()) as any;
    if (state.status === "active" && state.instanceId && state.model === model) {
      const session: Session = {
        ...state,
        instanceId: state.instanceId,
        model,
        expiresAt: state.expiresAt ? Date.parse(state.expiresAt) : undefined,
        lastUsedAt: Date.now(),
        inFlight: current?.inFlight ?? 0,
        credential,
        endpoint: baseUrl(endpoint),
      };
      sessions.set(credential.id, session);
      await persistInstanceId(credential, state.instanceId);
      return session;
    }
    if (state.status === "active" && state.model && state.model !== model) {
      await endSession(credential, endpoint);
    } else if (state.status === "queued") {
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, Math.max(500, Math.min(state.estimatedWaitMs || 1000, 3000))));
        const poll = await request(credential, `${baseUrl(endpoint)}/api/v1/freebuff/session`, {
          method: "GET",
          headers: { "User-Agent": CLI_USER_AGENT, "x-freebuff-instance-id": instanceId },
        });
        if (!poll.ok) break;
        const next = (await poll.json()) as any;
        if (next.status === "active" && next.model === model) {
          const session: Session = {
            ...next,
            instanceId: next.instanceId,
            model,
            expiresAt: next.expiresAt ? Date.parse(next.expiresAt) : undefined,
            lastUsedAt: Date.now(),
            inFlight: 0,
            credential,
            endpoint: baseUrl(endpoint),
          };
          sessions.set(credential.id, session);
          await persistInstanceId(credential, next.instanceId);
          return session;
        }
      }
      throw new Error("Freebuff waiting room did not become active");
    }
  }
  return createSession(credential, endpoint, model);
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

async function startRun(credential: FreebuffCredential, endpoint: string, agentId: string) {
  const response = await request(credential, `${baseUrl(endpoint)}/api/v1/agent-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": BUN_USER_AGENT },
    body: JSON.stringify({ action: "START", agentId, ancestorRunIds: [] }),
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
  startTime: string,
) {
  const response = await request(
    credential,
    `${baseUrl(endpoint)}/api/v1/agent-runs/${runId}/steps`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": BUN_USER_AGENT },
      body: JSON.stringify({
        stepNumber: 1,
        credits: 0,
        childRunIds: [],
        messageId: null,
        status: "completed",
        startTime,
      }),
    },
  );
  if (!response.ok)
    logger.warn("Freebuff run step failed", { status: response.status });
  await response.body?.cancel().catch(() => {});
}

async function finishRun(credential: FreebuffCredential, endpoint: string, runId: string) {
  const response = await request(credential, `${baseUrl(endpoint)}/api/v1/agent-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": BUN_USER_AGENT },
    body: JSON.stringify({
      action: "FINISH",
      runId,
      status: "completed",
      totalSteps: 1,
      directCredits: 0,
      totalCredits: 0,
    }),
  });
  if (!response.ok) logger.warn("Freebuff run finish failed", { status: response.status });
  await response.body?.cancel().catch(() => {});
}

function clientSessionId() {
  return Math.random().toString(36).slice(2, 15);
}

export async function freebuffResponses(
  body: any,
  model: string,
  credential: FreebuffCredential,
  endpoint?: string,
) {
  const upstream = baseUrl(endpoint);
  // Free mode requires the run root to be one of Freebuff's allowlisted
  // orchestrators. The dynamically parsed catalog can also contain helper
  // subagents, which cannot be used as the top-level run.
  let session = await ensureSession(credential, upstream, model);
  const activeModel = session.model || model;
  const agentId = freebuffRootAgentForModel(activeModel);
  session.lastUsedAt = Date.now();
  session.inFlight += 1;
  const runId = await startRun(credential, upstream, agentId);
  const runStartTime = new Date().toISOString();
  const payload = structuredClone(body);
  payload.model = activeModel;
  payload.stream = body.stream ?? false;
  payload.codebuff_metadata = {
    ...(payload.codebuff_metadata || {}),
    run_id: runId,
    cost_mode: "free",
    client_id: clientSessionId(),
    trace_session_id: crypto.randomUUID(),
    ...(session.instanceId ? { freebuff_instance_id: session.instanceId } : {}),
  };
  payload.provider = { ...(payload.provider || {}), data_collection: "deny" };
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
          payload.codebuff_metadata = {
            ...payload.codebuff_metadata,
            freebuff_instance_id: session.instanceId,
            fallback_from_model: model,
          };
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
      const result = await response.arrayBuffer();
      await recordRunStep(credential, upstream, runId, runStartTime).catch(() => {});
      await finishRun(credential, upstream, runId).catch(() => {});
      session.inFlight = Math.max(0, session.inFlight - 1);
      session.lastUsedAt = Date.now();
      return new Response(result, { status: response.status, headers: response.headers });
    }
    return new Response(
      new ReadableStream({
        async start(controller) {
          try {
            const reader = response.body?.getReader();
            if (!reader) throw new Error("Freebuff returned an empty response");
            while (true) {
              const part = await reader.read();
              if (part.value) controller.enqueue(part.value);
              if (part.done) break;
            }
          } catch (error) {
            controller.error(error);
          } finally {
            await recordRunStep(credential, upstream, runId, runStartTime).catch(() => {});
            await finishRun(credential, upstream, runId).catch(() => {});
            session.inFlight = Math.max(0, session.inFlight - 1);
            session.lastUsedAt = Date.now();
            controller.close();
          }
        },
      }),
      { headers: response.headers },
    );
  } catch (error) {
    await recordRunStep(credential, upstream, runId, runStartTime).catch(() => {});
    await finishRun(credential, upstream, runId).catch(() => {});
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
