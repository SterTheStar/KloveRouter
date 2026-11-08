import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const ORIGIN = "https://api.deepai.org";
const BASE = `${ORIGIN}/deepai_code`;
const INSTANCE = randomBytes(16).toString("hex");
const startedAt = Date.now();
const amount = /^\d+(?:\.\d+)?$/;
const modelId = /^[a-zA-Z0-9_.-]{1,128}$/;

export type DeepAIModel = {
  id: string;
  name: string;
  reasoning: boolean;
  input: Array<"text" | "image">;
  contextWindow: number;
  maxTokens: number;
  premier?: boolean;
  api?: "openai-responses";
  theosPerRequest?: string;
  theosPerSecond?: Record<string, string>;
};

let catalog: DeepAIModel[] | null = null;
let catalogAt = 0;
let catalogRefresh: Promise<DeepAIModel[]> | null = null;
let allowance: Record<string, unknown> | null = null;
let checkIn: { nonce: string; seconds: number } | null = null;
let lastTheosAt = 0;
let checkInPromise: Promise<void> | null = null;

function machineHash(): string | undefined {
  const override = process.env.DEEPAI_MACHINE_UUID?.trim();
  let raw = override;
  if (!raw && process.platform === "linux") {
    try { raw = readFileSync("/sys/class/dmi/id/product_uuid", "utf8").trim(); } catch {}
    if (!raw) try { raw = readFileSync("/etc/machine-id", "utf8").trim(); } catch {}
  }
  if (!raw) return;
  const normalized = /^[0-9a-f]{32}$/i.test(raw)
    ? `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`
    : raw;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized) || /^(0{8}-0{4}-0{4}-0{4}-0{12}|f{8}-f{4}-f{4}-f{4}-f{12}|03000200-0400-0500-0006-000700080009)$/i.test(normalized)) return;
  return createHash("sha256").update(normalized).digest("hex");
}

const machine = machineHash();
function headers(apiKey?: string, extra: Record<string, string> = {}): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-DeepAI-Code-Theos": "4",
    "X-DeepAI-Code-Instance": INSTANCE,
    ...(machine ? { "X-DeepAI-Code-Machine": machine } : {}),
    ...(apiKey ? { "Api-Key": apiKey } : {}),
    ...extra,
  };
}

function decodeCatalog(payload: any): DeepAIModel[] {
  if (!Array.isArray(payload?.models) || !payload.models.length || payload.models.length > 100) throw new Error("Invalid DeepAI model catalog");
  const seen = new Set<string>();
  const result: DeepAIModel[] = [];
  for (const item of payload.models) {
    if (!item || typeof item.id !== "string" || !modelId.test(item.id) || seen.has(item.id) || typeof item.name !== "string" || !item.name.trim() || item.name.length > 100 || typeof item.reasoning !== "boolean" || !Array.isArray(item.input) || !item.input.includes("text") || item.input.some((v: unknown) => v !== "text" && v !== "image") || !Number.isSafeInteger(item.contextWindow) || item.contextWindow < 1 || !Number.isSafeInteger(item.maxTokens) || item.maxTokens < 1 || item.maxTokens > item.contextWindow) continue;
    seen.add(item.id);
    const model: DeepAIModel = { id: item.id, name: item.name, reasoning: item.reasoning, input: item.input, contextWindow: item.contextWindow, maxTokens: item.maxTokens };
    if (typeof item.premier === "boolean") model.premier = item.premier;
    if (item.api === "openai-responses") model.api = item.api;
    if (typeof item.theosPerRequest === "string" && amount.test(item.theosPerRequest)) model.theosPerRequest = item.theosPerRequest;
    if (item.theosPerSecond && typeof item.theosPerSecond === "object" && !Array.isArray(item.theosPerSecond)) {
      const rates = Object.fromEntries(Object.entries(item.theosPerSecond).filter(([key, value]) => ["none", "low", "medium", "high"].includes(key) && typeof value === "string" && amount.test(value))) as Record<string, string>;
      if (Object.keys(rates).length) model.theosPerSecond = rates;
    }
    result.push(model);
  }
  const available = result.filter((item) => item.id !== "gpt-oss-120b");
  if (!available.length) throw new Error("Invalid DeepAI model catalog");
  return available;
}

export async function deepaiModels(): Promise<DeepAIModel[]> {
  if (catalog && Date.now() - catalogAt < 60_000) return catalog;
  if (catalogRefresh) return catalogRefresh;
  catalogRefresh = (async () => {
    try {
      const response = await fetch(`${BASE}/models`, { headers: headers(), signal: AbortSignal.timeout(5000), redirect: "error" });
      if (!response.ok) throw new Error(`DeepAI models failed (${response.status})`);
      catalog = decodeCatalog(await response.json());
      catalogAt = Date.now();
      return catalog;
    } catch (error) {
      if (catalog) return catalog;
      throw error;
    }
  })().finally(() => { catalogRefresh = null; });
  return catalogRefresh;
}

async function refreshTheos(apiKey: string): Promise<void> {
  if (Date.now() - lastTheosAt < 30_000) return;
  if (checkInPromise) return checkInPromise;
  checkInPromise = (async () => {
    try {
      const beacon = `v=0.3.20;up=${Math.floor((Date.now() - startedAt) / 1000)};pi=0;focus=0`;
      const response = await fetch(`${BASE}/theos`, { headers: headers(apiKey, { "X-DeepAI-Code-Beacon": beacon, ...(checkIn ? { "X-DeepAI-Code-Check-In": checkIn.nonce } : {}) }), signal: AbortSignal.timeout(15000), redirect: "error" });
      const data: any = await response.json().catch(() => null);
      if (typeof data?.check_in?.nonce === "string" && /^[0-9a-f]{32}$/.test(data.check_in.nonce) && Number(data.check_in.seconds) > 0) checkIn = { nonce: data.check_in.nonce, seconds: data.check_in.seconds };
      if (response.ok) { allowance = data; lastTheosAt = Date.now(); }
    } catch { /* Best effort; request errors remain visible from the model endpoint. */ }
  })().finally(() => { checkInPromise = null; });
  return checkInPromise;
}

export async function deepaiUsage(apiKey: string) {
  await refreshTheos(apiKey);
  let summary: any = null;
  try {
    const response = await fetch(`${ORIGIN}/get_usage_summary`, { headers: headers(apiKey), signal: AbortSignal.timeout(10000), redirect: "error" });
    if (response.ok) summary = await response.json();
  } catch {}
  return { allowance, summary, allowance_checked_at: lastTheosAt ? new Date(lastTheosAt).toISOString() : null };
}

export async function deepaiRequest(body: Record<string, any>, model: string, apiKey: string, path: "chat/completions" | "responses", signal?: AbortSignal): Promise<Response> {
  await refreshTheos(apiKey);
  const session = body.metadata?.conversation_id ?? body.conversation_id ?? body.metadata?.session_id;
  const affinity = typeof session === "string" && /^[A-Za-z0-9._:-]{1,256}$/.test(session) ? session : undefined;
  const payload = { ...body, model: model.replace(/^deepai\//, "") };
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("DeepAI request timed out")), 15 * 60_000);
  try {
    for (;;) {
      const response = await fetch(`${BASE}/${path}`, { method: "POST", headers: headers(apiKey, affinity ? { "X-Session-Affinity": affinity } : {}), body: JSON.stringify(payload), signal: controller.signal, redirect: "error" });
      if (response.status !== 409) return response;
      const data: any = await response.clone().json().catch(() => null);
      if (data?.error?.code !== "session_busy") return response;
      await response.body?.cancel().catch(() => {});
      const retry = Number(response.headers.get("retry-after") ?? 2);
      await new Promise<void>((resolve, reject) => {
        const delay = setTimeout(resolve, Math.min(30, Math.max(1, Number.isFinite(retry) ? retry : 2)) * 1000);
        controller.signal.addEventListener("abort", () => { clearTimeout(delay); reject(controller.signal.reason); }, { once: true });
      });
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export function deepaiCatalogCache() { return catalog; }
