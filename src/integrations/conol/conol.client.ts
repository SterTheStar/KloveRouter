const DEFAULT_BASE_URL = "https://conol.ai";
const DEFAULT_TIMEZONE = "UTC";
const DEFAULT_MODELS = ["conol-default", "conol-research", "conol-agent"] as const;
const MODEL_CACHE_TTL = 30_000;

export type ConolCredential = {
  id?: string;
  secret?: string | null;
  account_id?: string | null;
};

export type ParsedConolCredential = { accountId: string; cookie: string };

function normalizeCookie(value: string): string {
  const cookie = value.trim();
  if (cookie.includes("=")) return cookie;
  const tokenId = cookie.split(".", 1)[0]?.toLowerCase();
  return tokenId
    ? `__Secure-better-auth.session_token_multi-${tokenId}=${cookie}`
    : `__Secure-better-auth.session_token=${cookie}`;
}

export type ConolModelMetadata = {
  agentServerId?: string;
  agentName?: string;
  agentModel?: string;
  modelPreset?: string;
  agentEffort?: string;
};
export type ConolModel = {
  id: string;
  object: "model";
  owned_by: "conol";
  display_name: string;
} & ConolModelMetadata;

type Preview = { type?: string; content?: Array<{ text?: unknown }> | string };
type ChatMessage = { role?: string; content?: unknown };
type ModelCacheEntry = { expires: number; models: ConolModel[] };
const modelCache = new Map<string, ModelCacheEntry>();

export function parseConolCredential(value: ConolCredential | string): ParsedConolCredential {
  const raw = typeof value === "string" ? value : value.secret ?? "";
  const explicitAccount = typeof value === "string" ? undefined : value.account_id ?? undefined;
  const lines = raw.split(/\r?\n/);
  let accountId = explicitAccount?.trim() ?? "";
  let cookie = raw.trim();
  const accountLine = lines.find((line) => /^account_id\s*=/.test(line.trim()));
  if (accountLine) {
    accountId ||= accountLine.replace(/^account_id\s*=\s*/, "").trim();
    cookie = lines.slice(lines.indexOf(accountLine) + 1).join("\n").trim();
  }
  if (!accountId || !cookie) throw new Error("Conol credential must contain account_id and cookie");
  return { accountId, cookie: normalizeCookie(cookie) };
}

export function conolContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((part) => part?.type === "text" || part?.type === "input_text")
    .map((part) => typeof part.text === "string" ? part.text : "")
    .join("\n");
}

function baseUrl(endpoint?: string) { return (endpoint || DEFAULT_BASE_URL).replace(/\/+$/, ""); }
function timezoneOf(body: any) { return typeof body.timezone === "string" && body.timezone ? body.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE; }
function headers(credential: ConolCredential, accept = "application/json") {
  const parsed = parseConolCredential(credential);
  return { Accept: accept, "Content-Type": "application/json", Cookie: parsed.cookie, "x-conol-account": parsed.accountId };
}

async function request(url: string, credential: ConolCredential, init: RequestInit, timeoutMs: number, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason ?? timeout.reason);
  timeout.addEventListener("abort", abort, { once: true });
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, { ...init, headers: { ...headers(credential, init.headers ? undefined : "application/json"), ...(init.headers as Record<string, string> || {}) }, signal: controller.signal });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      let message = detail.trim();
      try {
        const parsed = JSON.parse(message);
        message = typeof parsed?.error === "string" ? parsed.error : typeof parsed?.message === "string" ? parsed.message : message;
      } catch {
        // Keep non-JSON upstream errors as returned.
      }
      throw new Error(`Conol request failed (${response.status})${message ? `: ${message.slice(0, 300)}` : ""}`);
    }
    return response;
  } finally {
    timeout.removeEventListener("abort", abort);
    signal?.removeEventListener("abort", abort);
  }
}

function textFromPreview(preview: Preview): string {
  if (typeof preview.content === "string") return preview.content;
  return Array.isArray(preview.content) ? preview.content.map((part) => typeof part.text === "string" ? part.text : "").join("") : "";
}

export function parseConolEvent(raw: unknown): { content?: string; reasoning?: string; done?: boolean } | null {
  if (!raw || typeof raw !== "object") return null;
  const event = raw as any;
  if (event.done === true || event.type === "done") return { done: true };
  if (event.type !== "history_delta" || event.windowReset === true) return null;
  let content = ""; let reasoning = "";
  const stages = Array.isArray(event.stages) ? event.stages : [];
  const stage = stages.at(-1);
  for (const preview of stage?.preview ?? []) {
    const text = textFromPreview(preview);
    if (preview.type === "thinking") reasoning += text;
    if (preview.type === "message") content += text;
  }
  return { content: content || undefined, reasoning: reasoning || undefined };
}

export async function* conolEvents(response: Response): AsyncGenerator<{ content?: string; reasoning?: string; done?: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Conol returned an empty response");
  const decoder = new TextDecoder(); let buffer = ""; let dataLines: string[] = [];
  const process = (block: string): any[] => {
    const lines = block.split(/\r\n|\r|\n/); const values: any[] = [];
    for (const line of lines) {
      if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
      else if (!line.trim() && dataLines.length) { values.push(dataLines.join("\n")); dataLines = []; }
      else if (line.trim() && (/^[{[]/.test(line.trim()) || !line.includes(":"))) values.push(line.trim());
    }
    if (dataLines.length) { values.push(dataLines.join("\n")); dataLines = []; }
    return values;
  };
  const emit = (raw: string) => { try { return parseConolEvent(JSON.parse(raw)); } catch { return null; } };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const chunks = buffer.split(/\r\n\r\n|\n\n|\r\r/); buffer = chunks.pop() ?? "";
    for (const block of chunks) for (const raw of process(block)) { const event = emit(raw); if (event) yield event; }
    if (done) break;
  }
  if (buffer.trim()) for (const raw of process(buffer + "\n")) { const event = emit(raw); if (event) yield event; }
  if (dataLines.length) { const event = emit(dataLines.join("\n")); if (event) yield event; }
}

function asText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object") return undefined;
  const item = value as any;
  for (const key of ["id", "name", "value", "model", "preset", "slug"]) {
    if (typeof item[key] === "string" && item[key].trim()) return item[key].trim();
  }
  return undefined;
}
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function idPart(value: string) { return encodeURIComponent(value); }
function modelId(kind: string, server: string, agent: string, value: string) { return `conol:${idPart(server)}:${idPart(agent)}:${kind}:${idPart(value)}`; }

export function conolModelMetadataFromId(id: string): ConolModelMetadata | null {
  const parts = id.split(":");
  if (parts.length < 5 || parts[0] !== "conol") return null;
  const decode = (value: string) => {
    try { return decodeURIComponent(value); } catch { return value; }
  };
  const [, server, agent, kind, value] = parts;
  return kind === "preset"
    ? { agentServerId: decode(server), agentName: decode(agent), modelPreset: decode(value) }
    : kind === "model"
      ? { agentServerId: decode(server), agentName: decode(agent), agentModel: decode(value) }
      : null;
}

export function parseConolModels(raw: unknown): ConolModel[] {
  const root: any = raw && typeof raw === "object" ? raw : {};
  const servers = Array.isArray(raw) ? raw : list(root.servers).length ? list(root.servers) : list(root.agentServers).length ? list(root.agentServers) : list(root.data).length ? list(root.data) : [root];
  const result: ConolModel[] = [];
  const used = new Set<string>();
  const add = (kind: "model" | "preset", value: unknown, server: string, agent: string, details: any) => {
    const name = asText(value); if (!name) return;
    const base = modelId(kind, server, agent, name); let id = base; let n = 2;
    while (used.has(id)) id = `${base}:${n++}`;
    used.add(id);
    const metadata: ConolModelMetadata = kind === "preset" ? { agentServerId: server || undefined, agentName: agent || undefined, modelPreset: name } : { agentServerId: server || undefined, agentName: agent || undefined, agentModel: name };
    const display = typeof value === "object" && typeof (value as any).display_name === "string" ? (value as any).display_name : typeof value === "object" && typeof (value as any).displayName === "string" ? (value as any).displayName : name;
    result.push({ id, object: "model", owned_by: "conol", display_name: display, ...metadata, ...(typeof details?.defaultEffort === "string" ? { agentEffort: details.defaultEffort } : {}) });
  };
  for (const serverRaw of servers) {
    const server: any = serverRaw && typeof serverRaw === "object" ? serverRaw : {};
    const serverId = asText(server.id ?? server.agentServerId) ?? "default";
    const capabilities: any = server.capabilities && typeof server.capabilities === "object" ? server.capabilities : server;
    const agents = list(capabilities.agents).length ? list(capabilities.agents) : [capabilities];
    for (const agentRaw of agents) {
      const agent: any = agentRaw && typeof agentRaw === "object" ? agentRaw : { name: asText(agentRaw) };
      const agentName = asText(agent.name ?? agent.id ?? capabilities.defaultAgent) ?? "default";
      const details = { defaultEffort: asText(agent.defaultAgentEffort ?? agent.agentEffort ?? agent.defaultEffort) };
      for (const item of list(agent.models)) add("model", item, serverId, agentName, details);
      for (const item of list(agent.modelPresets)) add("preset", item, serverId, agentName, details);
      if (asText(agent.defaultModel) && !list(agent.models).length) add("model", agent.defaultModel, serverId, agentName, details);
      if (asText(agent.defaultModelPreset) && !list(agent.modelPresets).length) add("preset", agent.defaultModelPreset, serverId, agentName, details);
    }
  }
  return result;
}

export async function conolModels(credential: ConolCredential, endpoint?: string): Promise<ConolModel[]> {
  const parsed = parseConolCredential(credential);
  const key = `${baseUrl(endpoint)}|${credential.id ?? ""}|${parsed.accountId}|${parsed.cookie}`;
  const cached = modelCache.get(key); if (cached && cached.expires > Date.now()) return cached.models;
  const response = await request(`${baseUrl(endpoint)}/api/agent-servers`, credential, { method: "GET" }, 30_000);
  const parsedModels = parseConolModels(await response.json());
  const models = parsedModels.length ? parsedModels : DEFAULT_MODELS.map((id) => ({ id, object: "model" as const, owned_by: "conol" as const, display_name: id }));
  modelCache.set(key, { expires: Date.now() + MODEL_CACHE_TTL, models });
  return models;
}

function reconcile(value: string, previous: string): { next: string; delta: string } {
  if (!value || value === previous) return { next: previous, delta: "" };
  if (!previous || value.startsWith(previous)) return { next: value, delta: value.slice(previous.length) };
  if (previous.startsWith(value)) return { next: previous, delta: "" };
  let overlap = Math.min(previous.length, value.length);
  while (overlap > 0 && !previous.endsWith(value.slice(0, overlap))) overlap--;
  if (overlap > 0) return { next: previous + value.slice(overlap), delta: value.slice(overlap) };
  return { next: value, delta: value };
}
function incremental(value: string, previous: string): string {
  if (!value || value === previous) return "";
  if (!previous || value.startsWith(previous)) return value.slice(previous.length);
  if (previous.startsWith(value)) return "";
  return value;
}
function completion(model: string, content: string, reasoning?: string) { return { id: `chatcmpl-${crypto.randomUUID()}`, object: "chat.completion", created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, message: { role: "assistant", content, ...(reasoning ? { reasoning_content: reasoning } : {}) }, logprobs: null, finish_reason: "stop" }] }; }
function openAIStream(model: string, source: Response, signal?: AbortSignal) { const encoder = new TextEncoder(); const id = `chatcmpl-${crypto.randomUUID()}`; const created = Math.floor(Date.now() / 1000); let cancelled = false; return new Response(new ReadableStream({ async start(controller) { const send = (delta: any, finish_reason: string | null = null) => { if (!cancelled) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)); }; send({ role: "assistant", content: "" }); let content = ""; let reasoning = ""; try { for await (const event of conolEvents(source)) { if (event.content) { const delta = incremental(event.content, content); content += delta; if (delta) send({ content: delta }); } if (event.reasoning) { const delta = incremental(event.reasoning, reasoning); reasoning += delta; if (delta) send({ reasoning_content: delta }); } if (event.done) break; } if (!cancelled) { send({}, "stop"); controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); } } catch (error) { if (!cancelled) { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { message: error instanceof Error ? error.message : "Conol stream failed" } })}\n\n`)); controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); } } }, cancel() { cancelled = true; void source.body?.cancel(); signal?.throwIfAborted?.(); } }), { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } }); }

export async function conolResponses(body: any, model: string | ConolModelMetadata, credential: ConolCredential, endpoint?: string, signal?: AbortSignal): Promise<Response | ReturnType<typeof completion>> {
  const upstream = baseUrl(endpoint); const metadata = typeof model === "string" ? { agentModel: model } : model; const requestedModel = typeof model === "string" ? model : model.agentModel ?? model.modelPreset ?? "conol-default"; const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : []; const user = [...messages].reverse().find((item) => item.role === "user"); const text = conolContent(user?.content); if (!text) throw new Error("Conol requires a user text message"); const timezone = timezoneOf(body); const timeout = Number(body.timeout_ms) || 15 * 60_000;
  const sessionPayload = { source: { type: "home" }, messages: [{ type: "text", content: "" }], timezone };
  const created = await request(`${upstream}/api/sessions`, credential, { method: "POST", body: JSON.stringify(sessionPayload) }, timeout, signal); const session = await created.json().catch(() => null); if (!session?.sessionId) throw new Error("Conol session response missing sessionId");
  const current = session.effectiveModel;
  const changes = metadata.agentModel
    ? { agentModel: metadata.agentModel }
    : metadata.modelPreset
      ? { modelPreset: metadata.modelPreset }
      : {};
  if (Object.keys(changes).length && current !== requestedModel)
    await request(`${upstream}/api/sessions/${encodeURIComponent(session.sessionId)}/model`, credential, { method: "POST", body: JSON.stringify(changes) }, timeout, signal);
  await request(`${upstream}/api/sessions/${encodeURIComponent(session.sessionId)}/messages`, credential, { method: "POST", body: JSON.stringify({ messages: [{ type: "text", content: text }], timezone }) }, timeout, signal);
  const stream = await request(`${upstream}/api/sessions/${encodeURIComponent(session.sessionId)}/messages?logDeltas=1&acct=${encodeURIComponent(parseConolCredential(credential).accountId)}`, credential, { method: "GET", headers: { Accept: "text/event-stream, application/x-ndjson" } }, timeout, signal);
  if (body.stream) return openAIStream(requestedModel, stream, signal); let content = ""; let reasoning = ""; for await (const event of conolEvents(stream)) { if (event.content) content += incremental(event.content, content); if (event.reasoning) reasoning += incremental(event.reasoning, reasoning); if (event.done) break; } return completion(requestedModel, content, reasoning);
}

export async function conolValidate(credential: ConolCredential, endpoint?: string) { const response = await request(`${baseUrl(endpoint)}/api/sessions`, credential, { method: "POST", body: JSON.stringify({ source: { type: "home" }, messages: [{ type: "text", content: "Say 'ok' and nothing else." }], timezone: DEFAULT_TIMEZONE }) }, 30_000); const data = await response.json().catch(() => null); return { authenticated: true, status: "ok", session_id: data?.sessionId ?? null, model: data?.effectiveModel ?? null }; }
