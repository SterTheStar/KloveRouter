import { Elysia, t } from "elysia";
import { keyService } from "../services/key.service";
import { providerService } from "../services/provider.service";
import { modelService, providerModelPublicId } from "../services/model.service";
import { credentialService } from "../services/credential.service";
import { requestLogService } from "../services/request-log.service";
import { upstreamProviderHeaders } from "../services/provider-headers";
import { isOpenAICompatibleProtocol } from "../services/provider-appearance";
import { assertSafeRemoteUrl } from "../services/ssrf";
import { getDb } from "../db/connection";
import { parseModelName } from "../clients/openai";

type MediaType = "image-generation" | "image-edit" | "image-variation" | "text-to-speech" | "video-generation" | "video-status" | "video-content" | "video-cancel" | "video-delete" | "video-list";

type MediaRoute = {
  provider: NonNullable<ReturnType<typeof providerService.findById>>;
  model: NonNullable<ReturnType<typeof modelService.findByPublicId>>;
  requestedModel: string;
  credential: NonNullable<ReturnType<typeof credentialService.select>>;
};

const apiError = (message: string, type = "invalid_request_error", code: string | null = null) => ({ error: { message, type, code } });
const clientIp = (request: Request) => request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

function endpointUrl(provider: MediaRoute["provider"], resourcePath: string, query?: string) {
  const base = provider.base_url.replace(/\/+$/, "");
  const versioned = /\/v1$/i.test(base) ? base : `${base}/v1`;
  return `${versioned}/${resourcePath.replace(/^\/+/, "")}${query ?? ""}`;
}

function bodyValue(body: any, key: string): unknown {
  if (!body || typeof body !== "object") return undefined;
  if (body instanceof FormData) return body.get(key);
  return body[key];
}

function safeRequestDetails(body: any, contentType: string | null) {
  if (!body || typeof body !== "object") return body;
  const fields: Record<string, unknown> = {};
  const entries: Array<[string, unknown]> = body instanceof FormData ? [...body.entries()] : Object.entries(body);
  for (const [key, value] of entries) {
    if (["prompt", "input", "instructions"].includes(key.toLowerCase()) && typeof value === "string") fields[key] = { redacted: true, characters: value.length };
    else if (value instanceof Blob) fields[key] = { filename: (value as File).name ?? null, size: value.size, content_type: value.type };
    else fields[key] = value;
  }
  return { content_type: contentType, fields };
}

function formBody(body: any, modelId: string): FormData {
  const form = new FormData();
  const entries: Array<[string, unknown]> = body instanceof FormData ? [...body.entries()] : Object.entries(body ?? {});
  for (const [key, value] of entries) {
    if (key === "model") continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item == null) continue;
      if (item instanceof Blob) form.append(key, item, (item as File).name || "upload");
      else if (typeof item === "object") form.append(key, JSON.stringify(item));
      else form.append(key, String(item));
    }
  }
  form.set("model", modelId);
  return form;
}

function withMediaDefaults(body: any, route: MediaRoute, mediaType: MediaType) {
  const settings = route.model.media_settings ?? {};
  const defaults = mediaType.startsWith("image-")
    ? settings.image
    : mediaType === "text-to-speech"
      ? settings.text_to_speech
      : mediaType === "video-generation"
        ? settings.video
        : undefined;
  if (!defaults) return body;
  const values = Object.fromEntries(Object.entries(defaults).filter(([, value]) => value !== undefined && value !== ""));
  if (body instanceof FormData) {
    const form = new FormData();
    for (const [key, value] of body.entries()) form.append(key, value);
    for (const [key, value] of Object.entries(values)) if (!form.has(key)) form.set(key, String(value));
    return form;
  }
  const result = { ...(body ?? {}) };
  for (const [key, value] of Object.entries(values)) if (result[key] === undefined || result[key] === null || result[key] === "") result[key] = value;
  return result;
}

async function resolveMediaRoute(modelName: unknown, modality: "image_generation" | "text_to_speech" | "video_generation", headers: Record<string, string | undefined>) {
  if (typeof modelName !== "string" || !modelName) return { error: apiError("A model ID in provider/model format is required") } as const;
  const parsed = parseModelName(modelName);
  if (!parsed) return { error: apiError('Model must use "provider/model" format') } as const;
  const provider = providerService.findByName(parsed.providerName);
  if (!provider || !provider.is_active) return { status: 404, error: apiError(`Provider "${parsed.providerName}" was not found or is disabled`, "invalid_request_error", "provider_not_found") } as const;
  if (!isOpenAICompatibleProtocol(provider.protocol)) return { status: 400, error: apiError(`Provider "${provider.name}" does not expose OpenAI-compatible media endpoints`, "invalid_request_error", "incompatible_provider") } as const;
  const model = modelService.findByPublicId(provider.id, parsed.modelId);
  if (!model || !model.is_active) return { status: 404, error: apiError(`Model "${parsed.modelId}" was not found or is disabled`, "invalid_request_error", "model_not_found") } as const;
  if (model.capabilities?.[modality] === false) return { status: 400, error: apiError(`Model "${modelName}" is not marked as supporting ${modality.replaceAll("_", " ")}`, "invalid_request_error", "unsupported_model_modality") } as const;

  const auth = headers.authorization;
  const gatewayKey = auth?.startsWith("Bearer ") ? auth.slice(7) : headers["x-api-key"];
  const apiKey = gatewayKey ? await keyService.verify(gatewayKey) : null;
  if (!apiKey) return { status: 401, error: apiError("Valid API key required", "authentication_error") } as const;

  const sequence = provider.credential_mode === "round_robin" ? credentialService.beginRequest(provider.id) : undefined;
  const credential = credentialService.select(provider.id, provider.credential_mode, provider.fixed_credential_id, sequence)
    || credentialService.select(provider.id, "round_robin", null, sequence);
  if (!credential) return { status: 503, error: apiError(`Provider "${provider.name}" has no active credential`, "server_error", "no_active_credential") } as const;
  return { route: { provider, model, requestedModel: modelName, credential } as MediaRoute, gatewayKeyName: apiKey.name } as const;
}

function trackedResponse(upstream: Response, requestId: string, started: number, type: MediaType, completeOnEnd = true): Response {
  const responseHeaders = new Headers(upstream.headers);
  for (const header of ["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "set-cookie"]) responseHeaders.delete(header);
  requestLogService.captureResponse(requestId, { status: upstream.status, headers: responseHeaders, contentType: responseHeaders.get("content-type"), streaming: type === "text-to-speech" || type === "video-content" });
  if (!upstream.body) {
    requestLogService.complete(requestId, {
      status: upstream.ok ? "success" : "error",
      statusCode: upstream.status,
      durationMs: Math.round(performance.now() - started),
      responseDetails: { status_code: upstream.status, content_type: responseHeaders.get("content-type"), output_bytes: 0, media_type: type },
      ...(!upstream.ok ? { error: `Upstream returned ${upstream.status}` } : {}),
    });
    return new Response(null, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
  }

  const reader = upstream.body.getReader();
  let outputBytes = 0;
  let finished = false;
  const finish = (status: "success" | "error", statusCode: number, error?: string) => {
    if (finished) return;
    finished = true;
    requestLogService.complete(requestId, {
      status,
      statusCode,
      durationMs: Math.round(performance.now() - started),
      responseDetails: { status_code: statusCode, content_type: responseHeaders.get("content-type"), output_bytes: outputBytes, media_type: type },
      ...(error ? { error } : {}),
    });
  };
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          finish(upstream.ok ? "success" : "error", upstream.status, upstream.ok ? undefined : `Upstream returned ${upstream.status}`);
          controller.close();
          return;
        }
        outputBytes += result.value.byteLength;
        requestLogService.progressBytes(requestId, outputBytes);
        controller.enqueue(result.value);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        finish("error", upstream.status || 502, message);
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
      if (completeOnEnd) finish("error", 499, "Client disconnected while receiving media");
    },
  });
  return new Response(stream, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
}

async function proxyMediaRequest(input: {
  request: Request;
  body?: any;
  headers: Record<string, string | undefined>;
  set: { status?: number | string };
  gatewayKeyName: string;
  route: MediaRoute;
  mediaType: MediaType;
  resourcePath: string;
  method?: string;
  query?: string;
  formData?: boolean;
}) {
  const { request, headers, set, gatewayKeyName, route, mediaType, resourcePath } = input;
  const body = withMediaDefaults(input.body, route, mediaType);
  const contentType = headers["content-type"] ?? null;
  const requestLogId = requestLogService.start({
    providerId: route.provider.id,
    providerName: route.provider.name,
    modelName: route.model.model_id,
    clientIp: clientIp(request),
    requesterName: gatewayKeyName,
    streaming: mediaType === "text-to-speech" || mediaType === "video-content",
    requestDetails: {
      method: input.method ?? request.method,
      url: new URL(request.url).pathname,
      stream: mediaType === "text-to-speech" || mediaType === "video-content",
      klove: { media_type: mediaType },
      payload: safeRequestDetails(body, contentType),
    },
  });
  requestLogService.setCredential(requestLogId, route.credential);
  const outgoingHeaders: Record<string, string> = {
    Authorization: `Bearer ${route.credential.secret ?? ""}`,
    Accept: headers.accept ?? "*/*",
  };
  if (!input.formData && body != null) outgoingHeaders["Content-Type"] = "application/json";
  const providerHeaders = upstreamProviderHeaders(route.provider, outgoingHeaders, undefined, headers["x-opencode-session"] ?? headers["x-session-id"]);
  const url = endpointUrl(route.provider, resourcePath, input.query);
  const started = performance.now();
  try {
    await assertSafeRemoteUrl(url);
    const upstream = await fetch(url, {
      method: input.method ?? request.method,
      headers: providerHeaders,
      body: body == null ? undefined : input.formData ? formBody(body, route.model.model_id) : JSON.stringify({ ...body, model: route.model.model_id }),
      signal: request.signal,
    });
    if (upstream.ok) {
      credentialService.clearError(route.credential.id);
      credentialService.clearCooldown(route.credential.id);
    } else if ([401, 403].includes(upstream.status)) {
      credentialService.markError(route.credential.id, `Upstream returned ${upstream.status}`);
    }
    if (!upstream.ok) {
      const errorBody = await upstream.clone().json().catch(() => null);
      requestLogService.captureError(requestLogId, errorBody ?? { status: upstream.status });
      set.status = upstream.status;
    }
    return { upstream, requestLogId, started, mediaType };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    requestLogService.captureError(requestLogId, error);
    requestLogService.complete(requestLogId, { status: "error", statusCode: 502, error: message, durationMs: Math.round(performance.now() - started) });
    set.status = 502;
    return { error: apiError(message, "server_error", "upstream_request_failed") };
  }
}

async function requireGatewayKey(headers: Record<string, string | undefined>) {
  const auth = headers.authorization;
  const key = auth?.startsWith("Bearer ") ? auth.slice(7) : headers["x-api-key"];
  return key ? keyService.verify(key) : null;
}

function saveVideoJob(proxyId: string, upstreamId: string, route: MediaRoute, status: string, response: unknown) {
  getDb().query(`INSERT INTO media_video_jobs (id, upstream_id, provider_id, model_id, model_name, status, response_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status = excluded.status, response_json = excluded.response_json, updated_at = datetime('now')`)
    .run(proxyId, upstreamId, route.provider.id, route.model.id, route.requestedModel, status, JSON.stringify(response));
}

function getVideoJob(id: string) {
  return getDb().query("SELECT * FROM media_video_jobs WHERE id = ?").get(id) as {
    id: string; upstream_id: string; provider_id: string; model_id: string; model_name: string; status: string; response_json: string | null;
  } | null;
}

function routeForVideoJob(job: NonNullable<ReturnType<typeof getVideoJob>>) {
  const provider = providerService.findById(job.provider_id);
  const model = modelService.findById(job.model_id);
  if (!provider || !model || !provider.is_active || !model.is_active || !isOpenAICompatibleProtocol(provider.protocol)) return null;
  const sequence = provider.credential_mode === "round_robin" ? credentialService.beginRequest(provider.id) : undefined;
  const credential = credentialService.select(provider.id, provider.credential_mode, provider.fixed_credential_id, sequence)
    || credentialService.select(provider.id, "round_robin", null, sequence);
  if (!credential) return null;
  return { provider, model, requestedModel: job.model_name, credential } as MediaRoute;
}

async function videoAction(context: any, action: "retrieve" | "content" | "cancel" | "delete") {
  const { params, request, headers, set, query } = context;
  const apiKey = await requireGatewayKey(headers);
  if (!apiKey) { set.status = 401; return apiError("Valid API key required", "authentication_error"); }
  const job = getVideoJob(params.id);
  if (!job) { set.status = 404; return apiError("Video not found", "invalid_request_error", "video_not_found"); }
  const route = routeForVideoJob(job);
  if (!route) { set.status = 503; return apiError("The provider credential for this video is unavailable", "server_error", "no_active_credential"); }
  const suffix = action === "content" ? `/content${query?.variant ? `?variant=${encodeURIComponent(query.variant)}` : ""}` : action === "cancel" ? "/cancel" : "";
  const path = `videos/${encodeURIComponent(job.upstream_id)}${suffix}`;
  const method = action === "cancel" ? "POST" : action === "delete" ? "DELETE" : "GET";
  const mediaType: MediaType = action === "content" ? "video-content" : action === "cancel" ? "video-cancel" : action === "delete" ? "video-delete" : "video-status";
  const result = await proxyMediaRequest({ request, headers, set, gatewayKeyName: apiKey.name, route, mediaType, resourcePath: path, method });
  if ("error" in result) return result.error;
  if (action === "content") return trackedResponse(result.upstream, result.requestLogId, result.started, mediaType);
  if (!result.upstream.ok) return trackedResponse(result.upstream, result.requestLogId, result.started, mediaType);
  if (action === "delete") {
    getDb().query("DELETE FROM media_video_jobs WHERE id = ?").run(job.id);
    const response = await result.upstream.json().catch(() => ({ id: job.id, object: "video.deleted", deleted: true }));
    requestLogService.complete(result.requestLogId, { statusCode: result.upstream.status, durationMs: Math.round(performance.now() - result.started), responseDetails: response });
    return { ...response, id: job.id };
  }
  const response = await result.upstream.json().catch(() => null);
  if (!response) { set.status = 502; requestLogService.complete(result.requestLogId, { status: "error", statusCode: 502, error: "Invalid JSON response" }); return apiError("Provider returned an invalid video response", "server_error"); }
  const rewritten = { ...response, id: job.id };
  saveVideoJob(job.id, job.upstream_id, route, String(response.status ?? job.status), rewritten);
  requestLogService.complete(result.requestLogId, { statusCode: result.upstream.status, durationMs: Math.round(performance.now() - result.started), responseDetails: rewritten });
  return rewritten;
}

export const mediaProxyPlugin = (app: Elysia) => app
  .post("/v1/images/generations", async (context) => {
    const { body, headers, request, set } = context as any;
    const modelName = bodyValue(body, "model");
    const resolved = await resolveMediaRoute(modelName, "image_generation", headers);
    if ("error" in resolved) { set.status = resolved.status ?? 400; return resolved.error; }
    if (typeof bodyValue(body, "prompt") !== "string" || !String(bodyValue(body, "prompt")).trim()) { set.status = 400; return apiError("prompt is required"); }
    const result = await proxyMediaRequest({ request, body, headers, set, gatewayKeyName: resolved.gatewayKeyName, route: resolved.route, mediaType: "image-generation", resourcePath: "images/generations" });
    if ("error" in result) return result.error;
    return trackedResponse(result.upstream, result.requestLogId, result.started, result.mediaType);
  }, { body: t.Any() })
  .post("/v1/images/edits", async (context) => {
    const { body, headers, request, set } = context as any;
    const resolved = await resolveMediaRoute(bodyValue(body, "model"), "image_generation", headers);
    if ("error" in resolved) { set.status = resolved.status ?? 400; return resolved.error; }
    const contentType = headers["content-type"] ?? "";
    if (!contentType.includes("multipart/form-data")) { set.status = 400; return apiError("Image edits require multipart/form-data"); }
    const result = await proxyMediaRequest({ request, body, headers, set, gatewayKeyName: resolved.gatewayKeyName, route: resolved.route, mediaType: "image-edit", resourcePath: "images/edits", formData: true });
    if ("error" in result) return result.error;
    return trackedResponse(result.upstream, result.requestLogId, result.started, result.mediaType);
  }, { body: t.Any() })
  .post("/v1/images/variations", async (context) => {
    const { body, headers, request, set } = context as any;
    const resolved = await resolveMediaRoute(bodyValue(body, "model"), "image_generation", headers);
    if ("error" in resolved) { set.status = resolved.status ?? 400; return resolved.error; }
    const contentType = headers["content-type"] ?? "";
    if (!contentType.includes("multipart/form-data")) { set.status = 400; return apiError("Image variations require multipart/form-data"); }
    const result = await proxyMediaRequest({ request, body, headers, set, gatewayKeyName: resolved.gatewayKeyName, route: resolved.route, mediaType: "image-variation", resourcePath: "images/variations", formData: true });
    if ("error" in result) return result.error;
    return trackedResponse(result.upstream, result.requestLogId, result.started, result.mediaType);
  }, { body: t.Any() })
  .post("/v1/audio/speech", async (context) => {
    const { body, headers, request, set } = context as any;
    const resolved = await resolveMediaRoute(bodyValue(body, "model"), "text_to_speech", headers);
    if ("error" in resolved) { set.status = resolved.status ?? 400; return resolved.error; }
    if (typeof bodyValue(body, "input") !== "string" || !String(bodyValue(body, "input")).trim()) { set.status = 400; return apiError("input is required"); }
    const result = await proxyMediaRequest({ request, body, headers, set, gatewayKeyName: resolved.gatewayKeyName, route: resolved.route, mediaType: "text-to-speech", resourcePath: "audio/speech" });
    if ("error" in result) return result.error;
    return trackedResponse(result.upstream, result.requestLogId, result.started, result.mediaType);
  }, { body: t.Any() })
  .post("/v1/videos", async (context) => {
    const { body, headers, request, set } = context as any;
    const resolved = await resolveMediaRoute(bodyValue(body, "model"), "video_generation", headers);
    if ("error" in resolved) { set.status = resolved.status ?? 400; return resolved.error; }
    if (typeof bodyValue(body, "prompt") !== "string" || !String(bodyValue(body, "prompt")).trim()) { set.status = 400; return apiError("prompt is required"); }
    const isForm = (headers["content-type"] ?? "").includes("multipart/form-data");
    const result = await proxyMediaRequest({ request, body, headers, set, gatewayKeyName: resolved.gatewayKeyName, route: resolved.route, mediaType: "video-generation", resourcePath: "videos", formData: isForm });
    if ("error" in result) return result.error;
    if (!result.upstream.ok) return trackedResponse(result.upstream, result.requestLogId, result.started, result.mediaType);
    const response = await result.upstream.json().catch(() => null);
    if (!response || typeof response.id !== "string") { set.status = 502; requestLogService.complete(result.requestLogId, { status: "error", statusCode: 502, error: "Provider response did not include a video ID" }); return apiError("Provider returned a video response without an ID", "server_error"); }
    const proxyId = `video_${crypto.randomUUID().replaceAll("-", "")}`;
    const rewritten = { ...response, id: proxyId, model: resolved.route.requestedModel };
    saveVideoJob(proxyId, response.id, resolved.route, String(response.status ?? "queued"), rewritten);
    requestLogService.complete(result.requestLogId, { statusCode: result.upstream.status, durationMs: Math.round(performance.now() - result.started), responseDetails: rewritten });
    return rewritten;
  }, { body: t.Any() })
  .get("/v1/videos", async ({ headers, set, query, request }) => {
    const apiKey = await requireGatewayKey(headers);
    if (!apiKey) { set.status = 401; return apiError("Valid API key required", "authentication_error"); }
    const started = performance.now();
    const requestLogId = requestLogService.start({
      providerId: null,
      providerName: "Media API",
      modelName: "video list",
      clientIp: clientIp(request),
      requesterName: apiKey.name,
      requestDetails: { method: "GET", url: "/v1/videos", klove: { media_type: "video-list" } },
    });
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const after = typeof query.after === "string" ? query.after : null;
    const rows = getDb().query(`SELECT id, response_json FROM media_video_jobs
      WHERE (? IS NULL OR created_at < (SELECT created_at FROM media_video_jobs WHERE id = ?)
        OR (created_at = (SELECT created_at FROM media_video_jobs WHERE id = ?) AND id < ?))
      ORDER BY created_at DESC, id DESC LIMIT ?`).all(after, after, after, after, limit + 1) as { id: string; response_json: string | null }[];
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).flatMap((row) => { try { return row.response_json ? [JSON.parse(row.response_json)] : []; } catch { return []; } });
    const response = { object: "list", data, has_more: hasMore };
    requestLogService.complete(requestLogId, { status: "success", statusCode: 200, durationMs: Math.round(performance.now() - started), responseDetails: { media_type: "video-list", count: data.length } });
    return response;
  })
  .get("/v1/videos/:id/content", (context) => videoAction(context, "content"))
  .post("/v1/videos/:id/cancel", (context) => videoAction(context, "cancel"))
  .get("/v1/videos/:id", (context) => videoAction(context, "retrieve"))
  .delete("/v1/videos/:id", (context) => videoAction(context, "delete"));
