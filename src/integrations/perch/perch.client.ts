import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { credentialService } from "../../services/credential.service";
import { usageService } from "../../services/usage.service";
import { logger } from "../../logger";

const DEFAULT_APP_URL = "https://app.perchai.app";
const DEFAULT_USER_AGENT = "perchai-cli/2.4.115";
const DEFAULT_LOCALE = "en";
const REFRESH_MARGIN_S = 120;
const TICKET_MARGIN_MS = 30_000;
const AUTH_CONFIG_TTL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 15 * 60_000;
const REFRESH_LOCK_TTL_MS = 30_000;
const REFRESH_LOCK_WAIT_MS = 5_000;
const USAGE_CACHE_TTL_MS = 30_000;
const USAGE_TIMEOUT_MS = 30_000;
const KEYCHAIN_SERVICE = "app.perchai.cli-auth";
const KEYCHAIN_ACCOUNT = "default";
const TICKET_PROFILE = "standard";

const BUILTIN_MODELS = [
  {
    id: "perch-default",
    display_name: "Perch Default",
    upstream: null,
    note: "Account default model",
  },
  {
    id: "deepseek-v4.1-flash",
    display_name: "DeepSeek V4.1 Flash",
    upstream: "openrouter-deepseek-deepseek-v4-1-flash",
  },
  {
    id: "deepseek-v4.1-flash-cloudflare",
    display_name: "DeepSeek V4.1 Flash (Cloudflare)",
    upstream: "openrouter-deepseek-deepseek-v4-1-flash-1017-cloudflare",
  },
  {
    id: "qwen3.8-flash",
    display_name: "Qwen 3.8 Flash",
    upstream: "openrouter-qwen-qwen3-8-flash",
  },
  {
    id: "qwen3.8-max",
    display_name: "Qwen 3.8 Max",
    upstream: "openrouter-qwen-qwen3-8-max-0902",
  },
  {
    id: "minimax-m3.1-flash-free",
    display_name: "MiniMax M3.1 Flash (Free)",
    upstream: "openrouter-minimax-minimax-m3-1-flash-free",
  },
] as const;

/** Upstream IDs accepted as `manualModelOptionId` without an explicit alias. */
const UPSTREAM_MODEL_RE =
  /^(openrouter|dashscope|azure|azure-foundry|fireworks|anthropic|snowflake|openai|groq|cerebras|nvidia-nim|z-ai|poolside|ai-gateway|github-models|meta|gemini|grok|wandb|bedrock-mantle|cohere|huggingface|togetherai)-/i;

export type PerchCredential = {
  id?: string;
  provider_id?: string;
  secret?: string | null;
  account_id?: string | null;
};

export type PerchSession = {
  version: 1;
  appUrl: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  userId?: string | null;
  email?: string | null;
  updatedAt?: string;
};

export type PerchUsageWindow = {
  points: number | null;
  usd: number | null;
  tokens: number | null;
  calls: number | null;
};

export type PerchUsage = {
  ok: true;
  source: "perch" | "local";
  cached: boolean;
  fetched_at: string;
  warning?: string;
  profile: {
    id: string | null;
    email: string | null;
    name: string | null;
  } | null;
  plan: {
    code: string | null;
    name: string | null;
    membership_role: string | null;
    entitlements: Array<{ key: string; value: unknown }>;
  } | null;
  usage: {
    daily: PerchUsageWindow;
    weekly: PerchUsageWindow;
    monthly: PerchUsageWindow & { manual_points: number | null };
    rolling: {
      enabled: boolean;
      window_5h_usd: number | null;
      cap_5h_usd: number | null;
      next_free_5h: string | null;
      window_7d_usd: number | null;
      cap_7d_usd: number | null;
      next_free_7d: string | null;
    } | null;
  };
  credits: {
    balance_points: number | null;
    enabled: boolean | null;
  };
  billing: unknown | null;
};

export type PerchModel = {
  id: string;
  object: "model";
  owned_by: "perch";
  display_name: string;
  context_window: number;
  max_output_tokens: number;
  capabilities: {
    reasoning: boolean;
    tools: boolean;
    streaming: boolean;
    non_streaming: boolean;
  };
  description?: string;
};

type LoadedSession = {
  session: PerchSession;
  source:
    | { kind: "file"; path: string }
    | { kind: "credential"; credentialId?: string };
};

type PerchTicket = {
  ticket: string;
  ticketId: string | null;
  runId: string;
  expiresAtMs: number;
};

type AuthConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

type FetchSignal = {
  signal: AbortSignal;
  dispose: () => void;
};

export class PerchError extends Error {
  status: number | null;
  code: string | null;
  body: unknown;

  constructor(
    message: string,
    options: { status?: number | null; code?: string | null; body?: unknown } = {},
  ) {
    super(message);
    this.name = "PerchError";
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.body = options.body ?? null;
  }
}

const authConfigCache = new Map<string, { expiresAt: number; value: AuthConfig }>();
const authConfigFlights = new Map<string, Promise<AuthConfig>>();
const refreshFlights = new Map<string, Promise<PerchSession>>();
const tickets = new Map<string, PerchTicket>();
const ticketFlights = new Map<string, Promise<PerchTicket>>();

function normalizeAppUrl(value: string | undefined | null): string {
  return (value?.trim() || DEFAULT_APP_URL).replace(/\/+$/, "");
}

/** Resolve a public Klove model id to the `manualModelOptionId` Perch expects. */
export function resolvePerchModel(requested: string): {
  exposed: string;
  optionId: string | null;
} {
  const exposed = (requested || "perch-default").trim();
  const builtin = BUILTIN_MODELS.find((model) => model.id === exposed);
  if (builtin) return { exposed, optionId: builtin.upstream };
  if (UPSTREAM_MODEL_RE.test(exposed)) return { exposed, optionId: exposed };
  throw new PerchError(
    `Model "${exposed}" is not known to the Perch integration. Use a synced model or an upstream manualModelOptionId.`,
    { status: 404, code: "model_not_found" },
  );
}

export function perchModels(): PerchModel[] {
  return BUILTIN_MODELS.map((model) => ({
    id: model.id,
    object: "model",
    owned_by: "perch",
    display_name: model.display_name,
    context_window: 200_000,
    max_output_tokens: 32_768,
    capabilities: {
      reasoning: true,
      tools: true,
      streaming: true,
      non_streaming: true,
    },
    ...("note" in model && model.note ? { description: model.note } : {}),
  }));
}

function decodeJwtExp(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof decoded?.exp === "number" ? decoded.exp : null;
  } catch {
    return null;
  }
}

function decodeJwtIdentity(token: string): { userId: string | null; email: string | null } {
  const payload = token.split(".")[1];
  if (!payload) return { userId: null, email: null };
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return {
      userId: typeof decoded?.sub === "string" ? decoded.sub : null,
      email: typeof decoded?.email === "string" ? decoded.email : null,
    };
  } catch {
    return { userId: null, email: null };
  }
}

function asSession(raw: string, fallbackAppUrl?: string): PerchSession {
  const value = raw.trim();
  if (!value) throw new PerchError("The Perch session is empty.", { status: 401, code: "not_authenticated" });
  if (value.startsWith("{")) {
    let parsed: any;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new PerchError("The Perch session must be valid JSON or an access token.", {
        status: 400,
        code: "invalid_session",
      });
    }
    const accessToken = typeof parsed?.accessToken === "string" ? parsed.accessToken.trim() : "";
    if (!accessToken)
      throw new PerchError("The Perch session JSON is missing accessToken.", {
        status: 400,
        code: "invalid_session",
      });
    const identity = decodeJwtIdentity(accessToken);
    return {
      version: 1,
      appUrl: normalizeAppUrl(parsed.appUrl || fallbackAppUrl),
      accessToken,
      refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : null,
      expiresAt:
        typeof parsed.expiresAt === "number" ? parsed.expiresAt : decodeJwtExp(accessToken),
      userId: typeof parsed.userId === "string" ? parsed.userId : identity.userId,
      email: typeof parsed.email === "string" ? parsed.email : identity.email,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
    };
  }
  const identity = decodeJwtIdentity(value);
  return {
    version: 1,
    appUrl: normalizeAppUrl(fallbackAppUrl),
    accessToken: value,
    refreshToken: null,
    expiresAt: decodeJwtExp(value),
    userId: identity.userId,
    email: identity.email,
  };
}

export function perchSessionPath(): string {
  return join(homedir(), ".perch", "cli-auth-session.json");
}

function keychainEnabled(): boolean {
  return process.platform === "darwin";
}

function readKeychain(): string | null {
  if (!keychainEnabled()) return null;
  try {
    return (
      execFileSync(
        "security",
        [
          "find-generic-password",
          "-s",
          KEYCHAIN_SERVICE,
          "-a",
          KEYCHAIN_ACCOUNT,
          "-w",
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim() || null
    );
  } catch {
    return null;
  }
}

function writeKeychain(value: string): boolean {
  if (!keychainEnabled()) return false;
  try {
    execFileSync(
      "security",
      [
        "add-generic-password",
        "-U",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        KEYCHAIN_ACCOUNT,
        "-w",
        value,
      ],
      { stdio: "ignore" },
    );
    return true;
  } catch {
    return false;
  }
}

async function readStoredSession(fallbackAppUrl?: string): Promise<PerchSession | null> {
  const raw = readKeychain() ?? (await readFile(perchSessionPath(), "utf8").catch(() => null));
  if (!raw?.trim()) return null;
  return asSession(raw, fallbackAppUrl);
}

async function writeStoredSession(session: PerchSession): Promise<void> {
  const json = JSON.stringify(session);
  if (writeKeychain(json)) return;
  const file = perchSessionPath();
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  await writeFile(temporary, json, { mode: 0o600 });
  await rename(temporary, file);
}

function sessionIsFresh(session: PerchSession, now = Date.now() / 1000): boolean {
  if (!session.accessToken.trim() || !session.appUrl.trim()) return false;
  if (!session.expiresAt) return true;
  return session.expiresAt > now + REFRESH_MARGIN_S;
}

async function loadSession(
  credential: PerchCredential,
  endpoint?: string,
): Promise<LoadedSession> {
  const raw = credential.secret?.trim();
  if (raw) {
    return {
      session: asSession(raw, endpoint),
      source: { kind: "credential", credentialId: credential.id },
    };
  }
  const stored = await readStoredSession(endpoint);
  if (!stored)
    throw new PerchError(
      "No Perch session was found. Run `perch login` on the KloveRouter host, or paste a session JSON/access token in the provider credential.",
      { status: 401, code: "not_authenticated" },
    );
  return { session: stored, source: { kind: "file", path: perchSessionPath() } };
}

async function persistSession(
  loaded: LoadedSession,
  session: PerchSession,
): Promise<void> {
  if (loaded.source.kind === "file") {
    await writeStoredSession(session);
    return;
  }
  const credentialId = loaded.source.credentialId;
  if (!credentialId || credentialId === "validation") return;
  credentialService.update(credentialId, { secret: JSON.stringify(session) });
}

function httpSignal(signal?: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS): FetchSignal {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("The operation timed out", "TimeoutError")),
    timeoutMs,
  );
  timer.unref?.();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    },
  };
}

function authHeaders(session: PerchSession): Record<string, string> {
  return {
    Authorization: `Bearer ${session.accessToken}`,
    "User-Agent": DEFAULT_USER_AGENT,
    "x-perch-locale": DEFAULT_LOCALE,
  };
}

async function errorFromResponse(
  response: Response,
  fallback: string,
): Promise<PerchError> {
  const text = await response.text().catch(() => "");
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  const code =
    data?.errorCode ??
    data?.code ??
    data?.error?.code ??
    (response.status === 401 ? "not_authenticated" : null);
  const message =
    (typeof data?.error === "string" ? data.error : null) ??
    (typeof data?.error?.message === "string" ? data.error.message : null) ??
    (typeof data?.message === "string" ? data.message : null) ??
    text.trim().slice(0, 500) ??
    fallback;
  return new PerchError(message || fallback, {
    status: response.status,
    code,
    body: data ?? text,
  });
}

async function getAuthConfig(
  appUrl: string,
  signal?: AbortSignal,
): Promise<AuthConfig> {
  const cached = authConfigCache.get(appUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const existing = authConfigFlights.get(appUrl);
  if (existing) return existing;

  const flight = (async () => {
    const request = httpSignal(signal, 30_000);
    try {
      const response = await fetch(`${appUrl}/api/perch-terminal/cli-auth/config`, {
        headers: {
          Accept: "application/json",
          "User-Agent": DEFAULT_USER_AGENT,
        },
        signal: request.signal,
      });
      const data: any = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data?.supabaseUrl || !data?.supabaseAnonKey)
        throw new PerchError("Unable to load the Perch authentication configuration.", {
          status: response.status || 502,
          code: "auth_config_unavailable",
          body: data,
        });
      const value = {
        supabaseUrl: String(data.supabaseUrl),
        supabaseAnonKey: String(data.supabaseAnonKey),
      };
      authConfigCache.set(appUrl, {
        expiresAt: Date.now() + AUTH_CONFIG_TTL_MS,
        value,
      });
      return value;
    } finally {
      request.dispose();
    }
  })().finally(() => {
    authConfigFlights.delete(appUrl);
  });
  authConfigFlights.set(appUrl, flight);
  return flight;
}

async function refreshSession(
  session: PerchSession,
  signal?: AbortSignal,
): Promise<PerchSession> {
  const config = await getAuthConfig(session.appUrl, signal);
  const request = httpSignal(signal, 60_000);
  try {
    const response = await fetch(
      `${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${config.supabaseAnonKey}`,
        },
        body: JSON.stringify({ refresh_token: session.refreshToken }),
        signal: request.signal,
      },
    );
    const data: any = await response.json().catch(() => null);
    if (!response.ok || !data?.access_token)
      throw new PerchError(
        data?.error_description ||
          data?.error ||
          "Unable to refresh the Perch session. Run `perch login` again.",
        {
          status: response.status === 400 ? 401 : response.status || 401,
          code: "refresh_failed",
          body: data,
        },
      );
    const identity = decodeJwtIdentity(data.access_token);
    return {
      version: 1,
      appUrl: session.appUrl,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? session.refreshToken ?? null,
      expiresAt:
        typeof data.expires_at === "number"
          ? data.expires_at
          : decodeJwtExp(data.access_token),
      userId: data.user?.id ?? session.userId ?? identity.userId,
      email: data.user?.email ?? session.email ?? identity.email,
      updatedAt: new Date().toISOString(),
    };
  } finally {
    request.dispose();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function withRefreshLock<T>(file: string, run: () => Promise<T>): Promise<T> {
  const lockPath = join(dirname(file), "cli-auth-refresh.lock");
  const deadline = Date.now() + REFRESH_LOCK_WAIT_MS;
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  while (!handle) {
    try {
      handle = await open(lockPath, "wx", 0o600);
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error;
      const info = await stat(lockPath).catch(() => null);
      if (info && Date.now() - info.mtimeMs > REFRESH_LOCK_TTL_MS) {
        await unlink(lockPath).catch(() => undefined);
        continue;
      }
      if (Date.now() >= deadline)
        throw new PerchError(
          "Another process is refreshing the Perch session. Try again shortly.",
          { status: 503, code: "refresh_locked" },
        );
      await delay(50);
    }
  }
  try {
    return await run();
  } finally {
    await handle.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
  }
}

async function ensureSession(
  credential: PerchCredential,
  endpoint: string | undefined,
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<PerchSession> {
  let loaded = await loadSession(credential, endpoint);
  if (!options.force && sessionIsFresh(loaded.session)) return loaded.session;

  const credentialKey =
    loaded.source.kind === "credential" &&
    loaded.source.credentialId &&
    loaded.source.credentialId !== "validation"
      ? loaded.source.credentialId
      : `secret:${createHash("sha256")
          .update(loaded.session.refreshToken || loaded.session.accessToken)
          .digest("hex")
          .slice(0, 16)}`;
  const key =
    loaded.source.kind === "file"
      ? `file:${loaded.source.path}`
      : `credential:${credentialKey}`;
  const existing = refreshFlights.get(key);
  if (existing) return existing;

  const flight = (async () => {
    const refresh = async (): Promise<PerchSession> => {
      loaded = await loadSession(credential, endpoint);
      if (!options.force && sessionIsFresh(loaded.session)) return loaded.session;
      if (!loaded.session.refreshToken)
        throw new PerchError(
          "The Perch session expired and has no refresh token. Run `perch login` again or paste a fresh session.",
          { status: 401, code: "not_authenticated" },
        );
      const next = await refreshSession(loaded.session, options.signal);
      await persistSession(loaded, next);
      if (loaded.source.kind === "credential") {
        credential.secret = JSON.stringify(next);
      }
      return next;
    };
    return loaded.source.kind === "file"
      ? withRefreshLock(loaded.source.path, refresh)
      : refresh();
  })().finally(() => {
    refreshFlights.delete(key);
  });
  refreshFlights.set(key, flight);
  return flight;
}

function tokenLooksIncomplete(value: string): boolean {
  const token = value.trim();
  return /^eyJ[\w-]*\./.test(token) && token.split(".").length !== 3;
}

async function hostSessionFallback(
  endpoint: string | undefined,
  signal?: AbortSignal,
): Promise<{ session: PerchSession; appUrl: string } | null> {
  const stored = await readStoredSession(endpoint).catch(() => null);
  if (!stored) return null;
  try {
    const session = await ensureSession({}, endpoint, { signal });
    return { session, appUrl: normalizeAppUrl(session.appUrl || endpoint) };
  } catch {
    return null;
  }
}

function isAuthenticationFailure(error: unknown): boolean {
  return error instanceof PerchError && error.status === 401;
}

function ticketKey(session: PerchSession, appUrl: string): string {
  const identity =
    session.userId ||
    createHash("sha256").update(session.accessToken).digest("hex").slice(0, 16);
  return `${appUrl}|${identity}`;
}

async function getTicket(
  session: PerchSession,
  appUrl: string,
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<PerchTicket> {
  const key = ticketKey(session, appUrl);
  const cached = tickets.get(key);
  if (
    !options.force &&
    cached &&
    cached.expiresAtMs - TICKET_MARGIN_MS > Date.now()
  )
    return cached;
  const existing = ticketFlights.get(key);
  if (existing) return existing;

  const flight = (async () => {
    const request = httpSignal(options.signal, 30_000);
    try {
      const response = await fetch(`${appUrl}/api/perch-terminal/turn-ticket`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": DEFAULT_USER_AGENT,
          ...authHeaders(session),
        },
        body: JSON.stringify({
          surface: "cli",
          profile: TICKET_PROFILE,
        }),
        signal: request.signal,
      });
      const data: any = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.ticket || !data.runId)
        throw new PerchError(
          data?.error || "Unable to obtain a Perch turn ticket.",
          {
            status: response.status || 503,
            code: data?.errorCode ?? "turn_ticket_unavailable",
            body: data,
          },
        );
      const parsedExpiry = data.expiresAt ? Date.parse(data.expiresAt) : NaN;
      const ticket: PerchTicket = {
        ticket: String(data.ticket),
        ticketId: typeof data.ticketId === "string" ? data.ticketId : null,
        runId: String(data.runId),
        expiresAtMs: Number.isFinite(parsedExpiry)
          ? parsedExpiry
          : Date.now() + 300_000,
      };
      tickets.set(key, ticket);
      return ticket;
    } finally {
      request.dispose();
    }
  })().finally(() => {
    ticketFlights.delete(key);
  });
  ticketFlights.set(key, flight);
  return flight;
}

function normalizeMessages(messages: unknown): unknown {
  if (!Array.isArray(messages)) return messages;
  return messages.map((message: any) => {
    if (!message || typeof message !== "object") return message;
    if (message.role === "developer") return { ...message, role: "system" };
    return message;
  });
}

function legacyTools(body: any): unknown[] | undefined {
  if (Array.isArray(body.tools) && body.tools.length) return body.tools;
  if (Array.isArray(body.functions) && body.functions.length)
    return body.functions.map((fn: any) => ({
      type: "function",
      function: fn,
    }));
  return undefined;
}

function legacyToolChoice(body: any): unknown {
  if (body.tool_choice !== undefined) return body.tool_choice;
  if (body.function_call !== undefined) {
    if (body.function_call === "auto" || body.function_call === "none")
      return body.function_call;
    if (body.function_call?.name)
      return { type: "function", function: { name: body.function_call.name } };
  }
  return undefined;
}

function effortLevel(body: any): string | null {
  const raw =
    body?.__klove_reasoning?.upstreamValue ??
    body?.__klove_reasoning?.effort ??
    body?.reasoning_effort ??
    body?.reasoning?.effort ??
    body?.effort;
  if (raw == null || raw === "") return null;
  const normalized = String(raw).trim().toLowerCase();
  const aliases: Record<string, string> = {
    none: "off",
    off: "off",
    disabled: "off",
    false: "off",
    minimal: "low",
    min: "low",
    low: "low",
    medium: "medium",
    normal: "medium",
    high: "high",
    xhigh: "xhigh",
    max: "max",
    ultra: "ultra",
  };
  return aliases[normalized] ?? normalized;
}

/** Convert an OpenAI-shaped chat request into the Perch `model-call` body. */
export function buildPerchPayload(
  body: any,
  optionId: string | null,
  runId: string,
): Record<string, unknown> {
  const request: Record<string, unknown> = {
    messages: normalizeMessages(body.messages),
  };
  const tools = legacyTools(body);
  if (tools?.length) request.tools = tools;
  const toolChoice = legacyToolChoice(body);
  if (toolChoice !== undefined) request.toolChoice = toolChoice;
  const maxOutputTokens =
    body.max_tokens ?? body.max_completion_tokens ?? body.max_output_tokens;
  if (maxOutputTokens != null) request.maxOutputTokens = maxOutputTokens;
  if (body.temperature != null) request.temperature = body.temperature;
  if (body.response_format != null) request.responseFormat = body.response_format;
  const effort = effortLevel(body);
  return {
    request,
    runId,
    lane: "chat",
    clientSurface: "cli",
    ...(optionId ? { manualModelOptionId: optionId } : {}),
    ...(effort ? { effort: { level: effort, orchestration: false } } : {}),
  };
}

export function mapPerchUsage(usage: any): {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: { cached_tokens: number };
} | undefined {
  if (!usage) return undefined;
  const prompt = Number(
    usage.inputTokens ?? usage.prompt_tokens ?? usage.promptTokens ?? 0,
  );
  const completion = Number(
    usage.outputTokens ?? usage.completion_tokens ?? usage.completionTokens ?? 0,
  );
  const total = Number(
    usage.totalTokens ?? usage.total_tokens ?? prompt + completion,
  );
  const cached = Number(
    usage.cacheReadInputTokens ??
      usage.cached_tokens ??
      usage.cache_read_input_tokens ??
      0,
  );
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total,
    ...(cached > 0 ? { prompt_tokens_details: { cached_tokens: cached } } : {}),
  };
}

function mapFinishReason(reason: unknown, hasTools: boolean): string {
  if (hasTools) return "tool_calls";
  switch (reason) {
    case "tool_calls":
      return "tool_calls";
    case "length":
    case "max_tokens":
      return "length";
    case "content_filter":
      return "content_filter";
    default:
      return "stop";
  }
}

export function toOpenAIToolCalls(
  toolCalls: unknown,
  includeIndex = true,
): Array<Record<string, unknown>> {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.map((call: any, index) => {
    let args = call?.arguments ?? call?.input ?? {};
    if (typeof args !== "string") args = JSON.stringify(args ?? {});
    return {
      ...(includeIndex ? { index } : {}),
      id:
        call?.id ||
        `call_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      type: "function",
      function: {
        name: call?.name || call?.function?.name || "",
        arguments: args,
      },
    };
  });
}

function reasoningFromResult(result: any): string | undefined {
  const value =
    result?.reasoning ??
    result?.reasoningText ??
    result?.reasoning_content ??
    result?.content?.find?.((part: any) => part?.type === "reasoning")?.text;
  return typeof value === "string" && value ? value : undefined;
}

function completion(
  model: string,
  result: any,
): Record<string, unknown> {
  const toolCalls = toOpenAIToolCalls(result?.toolCalls, false);
  const reasoning = reasoningFromResult(result);
  const content =
    typeof result?.text === "string" ? result.text : "";
  return {
    id: `chatcmpl-${crypto.randomUUID().replace(/-/g, "")}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: content || (toolCalls.length ? null : ""),
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
          ...(reasoning ? { reasoning_content: reasoning } : {}),
        },
        logprobs: null,
        finish_reason: mapFinishReason(result?.finishReason, toolCalls.length > 0),
      },
    ],
    usage: mapPerchUsage(result?.usage) ?? {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
    ...(result?.provider ? { provider: result.provider } : {}),
  };
}

async function* readPerchEvents(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<any> {
  const decoder = new TextDecoder();
  let buffer = "";
  const parse = (block: string): any | null => {
    const raw = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = parse(block);
      if (event) yield event;
    }
    if (done) break;
  }
  if (buffer.trim()) {
    const event = parse(buffer);
    if (event) yield event;
  }
}

async function collectStream(
  response: Response,
  signal?: AbortSignal,
): Promise<any> {
  const reader = response.body?.getReader();
  if (!reader) throw new PerchError("Perch returned an empty stream.", { status: 502, code: "empty_body" });
  const onAbort = () => void reader.cancel(signal?.reason).catch(() => undefined);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  let text = "";
  let reasoning = "";
  let doneEvent: any = null;
  try {
    for await (const event of readPerchEvents(reader)) {
      if (signal?.aborted) break;
      if (event.type === "answer_delta" && typeof event.text === "string")
        text += event.text;
      if (event.type === "reasoning_delta" && typeof event.text === "string")
        reasoning += event.text;
      if (event.type === "error")
        throw new PerchError(
          event.message || event.error || "The Perch stream failed.",
          { status: 502, code: event.code ?? "stream_error", body: event },
        );
      if (event.type === "done") doneEvent = event;
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
  if (signal?.aborted)
    throw new PerchError("The Perch request was cancelled.", {
      status: 499,
      code: "aborted",
    });
  return {
    ...(doneEvent ?? {}),
    text: doneEvent?.text ?? text,
    ...(reasoning && !reasoningFromResult(doneEvent)
      ? { reasoning_content: reasoning }
      : {}),
  };
}

function streamCompletion(
  upstream: Response,
  model: string,
  includeUsage: boolean,
  signal?: AbortSignal,
): Response {
  const reader = upstream.body?.getReader();
  if (!reader)
    throw new PerchError("Perch returned an empty stream.", { status: 502, code: "empty_body" });
  const encoder = new TextEncoder();
  const id = `chatcmpl-${crypto.randomUUID().replace(/-/g, "")}`;
  const created = Math.floor(Date.now() / 1000);
  let cancelled = false;
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        const onAbort = () => {
          cancelled = true;
          void reader.cancel(signal?.reason).catch(() => undefined);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };
        if (signal?.aborted) onAbort();
        else signal?.addEventListener("abort", onAbort, { once: true });
        const send = (
          delta: Record<string, unknown>,
          finishReason: string | null = null,
          usage?: Record<string, unknown>,
        ) => {
          if (cancelled) return;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: finishReason === null && !Object.keys(delta).length
                  ? []
                  : [{ index: 0, delta, finish_reason: finishReason, logprobs: null }],
                ...(usage ? { usage } : {}),
              })}\n\n`,
            ),
          );
        };
        let textSent = false;
        let finished = false;
        send({ role: "assistant", content: "" });
        try {
          for await (const event of readPerchEvents(reader)) {
            if (cancelled) break;
            if (event.type === "answer_delta" && typeof event.text === "string" && event.text) {
              textSent = true;
              send({ content: event.text });
              continue;
            }
            if (event.type === "reasoning_delta" && typeof event.text === "string" && event.text) {
              send({ reasoning_content: event.text });
              continue;
            }
            if (event.type === "error")
              throw new PerchError(
                event.message || event.error || "The Perch stream failed.",
                { status: 502, code: event.code ?? "stream_error", body: event },
              );
            if (event.type !== "done") continue;
            finished = true;
            const toolCalls = toOpenAIToolCalls(event.toolCalls);
            if (!textSent && typeof event.text === "string" && event.text) {
              textSent = true;
              send({ content: event.text });
            }
            if (toolCalls.length)
              send({ tool_calls: toolCalls });
            send({}, mapFinishReason(event.finishReason, toolCalls.length > 0));
            if (includeUsage && event.usage) {
              send({}, null, mapPerchUsage(event.usage) ?? {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
              });
            }
          }
          if (!finished && !cancelled) send({}, "stop");
        } catch (error) {
          if (!cancelled) {
            const message =
              error instanceof Error ? error.message : "Perch stream failed";
            const code = error instanceof PerchError ? error.code : null;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: { message, type: "api_error", ...(code ? { code } : {}) } })}\n\n`,
              ),
            );
          }
        } finally {
          signal?.removeEventListener("abort", onAbort);
          if (!cancelled) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        }
      },
      cancel() {
        cancelled = true;
        void reader.cancel().catch(() => undefined);
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    },
  );
}

async function postModelCall(
  session: PerchSession,
  appUrl: string,
  payload: Record<string, unknown>,
  ticket: PerchTicket,
  stream: boolean,
  signal?: AbortSignal,
): Promise<Response> {
  const request = httpSignal(signal);
  try {
    return await fetch(`${appUrl}/api/perch-terminal/model-call`, {
      method: "POST",
      headers: {
        ...authHeaders(session),
        "Content-Type": "application/json",
        ...(stream ? { Accept: "text/event-stream" } : { Accept: "application/json" }),
        "x-perch-turn-ticket": ticket.ticket,
      },
      body: JSON.stringify(payload),
      signal: request.signal,
    });
  } finally {
    request.dispose();
  }
}

export async function perchResponses(
  body: any,
  requestedModel: string,
  credential: PerchCredential,
  endpoint?: string,
  signal?: AbortSignal,
): Promise<Response | Record<string, unknown>> {
  const { exposed, optionId } = resolvePerchModel(requestedModel);
  const stream = body?.stream === true;
  const includeUsage = body?.stream_options?.include_usage === true;
  let sessionCredential: PerchCredential = credential;
  let usingCredential = Boolean(credential.secret?.trim());
  let session = await ensureSession(sessionCredential, endpoint, { signal });
  let appUrl = normalizeAppUrl(session.appUrl || endpoint);

  const adoptHostSession = async (reason: string): Promise<boolean> => {
    const fallback = await hostSessionFallback(endpoint, signal);
    if (!fallback) return false;
    logger.warn(reason);
    session = fallback.session;
    appUrl = fallback.appUrl;
    sessionCredential = {};
    usingCredential = false;
    return true;
  };

  if (usingCredential && tokenLooksIncomplete(session.accessToken)) {
    const adopted = await adoptHostSession(
      "Perch credential contains an incomplete access token; using the host CLI session instead",
    );
    if (!adopted) {
      throw new PerchError(
        "The Perch access token is incomplete. Paste the complete `cli-auth-session.json` or the full access token.",
        { status: 400, code: "incomplete_token" },
      );
    }
  }

  let ticket: PerchTicket;
  try {
    ticket = await getTicket(session, appUrl, { signal });
  } catch (error) {
    if (
      isAuthenticationFailure(error) &&
      usingCredential &&
      !session.refreshToken &&
      (await adoptHostSession(
        "Perch rejected the credential token; using the host CLI session instead",
      ))
    ) {
      ticket = await getTicket(session, appUrl, { signal });
    } else {
      throw error;
    }
  }

  let response = await postModelCall(
    session,
    appUrl,
    buildPerchPayload(body, optionId, ticket.runId),
    ticket,
    stream,
    signal,
  );
  if (response.status === 401) {
    await response.body?.cancel().catch(() => undefined);
    if (usingCredential && !session.refreshToken) {
      const adopted = await adoptHostSession(
        "Perch rejected the credential token; using the host CLI session instead",
      );
      if (!adopted) {
        session = await ensureSession(sessionCredential, endpoint, {
          force: true,
          signal,
        });
        appUrl = normalizeAppUrl(session.appUrl || endpoint);
      }
    } else {
      session = await ensureSession(sessionCredential, endpoint, {
        force: true,
        signal,
      });
      appUrl = normalizeAppUrl(session.appUrl || endpoint);
    }
    ticket = await getTicket(session, appUrl, { force: true, signal });
    response = await postModelCall(
      session,
      appUrl,
      buildPerchPayload(body, optionId, ticket.runId),
      ticket,
      stream,
      signal,
    );
  }
  if (response.status === 403) {
    const error = await errorFromResponse(response, "Perch denied the request.");
    if (
      error.code === "perch_surface_required" ||
      error.code === "turn_ticket_unavailable"
    ) {
      ticket = await getTicket(session, appUrl, { force: true, signal });
      response = await postModelCall(
        session,
        appUrl,
        buildPerchPayload(body, optionId, ticket.runId),
        ticket,
        stream,
        signal,
      );
    } else {
      throw error;
    }
  }
  if (!response.ok)
    throw await errorFromResponse(response, "The Perch model call failed.");

  const contentType = response.headers.get("content-type") || "";
  if (stream) {
    if (contentType.includes("text/event-stream"))
      return streamCompletion(response, exposed, includeUsage, signal);
    const result = await response.json().catch(() => null);
    if (!result?.ok)
      throw new PerchError("Perch returned an invalid streaming response.", {
        status: 502,
        code: "parse_error",
        body: result,
      });
    return streamCompletion(
      new Response(
        `data: ${JSON.stringify({ type: "done", ...result })}\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      ),
      exposed,
      includeUsage,
      signal,
    );
  }

  const result = contentType.includes("text/event-stream")
    ? await collectStream(response, signal)
    : await response.json().catch(() => null);
  if (!result || result.ok === false)
    throw new PerchError(
      result?.error || "Perch returned an invalid response.",
      {
        status: 502,
        code: result?.errorCode ?? "parse_error",
        body: result,
      },
    );
  return completion(exposed, result);
}

export async function perchTest(
  model: string,
  credential: PerchCredential,
  endpoint?: string,
): Promise<Record<string, unknown>> {
  const result = await perchResponses(
    {
      messages: [{ role: "user", content: "Say 'ok' and nothing else." }],
      max_tokens: 16,
      stream: false,
    },
    model,
    credential,
    endpoint,
  );
  if (result instanceof Response)
    return (await result.json()) as Record<string, unknown>;
  return result;
}

export async function perchValidate(
  credential: PerchCredential,
  endpoint?: string,
): Promise<{
  authenticated: true;
  status: "ok";
  user_id: string | null;
  workspace_id: string | null;
  plan_code: string | null;
  email: string | null;
}> {
  const session = await ensureSession(credential, endpoint);
  if (credential.secret?.trim() && tokenLooksIncomplete(session.accessToken)) {
    throw new PerchError(
      "The Perch access token is incomplete. Paste the complete `cli-auth-session.json` or the full access token.",
      { status: 400, code: "incomplete_token" },
    );
  }
  const appUrl = normalizeAppUrl(session.appUrl || endpoint);
  const request = httpSignal(undefined, 30_000);
  try {
    const response = await fetch(`${appUrl}/api/perch-terminal/cli-context`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...authHeaders(session),
      },
      body: JSON.stringify({ query: "", includeIndex: false }),
      signal: request.signal,
    });
    const data: any = await response.json().catch(() => null);
    if (!response.ok || !data?.ok)
      throw new PerchError(data?.error || "Perch authentication failed.", {
        status: response.status || 401,
        code: data?.errorCode ?? "not_authenticated",
        body: data,
      });
    return {
      authenticated: true,
      status: "ok",
      user_id: data.session?.userId ?? session.userId ?? null,
      workspace_id: data.session?.workspaceId ?? null,
      plan_code: data.session?.planCode ?? null,
      email: session.email ?? null,
    };
  } finally {
    request.dispose();
  }
}

const usageCache = new Map<
  string,
  { expiresAt: number; value: PerchUsage }
>();

function usageCacheKey(credential: PerchCredential): string {
  if (credential.id && credential.id !== "validation")
    return `credential:${credential.id}`;
  return `secret:${createHash("sha256")
    .update(credential.secret?.trim() || "")
    .digest("hex")
    .slice(0, 16)}`;
}

function asUsageNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function perchAccountUrl(appUrl: string): string {
  try {
    const url = new URL(appUrl);
    if (url.hostname.startsWith("app."))
      url.hostname = `chat.${url.hostname.slice(4)}`;
    url.pathname = "/api/perchai/account";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "https://chat.perchai.app/api/perchai/account";
  }
}

async function requestPerchAccount(
  session: PerchSession,
  appUrl: string,
): Promise<Response> {
  const request = httpSignal(undefined, USAGE_TIMEOUT_MS);
  try {
    return await fetch(perchAccountUrl(appUrl), {
      headers: {
        Accept: "application/json",
        ...authHeaders(session),
      },
      signal: request.signal,
    });
  } finally {
    request.dispose();
  }
}

function normalizePerchUsage(data: any): PerchUsage {
  const meter = data?.usageMeter ?? {};
  const session = data?.session ?? {};
  const rolling = meter?.roostRolling;
  return {
    ok: true,
    source: "perch",
    cached: false,
    fetched_at: new Date().toISOString(),
    profile: data?.profile
      ? {
          id:
            typeof data.profile.id === "string" ? data.profile.id : null,
          email:
            typeof data.profile.email === "string"
              ? data.profile.email
              : null,
          name:
            typeof data.profile.name === "string" ? data.profile.name : null,
        }
      : null,
    plan: {
      code: typeof session.planCode === "string" ? session.planCode : null,
      name: typeof session.planName === "string" ? session.planName : null,
      membership_role:
        typeof session.membershipRole === "string"
          ? session.membershipRole
          : null,
      entitlements: Array.isArray(session.entitlements)
        ? session.entitlements.map((item: any) => ({
            key: String(item?.key ?? ""),
            value: item?.value_json ?? null,
          }))
        : [],
    },
    usage: {
      daily: {
        points: asUsageNumber(meter.dailyPt),
        usd: asUsageNumber(meter.dailyUsd),
        tokens: asUsageNumber(meter.dailyTokens),
        calls: asUsageNumber(meter.dailyCalls),
      },
      weekly: {
        points: asUsageNumber(meter.weeklyPt),
        usd: asUsageNumber(meter.weeklyUsd),
        tokens: asUsageNumber(meter.weeklyTokens),
        calls: asUsageNumber(meter.weeklyCalls),
      },
      monthly: {
        points: asUsageNumber(meter.monthlyPt),
        usd: asUsageNumber(meter.monthlyUsd),
        tokens: asUsageNumber(meter.monthlyTokens),
        calls: asUsageNumber(meter.monthlyCalls),
        manual_points: asUsageNumber(meter.monthlyManualPt),
      },
      rolling: rolling
        ? {
            enabled: Boolean(rolling.enabled),
            window_5h_usd: asUsageNumber(rolling.window5hUsd),
            cap_5h_usd: asUsageNumber(rolling.window5hCapUsd),
            next_free_5h:
              typeof rolling.window5hNextFreedAt === "string"
                ? rolling.window5hNextFreedAt
                : null,
            window_7d_usd: asUsageNumber(rolling.window7dUsd),
            cap_7d_usd: asUsageNumber(rolling.window7dCapUsd),
            next_free_7d:
              typeof rolling.window7dNextFreedAt === "string"
                ? rolling.window7dNextFreedAt
                : null,
          }
        : null,
    },
    credits: {
      balance_points: asUsageNumber(data?.creditBalancePt),
      enabled:
        typeof data?.creditsEnabled === "boolean"
          ? data.creditsEnabled
          : null,
    },
    billing: data?.billingSubscription ?? null,
  };
}

function localPerchUsage(
  credential: PerchCredential,
  warning: string,
): PerchUsage {
  let windows: ReturnType<typeof usageService.getProviderWindows> | null =
    null;
  if (credential.provider_id) {
    try {
      windows = usageService.getProviderWindows(credential.provider_id);
    } catch {
      windows = null;
    }
  }
  return {
    ok: true,
    source: "local",
    cached: false,
    fetched_at: new Date().toISOString(),
    warning,
    profile: null,
    plan: null,
    usage: {
      daily: {
        points: null,
        usd: windows?.daily.estimated_cost_usd ?? null,
        tokens: windows?.daily.tokens ?? null,
        calls: windows?.daily.calls ?? null,
      },
      weekly: {
        points: null,
        usd: windows?.weekly.estimated_cost_usd ?? null,
        tokens: windows?.weekly.tokens ?? null,
        calls: windows?.weekly.calls ?? null,
      },
      monthly: {
        points: null,
        usd: windows?.monthly.estimated_cost_usd ?? null,
        tokens: windows?.monthly.tokens ?? null,
        calls: windows?.monthly.calls ?? null,
        manual_points: null,
      },
      rolling: null,
    },
    credits: { balance_points: null, enabled: null },
    billing: null,
  };
}

async function fetchPerchUsage(
  credential: PerchCredential,
  endpoint?: string,
): Promise<PerchUsage> {
  let sessionCredential: PerchCredential = credential;
  let usingCredential = Boolean(credential.secret?.trim());
  let session = await ensureSession(sessionCredential, endpoint);

  if (usingCredential && tokenLooksIncomplete(session.accessToken)) {
    const fallback = await hostSessionFallback(endpoint);
    if (!fallback)
      throw new PerchError(
        "The Perch access token is incomplete. Paste the complete `cli-auth-session.json` or the full access token.",
        { status: 400, code: "incomplete_token" },
      );
    session = fallback.session;
    sessionCredential = {};
    usingCredential = false;
  }

  let appUrl = normalizeAppUrl(session.appUrl || endpoint);
  let response = await requestPerchAccount(session, appUrl);
  if (response.status === 401) {
    await response.body?.cancel().catch(() => undefined);
    if (usingCredential && !session.refreshToken) {
      const fallback = await hostSessionFallback(endpoint);
      if (fallback) {
        session = fallback.session;
        sessionCredential = {};
        usingCredential = false;
      } else {
        session = await ensureSession(sessionCredential, endpoint, {
          force: true,
        });
      }
    } else {
      session = await ensureSession(sessionCredential, endpoint, {
        force: true,
      });
    }
    appUrl = normalizeAppUrl(session.appUrl || endpoint);
    response = await requestPerchAccount(session, appUrl);
  }
  if (!response.ok)
    throw await errorFromResponse(response, "Perch usage request failed.");
  const data: any = await response.json().catch(() => null);
  if (!data?.ok)
    throw new PerchError(data?.error || "Perch usage request failed.", {
      status: 502,
      code: data?.errorCode ?? "usage_unavailable",
      body: data,
    });
  return normalizePerchUsage(data);
}

export async function perchUsage(
  credential: PerchCredential,
  endpoint?: string,
): Promise<PerchUsage> {
  const key = usageCacheKey(credential);
  const cached = usageCache.get(key);
  if (cached && cached.expiresAt > Date.now())
    return { ...cached.value, cached: true };

  let value: PerchUsage;
  try {
    value = await fetchPerchUsage(credential, endpoint);
  } catch (error: any) {
    const message =
      error instanceof Error ? error.message : "Perch usage request failed.";
    logger.warn("Perch usage request failed; using local usage", {
      error: message,
    });
    value = localPerchUsage(
      credential,
      `Perch usage endpoint unavailable: ${message}`,
    );
  }
  usageCache.set(key, { expiresAt: Date.now() + USAGE_CACHE_TTL_MS, value });
  return value;
}
