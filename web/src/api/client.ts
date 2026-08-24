const API_BASE = "";

function getToken(): string | null {
  return localStorage.getItem("klove_token");
}

export function setToken(token: string) {
  localStorage.setItem("klove_token", token);
}

export function clearToken() {
  localStorage.removeItem("klove_token");
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // Handle streaming responses differently
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("text/event-stream")) {
    return res as unknown as T;
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      data?.message || data?.error || `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(message);
  }

  return data as T;
}

// Auth
export const setup = {
  status: () => request<{ needs_setup: boolean }>("/api/setup/status"),
  complete: (data: { name: string; password: string; confirm_password: string }) =>
    request<{ success: boolean; needs_setup: boolean }>("/api/setup", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export const auth = {
  login: (password: string) =>
    request<{ token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  verify: () => request<{ valid: boolean; role?: string }>("/api/auth/verify"),
};

// Providers
export const providers = {
  validateCredential: (data: {
    base_url: string;
    protocol?: "openai" | "anthropic" | "codex" | "chatgpt" | "antigravity" | "freebuff" | "qwen" | "atomesus" | "conol";
    api_key?: string;
    auth_code?: string;
    secret?: string;
    account_id?: string;
    model?: string;
  }) => request<{ valid: boolean; verified: boolean; message?: string }>("/api/providers/validate-credential", {
    method: "POST",
    body: JSON.stringify(data),
  }),
  list: () => request<import("../types").Provider[]>("/api/providers"),
  get: (id: string) =>
    request<import("../types").ProviderDetail>(`/api/providers/${id}`),
  create: (data: {
    name: string;
    base_url: string;
    api_key?: string;
    auth_code?: string;
    secret?: string;
    account_id?: string;
    avatar?: string;
     protocol?: "openai" | "anthropic" | "codex" | "chatgpt" | "antigravity" | "freebuff" | "qwen" | "atomesus" | "conol";
   }) =>
     request<import("../types").Provider>("/api/providers", {
       method: "POST",
       body: JSON.stringify(data),
     }),
   update: (
     id: string,
     data: {
       name?: string;
       base_url?: string;
       api_key?: string;
       avatar?: string | null;
       protocol?: "openai" | "anthropic" | "codex" | "chatgpt" | "antigravity" | "freebuff" | "qwen" | "atomesus" | "conol";
      credential_mode?: "fixed" | "round_robin";
      fixed_credential_id?: string | null;
      is_active?: number;
    },
  ) =>
    request<import("../types").Provider>(`/api/providers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<{ success: boolean }>(`/api/providers/${id}`, {
      method: "DELETE",
    }),
  toggle: (id: string) =>
    request<import("../types").Provider>(`/api/providers/${id}/toggle`, {
      method: "POST",
    }),
  credentials: (id: string) =>
    request<import("../types").ProviderCredential[]>(
      `/api/providers/${id}/credentials`,
    ),
  addCredential: (
    id: string,
    data: {
      label: string;
       kind?: "api_key" | "codex" | "chatgpt" | "antigravity" | "freebuff" | "qwen" | "atomesus" | "conol";
      secret?: string;
      access_token?: string;
      refresh_token?: string;
      id_token?: string;
      account_id?: string;
    },
  ) =>
    request<import("../types").ProviderCredential>(
      `/api/providers/${id}/credentials`,
      { method: "POST", body: JSON.stringify(data) },
    ),
  updateCredential: (
    id: string,
    credentialId: string,
    data: { label?: string; secret?: string; is_active?: number },
  ) =>
    request<import("../types").ProviderCredential>(
      `/api/providers/${id}/credentials/${credentialId}`,
      { method: "PUT", body: JSON.stringify(data) },
    ),
  removeCredential: (id: string, credentialId: string) =>
    request<{ success: boolean }>(
      `/api/providers/${id}/credentials/${credentialId}`,
      { method: "DELETE" },
    ),
  credentialStatus: (id: string, credentialId: string) =>
    request<{
      authenticated: boolean;
      account_id: string | null;
      email?: string | null;
      project_id?: string | null;
    }>(`/api/providers/${id}/credentials/${credentialId}/status`),
  credentialSecret: (id: string, credentialId: string) =>
    request<{ secret: string | null }>(
      `/api/providers/${id}/credentials/${credentialId}/secret`,
    ),
  disconnectCredential: (id: string, credentialId: string) =>
    request<import("../types").ProviderCredential>(
      `/api/providers/${id}/credentials/${credentialId}/disconnect`,
      { method: "POST" },
    ),
  importLegacyCredential: (id: string, credentialId: string) =>
    request<import("../types").ProviderCredential>(
      `/api/providers/${id}/credentials/${credentialId}/import-legacy`,
      { method: "POST" },
    ),
};

export const codex = {
  status: () =>
    request<{
      authenticated: boolean;
      account_id: string | null;
      auth_path: string;
      last_refresh: string | null;
      warning: string;
    }>("/api/codex/status"),
  login: (credential_id: string) =>
    request<{ auth_url: string; warning: string }>("/api/codex/login", {
      method: "POST",
      body: JSON.stringify({ credential_id }),
    }),
  completeLogin: (callback_url: string, credential_id: string) =>
    request<{
      authenticated: boolean;
      account_id?: string | null;
      email?: string | null;
      project_id?: string | null;
    }>("/api/codex/login/complete", {
      method: "POST",
      body: JSON.stringify({ callback_url, credential_id }),
    }),
  logout: () =>
    request<{ authenticated: boolean }>("/api/codex/logout", {
      method: "POST",
    }),
  refresh: () =>
    request<{ authenticated: boolean }>("/api/codex/refresh", {
      method: "POST",
    }),
  models: () =>
    request<{ id: string; object: string; owned_by: string }[]>(
      "/api/codex/models",
    ),
  usage: (credential_id: string) =>
    request<import("../types").CodexUsage>(
      `/api/codex/usage?credential_id=${encodeURIComponent(credential_id)}`,
    ),
  resetCredits: (credential_id: string) =>
    request<unknown>(
      `/api/codex/reset-credits?credential_id=${encodeURIComponent(credential_id)}`,
    ),
  consumeResetCredit: (credential_id: string, credit_id?: string) =>
    request<unknown>("/api/codex/reset-credits/consume", {
      method: "POST",
      body: JSON.stringify({ credential_id, credit_id }),
    }),
};
export const antigravity = {
  login: (credential_id: string) =>
    request<{ auth_url: string; warning: string }>("/api/antigravity/login", {
      method: "POST",
      body: JSON.stringify({ credential_id }),
    }),
  completeLogin: (callback_url: string, credential_id: string) =>
    request<{
      authenticated: boolean;
      account_id?: string | null;
      email?: string | null;
      project_id?: string | null;
    }>("/api/antigravity/login/complete", {
      method: "POST",
      body: JSON.stringify({ callback_url, credential_id }),
    }),
  usage: (credential_id: string) =>
    request<import("../types").AntigravityQuota[]>(
      `/api/antigravity/usage?credential_id=${encodeURIComponent(credential_id)}`,
    ),
};

export const freebuff = {
  usage: (credential_id: string, model?: string) =>
    request<any>(
      `/api/freebuff/usage?credential_id=${encodeURIComponent(credential_id)}${model ? `&model=${encodeURIComponent(model)}` : ""}`,
    ),
  unlock: (credential_id: string) =>
    request<{ unlocked: boolean }>("/api/freebuff/unlock", {
      method: "POST",
      body: JSON.stringify({ credential_id }),
    }),
};

// Models
export const models = {
  listAll: () => request<import("../types").ModelWithProvider[]>("/api/models"),
  listByProvider: (providerId: string) =>
    request<import("../types").Model[]>(`/api/providers/${providerId}/models`),
  create: (
    providerId: string,
    data: {
      model_id: string;
      pretty_id?: string | null;
      display_name?: string;
      pricing_tiers?: import("../types").PricingTier[];
    } & import("../types").ModelMetadataInput,
  ) =>
    request<import("../types").Model>(`/api/providers/${providerId}/models`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  sync: (
    providerId: string,
    options: {
      preview?: boolean;
      modelIds?: string[];
      freeOnly?: boolean;
      resetExisting?: boolean;
    } = {},
  ) =>
    request<{
      preview?: boolean;
      success?: boolean;
      models?: { id: string; display_name: string; is_free: boolean; is_existing: boolean; source_data?: Record<string, unknown> }[];
      items?: { id: string; display_name: string; is_free: boolean; is_existing: boolean; source_data?: Record<string, unknown> }[];
      models_found: number;
      existing_models?: number;
      models_to_add?: number;
      free_models_found?: number;
      free_existing_models?: number;
      free_models_to_add?: number;
      message?: string;
    }>(`/api/providers/${providerId}/sync${options.preview ? "?preview=true" : ""}`, {
      method: "POST",
      body: JSON.stringify({
        ...(options.modelIds ? { model_ids: options.modelIds } : {}),
        ...(options.freeOnly ? { free_only: true } : {}),
        ...(options.resetExisting ? { reset_existing: true } : {}),
      }),
    }),
  toggle: (id: string) =>
    request<import("../types").Model>(`/api/models/${id}/toggle`, {
      method: "PUT",
    }),
  update: (
    id: string,
    data: {
      model_id?: string;
      pretty_id?: string | null;
      display_name?: string | null;
      pricing_tiers?: import("../types").PricingTier[];
    } & Partial<import("../types").ModelMetadataInput>,
  ) =>
    request<import("../types").Model>(`/api/models/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<{ success: boolean }>(`/api/models/${id}`, {
      method: "DELETE",
    }),
  deleteAll: (providerId: string) =>
    request<{ success: boolean; removed: number }>(
      `/api/providers/${providerId}/models`,
      {
        method: "DELETE",
      },
    ),
  test: (id: string) =>
    request<{
      success: boolean;
      duration_ms?: number;
      reply?: string;
      error?: string;
    }>(`/api/models/${id}/test`, {
      method: "POST",
    }),
};

// API Keys
export const apiKeys = {
  list: () => request<import("../types").ApiKey[]>("/api/keys"),
  create: (name: string) =>
    request<import("../types").ApiKeyWithSecret>("/api/keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  secret: (id: string) => request<{ secret: string }>(`/api/keys/${id}/secret`),
  remove: (id: string) =>
    request<{ success: boolean }>(`/api/keys/${id}`, {
      method: "DELETE",
    }),
};

// Stats
export const stats = {
  overview: (days: number | null = 30) =>
    request<import("../types").StatsOverview>(
      `/api/stats/overview?days=${days ?? 0}`,
    ),
  byProvider: (days: number | null = 30) =>
    request<import("../types").StatsByProvider[]>(
      `/api/stats/by-provider?days=${days ?? 0}`,
    ),
  byModel: (days: number | null = 30) =>
    request<import("../types").StatsByModel[]>(
      `/api/stats/by-model?days=${days ?? 0}`,
    ),
  daily: (days: number | null = 30) =>
    request<import("../types").DailyStats[]>(
      `/api/stats/daily?days=${days ?? 0}`,
    ),
  tps: () =>
    request<{ model_id: string; tps: number | null }[]>("/api/stats/tps"),
  uptime: (days: number | null = 0) =>
    request<import("../types").StatsUptime>(`/api/stats/uptime?days=${days ?? 0}`),
  health: (days: number | null = 0) =>
    request<import("../types").StatsHealth>(`/api/stats/health?days=${days ?? 0}`),
};

export const requestLogs = {
  list: (
    params: {
      limit?: number;
      offset?: number;
      status?: string;
      provider?: string;
      search?: string;
    } = {},
  ) => {
    const query = new URLSearchParams(
      Object.entries(params)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)]),
    );
    return request<{
      data: import("../types").RequestLog[];
      total: number;
      limit: number;
      offset: number;
    }>(`/api/request-logs?${query}`);
  },
  clear: () =>
    request<{ success: boolean; removed: number }>("/api/request-logs", {
      method: "DELETE",
    }),
};

// Panel chat (streams OpenAI-compatible SSE via the panel JWT)
export const chat = {
  completions: (
    body: {
      model: string;
      chat_id?: string;
      attachments?: unknown[];
      messages: { role: string; content: unknown }[];
    },
    signal?: AbortSignal,
  ) =>
    request<Response>("/api/chat/completions", {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    }),
};

export const chats = {
  list: () => request<import("../types").ChatSession[]>("/api/chats"),
  create: (data: { title?: string; model?: string } = {}) =>
    request<import("../types").ChatSession>("/api/chats", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  get: (id: string) =>
    request<{
      session: import("../types").ChatSession;
      messages: import("../types").PersistedChatMessage[];
    }>(`/api/chats/${id}`),
  update: (id: string, data: { title?: string; model?: string }) =>
    request<import("../types").ChatSession>(`/api/chats/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<{ success: boolean }>(`/api/chats/${id}`, { method: "DELETE" }),
};

// RTK
export const rtk = {
  status: () =>
    request<import("../types").RtkStatus>("/api/rtk/status"),
  enable: () =>
    request<{ success: boolean; message: string }>("/api/rtk/enable", {
      method: "POST",
    }),
  disable: () =>
    request<{ success: boolean; message: string }>("/api/rtk/disable", {
      method: "POST",
    }),
  install: () =>
    request<{ success: boolean; binaryPath?: string; message?: string }>(
      "/api/rtk/install",
      { method: "POST" },
    ),
  update: () =>
    request<{ success: boolean; binaryPath?: string; message?: string }>(
      "/api/rtk/update",
      { method: "POST" },
    ),
};

// Caveman
export const caveman = {
  status: () =>
    request<import("../types").CavemanStatus>("/api/caveman/status"),
  enable: () =>
    request<{ success: boolean; message: string; level: string }>(
      "/api/caveman/enable",
      { method: "POST" },
    ),
  disable: () =>
    request<{ success: boolean; message: string }>("/api/caveman/disable", {
      method: "POST",
    }),
  setLevel: (level: string) =>
    request<{ success: boolean; message: string; level: string }>(
      "/api/caveman/level",
      { method: "POST", body: JSON.stringify({ level }) },
    ),
  install: () =>
    request<{ success: boolean; skillPath?: string; message?: string }>(
      "/api/caveman/install",
      { method: "POST" },
    ),
  uninstall: () =>
    request<{ success: boolean; message: string }>("/api/caveman/uninstall", {
      method: "POST",
    }),
  update: () =>
    request<{ success: boolean; skillPath?: string; message?: string }>(
      "/api/caveman/update",
      { method: "POST" },
    ),
};

// Custom Skills
export const customSkills = {
  list: () =>
    request<import("../types").CustomSkill[]>("/api/custom-skills"),
  get: (id: string) =>
    request<import("../types").CustomSkill>(`/api/custom-skills/${id}`),
  create: (data: { name: string; content: string }) =>
    request<import("../types").CustomSkill>("/api/custom-skills", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { name?: string; content?: string; is_active?: boolean }) =>
    request<import("../types").CustomSkill>(`/api/custom-skills/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    request<{ success: boolean }>(`/api/custom-skills/${id}`, {
      method: "DELETE",
    }),
  toggle: (id: string) =>
    request<import("../types").CustomSkill>(`/api/custom-skills/${id}/toggle`, {
      method: "POST",
    }),
};

// Settings
export const settings = {
  chat: () => request<import("../types").ChatSettings>("/api/settings/chat"),
  updateChat: (data: import("../types").ChatSettings) =>
    request<import("../types").ChatSettings>("/api/settings/chat", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  profile: () =>
    request<{ name: string; avatar: string | null }>("/api/settings/profile"),
  updateProfile: (data: { name: string; avatar: string | null }) =>
    request<{ name: string; avatar: string | null }>("/api/settings/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  changePassword: (current_password: string, new_password: string) =>
    request<{ success: boolean; message: string }>("/api/settings/password", {
      method: "PUT",
      body: JSON.stringify({ current_password, new_password }),
    }),
};
