import { Elysia, t } from "elysia";
import { createHmac } from "node:crypto";
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
import { clientIp } from "../services/request-ip";
import { getSecuritySecrets } from "../services/security.service";
import { isImageModel, isTtsModel, isVideoModel, isMediaModel } from "../services/model-type";

type MediaType = "image-generation" | "image-edit" | "image-variation" | "text-to-speech" | "video-generation" | "video-status" | "video-content" | "video-cancel" | "video-delete" | "video-list";

type MediaRoute = {
  provider: NonNullable<ReturnType<typeof providerService.findById>>;
  model: NonNullable<ReturnType<typeof modelService.findByPublicId>>;
  requestedModel: string;
  credential: NonNullable<ReturnType<typeof credentialService.select>>;
};

const apiError = (message: string, type = "invalid_request_error", code: string | null = null) => ({ error: { message, type, code } });

type MediaRejectionContext = {
  headers: Record<string, string | undefined>;
  request: Request;
  server?: unknown;
  body?: unknown;
};

function safeRejectionPayload(body: unknown) {
  if (body == null) return undefined;
  if (typeof body !== "object") return { value: body };
  // FormData (image edits/variations): summarize keys and file metadata
  // instead of logging an empty object or raw binary.
  if (typeof (body as FormData).entries === "function") {
    const fields: Record<string, unknown> = {};
    for (const [key, value] of (body as unknown as FormData).entries() as Iterable<[string, unknown]>) {
      if (value instanceof Blob) {
        const blob = value as Blob & { name?: string };
        fields[key] = { filename: blob.name ?? null, size: blob.size, content_type: blob.type };
      } else {
        fields[key] = value;
      }
    }
    return { content_type: "multipart/form-data", fields };
  }
  return body;
}

function logMediaRejection(ctx: MediaRejectionContext, input: {
  statusCode: number;
  error: string;
  providerId?: string | null;
  providerName?: string | null;
  modelName?: string | null;
  requesterName?: string | null;
  apiKeyPrefix?: string | null;
}) {
  try {
    requestLogService.logRejection({
      providerId: input.providerId ?? null,
      providerName: input.providerName ?? null,
      modelName: input.modelName ?? null,
      statusCode: input.statusCode,
      error: input.error,
      clientIp: clientIp(ctx.request, ctx.headers, ctx.server as any),
      requesterName: input.requesterName ?? null,
      apiKeyPrefix: input.apiKeyPrefix ?? null,
      requestDetails: { method: ctx.request.method, url: new URL(ctx.request.url).pathname, headers: ctx.headers, payload: safeRejectionPayload(ctx.body), saturn: { rejected: true } },
    });
  } catch { /* Rejection logging must never affect the response. */ }
}

function endpointUrl(provider: MediaRoute["provider"], resourcePath: string, query?: string) {
  const base = provider.base_url.replace(/\/+$/, "");
  if (resourcePath.startsWith("../")) {
    const parent = base.replace(/\/v1$/i, "");
    return `${parent}/${resourcePath.slice(3)}${query ?? ""}`;
  }
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

function sanitizeMediaPayload(body: any, route: MediaRoute, mediaType: MediaType) {
  if (!body || typeof body !== "object") return body;
  if (body instanceof FormData) return body;

  const sanitized = { ...body };
  const isAgnes = route.provider.name.toLowerCase().includes("agnes") ||
                  route.provider.base_url.includes("agnes") ||
                  route.model.model_id.toLowerCase().includes("agnes");

  // 1. Video generation
  if (mediaType === "video-generation") {
    if (isAgnes) {
      // Agnes Video API rules (official documentation):
      // - mode: "text" | "keyframe" | "reference". Default for text-to-video is "text".
      // - size: for flash models, size MUST be "720P".
      // - seconds: string from "4"-"12".
      // - aspect_ratio: default "16:9".
      if (!sanitized.mode || sanitized.mode === "std") {
        sanitized.mode = "text";
      }
      if (route.model.model_id.includes("flash") || sanitized.size === "1280x720" || !sanitized.size) {
        sanitized.size = "720P";
      }
      if (!sanitized.aspect_ratio) {
        sanitized.aspect_ratio = "16:9";
      }
      if (sanitized.seconds !== undefined) {
        sanitized.seconds = String(sanitized.seconds);
      }
      delete sanitized.quality;
    } else {
      if (!sanitized.mode) {
        sanitized.mode = (route.model.media_settings?.video as any)?.mode || "std";
      }
    }
  }

  // 2. Image generation
  if (mediaType === "image-generation") {
    const isDallE3 = /dall[-_ ]?e[-_ ]?3/i.test(route.model.model_id);
    if (!isDallE3) {
      delete sanitized.quality;
      delete sanitized.style;
    }
    if (isAgnes) {
      // Agnes Image API rules (official documentation):
      // - Do not place response_format at the top level (causes 400). Move to extra_body if present.
      // - Only model, prompt, and size are required.
      // - Do not pass 'n' (causes errors on text image queue).
      delete sanitized.n;
      if (sanitized.response_format) {
        if (!sanitized.extra_body || typeof sanitized.extra_body !== "object") sanitized.extra_body = {};
        sanitized.extra_body.response_format = sanitized.response_format;
        delete sanitized.response_format;
      }
    }
  }

  return sanitized;
}

type MediaRouteCtx = {
  headers: Record<string, string | undefined>;
  request: Request;
  server?: unknown;
  body?: unknown;
};

async function resolveMediaRoute(modelName: unknown, modality: "image_generation" | "text_to_speech" | "video_generation", ctx: MediaRouteCtx) {
  const reject = (statusCode: number, error: string, details: Partial<Parameters<typeof logMediaRejection>[1]> = {}) => {
    const parsedHint = typeof modelName === "string" ? modelName : null;
    logMediaRejection(ctx, { statusCode, error, modelName: details.modelName ?? parsedHint, ...details });
  };
  const { headers } = ctx;
  if (typeof modelName !== "string" || !modelName) { reject(400, "A model ID in provider/model format is required"); return { error: apiError("A model ID in provider/model format is required") } as const; }
  const parsed = parseModelName(modelName);
  if (!parsed) { reject(400, 'Model must use "provider/model" format'); return { error: apiError('Model must use "provider/model" format') } as const; }
  const provider = providerService.findByName(parsed.providerName);
  if (!provider || !provider.is_active) { reject(404, `Provider "${parsed.providerName}" was not found or is disabled`, { providerName: parsed.providerName, modelName: parsed.modelId }); return { status: 404, error: apiError(`Provider "${parsed.providerName}" was not found or is disabled`, "invalid_request_error", "provider_not_found") } as const; }
  if (!isOpenAICompatibleProtocol(provider.protocol)) { reject(400, `Provider "${provider.name}" does not expose OpenAI-compatible media endpoints`, { providerId: provider.id, providerName: provider.name, modelName: parsed.modelId }); return { status: 400, error: apiError(`Provider "${provider.name}" does not expose OpenAI-compatible media endpoints`, "invalid_request_error", "incompatible_provider") } as const; }
  const model = modelService.findByPublicId(provider.id, parsed.modelId);
  if (!model || !model.is_active) { reject(404, `Model "${parsed.modelId}" was not found or is disabled`, { providerId: provider.id, providerName: provider.name, modelName: parsed.modelId }); return { status: 404, error: apiError(`Model "${parsed.modelId}" was not found or is disabled`, "invalid_request_error", "model_not_found") } as const; }
  
  const supportsRequestedModality = modality === "image_generation"
    ? isImageModel(model)
    : modality === "text_to_speech"
      ? isTtsModel(model)
      : isVideoModel(model);

  if (!supportsRequestedModality || model.capabilities?.[modality] === false) {
    reject(400, `Model "${modelName}" does not support ${modality.replaceAll("_", " ")}`, { providerId: provider.id, providerName: provider.name, modelName: parsed.modelId });
    return { status: 400, error: apiError(`Model "${modelName}" does not support ${modality.replaceAll("_", " ")}`, "invalid_request_error", "unsupported_model_modality") } as const;
  }

  const apiKey = await authenticateMediaCaller(headers);
  if (!apiKey) { reject(401, "Valid API key required", { providerName: "(unauthenticated)", modelName: `${provider.name}/${model.model_id}`, requesterName: null }); return { status: 401, error: apiError("Valid API key required", "authentication_error") } as const; }

  const sequence = provider.credential_mode === "round_robin" || provider.credential_mode === "failover" ? credentialService.beginRequest(provider.id) : undefined;
  const credential = credentialService.select(provider.id, provider.credential_mode, provider.fixed_credential_id, sequence)
    || credentialService.select(provider.id, provider.credential_mode === "failover" ? "failover" : "round_robin", null, sequence);
  if (!credential) { reject(503, `Provider "${provider.name}" has no active credential`, { providerId: provider.id, providerName: provider.name, modelName: model.model_id, requesterName: apiKey.name, apiKeyPrefix: apiKey.prefix }); return { status: 503, error: apiError(`Provider "${provider.name}" has no active credential`, "server_error", "no_active_credential") } as const; }
  return { route: { provider, model, requestedModel: modelName, credential } as MediaRoute, gatewayKeyName: apiKey.name, gatewayKeyPrefix: apiKey.prefix } as const;
}

function trackedResponse(upstream: Response, requestId: string, started: number, type: MediaType, completeOnEnd = true): Response {
  const responseHeaders = new Headers(upstream.headers);
  for (const header of [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "set-cookie",
    "content-encoding",
    "content-length",
  ]) responseHeaders.delete(header);
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
  server?: unknown;
  gatewayKeyName: string;
  gatewayKeyPrefix?: string | null;
  route: MediaRoute;
  mediaType: MediaType;
  resourcePath: string;
  method?: string;
  query?: string;
  formData?: boolean;
}) {
  const { request, headers, set, gatewayKeyName, gatewayKeyPrefix, route, mediaType, resourcePath } = input;
  const defaultedBody = withMediaDefaults(input.body, route, mediaType);
  const body = sanitizeMediaPayload(defaultedBody, route, mediaType);
  const contentType = headers["content-type"] ?? null;
  const requestLogId = requestLogService.start({
    providerId: route.provider.id,
    providerName: route.provider.name,
    modelName: route.model.model_id,
    clientIp: clientIp(request, headers, input.server as any),
    requesterName: gatewayKeyName,
    apiKeyPrefix: gatewayKeyPrefix,
    streaming: mediaType === "text-to-speech" || mediaType === "video-content",
    requestDetails: {
      method: input.method ?? request.method,
      url: new URL(request.url).pathname,
      stream: mediaType === "text-to-speech" || mediaType === "video-content",
      saturn: { media_type: mediaType },
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

async function authenticateMediaCaller(headers: Record<string, string | undefined>) {
  const auth = headers.authorization;
  const key = auth?.startsWith("Bearer ") ? auth.slice(7) : headers["x-api-key"];
  if (!key) return null;
  if (key === keyService.internalKey()) {
    return { name: "Saturn Admin", prefix: "internal" };
  }
  const verifiedKey = await keyService.verify(key);
  if (verifiedKey) return { name: verifiedKey.name, prefix: verifiedKey.prefix };

  try {
    const { jwtSecret } = getSecuritySecrets();
    const parts = key.split(".");
    if (parts.length === 3) {
      const [headerB64, payloadB64, signatureB64] = parts;
      const data = `${headerB64}.${payloadB64}`;
      const hmac = createHmac("sha256", jwtSecret);
      hmac.update(data);
      const expectedSig = hmac.digest("base64url");
      if (expectedSig === signatureB64) {
        const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
        if (!payload.exp || payload.exp > Math.floor(Date.now() / 1000)) {
          return { name: "Saturn Admin", prefix: "admin" };
        }
      }
    }
  } catch {
    // ignore token decoding errors
  }
  return null;
}

async function requireGatewayKey(headers: Record<string, string | undefined>) {
  return authenticateMediaCaller(headers);
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
  const sequence = provider.credential_mode === "round_robin" || provider.credential_mode === "failover" ? credentialService.beginRequest(provider.id) : undefined;
  const credential = credentialService.select(provider.id, provider.credential_mode, provider.fixed_credential_id, sequence)
    || credentialService.select(provider.id, provider.credential_mode === "failover" ? "failover" : "round_robin", null, sequence);
  if (!credential) return null;
  return { provider, model, requestedModel: job.model_name, credential } as MediaRoute;
}

async function videoAction(context: any, action: "retrieve" | "content" | "cancel" | "delete") {
  const { params, request, headers, set, query, server } = context;
  const apiKey = await requireGatewayKey(headers);
  if (!apiKey) {
    logMediaRejection({ headers, request, server }, { statusCode: 401, error: "Valid API key required", providerName: "Media API", modelName: `video ${action}` });
    set.status = 401;
    return apiError("Valid API key required", "authentication_error");
  }
  const job = getVideoJob(params.id);
  if (!job) {
    logMediaRejection({ headers, request, server }, { statusCode: 404, error: "Video not found", providerName: "Media API", modelName: `video ${action}`, requesterName: apiKey.name, apiKeyPrefix: apiKey.prefix });
    set.status = 404;
    return apiError("Video not found", "invalid_request_error", "video_not_found");
  }
  const route = routeForVideoJob(job);
  if (!route) {
    logMediaRejection({ headers, request, server }, { statusCode: 503, error: "The provider credential for this video is unavailable", providerId: job.provider_id, providerName: "Media API", modelName: job.model_name, requesterName: apiKey.name, apiKeyPrefix: apiKey.prefix });
    set.status = 503;
    return apiError("The provider credential for this video is unavailable", "server_error", "no_active_credential");
  }
  const isAgnes = route.provider.name.toLowerCase().includes("agnes") ||
                  route.provider.base_url.includes("agnes") ||
                  job.model_name.toLowerCase().includes("agnes");

  const suffix = action === "content" ? `/content${query?.variant ? `?variant=${encodeURIComponent(query.variant)}` : ""}` : action === "cancel" ? "/cancel" : "";
  let path = `videos/${encodeURIComponent(job.upstream_id)}${suffix}`;
  let queryParam = query?.variant ? `?variant=${encodeURIComponent(query.variant)}` : undefined;

  if (isAgnes && action === "retrieve") {
    path = `../agnesapi`;
    const modelParam = job.model_name.includes("/") ? job.model_name.split("/")[1] : job.model_name;
    queryParam = `?video_id=${encodeURIComponent(job.upstream_id)}&model_name=${encodeURIComponent(modelParam)}`;
  }

  const method = action === "cancel" ? "POST" : action === "delete" ? "DELETE" : "GET";
  const mediaType: MediaType = action === "content" ? "video-content" : action === "cancel" ? "video-cancel" : action === "delete" ? "video-delete" : "video-status";
  const result = await proxyMediaRequest({ request, headers, server, set, gatewayKeyName: apiKey.name, gatewayKeyPrefix: apiKey.prefix, route, mediaType, resourcePath: path, method, query: queryParam });
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
    const { body, headers, request, set, server } = context as any;
    const modelName = bodyValue(body, "model");
    const resolved = await resolveMediaRoute(modelName, "image_generation", { headers, request, server, body });
    if ("error" in resolved) { set.status = resolved.status ?? 400; return resolved.error; }
    if (typeof bodyValue(body, "prompt") !== "string" || !String(bodyValue(body, "prompt")).trim()) { logMediaRejection({ headers, request, server, body }, { statusCode: 400, error: "prompt is required", providerId: resolved.route.provider.id, providerName: resolved.route.provider.name, modelName: resolved.route.model.model_id, requesterName: resolved.gatewayKeyName, apiKeyPrefix: resolved.gatewayKeyPrefix }); set.status = 400; return apiError("prompt is required"); }
    const result = await proxyMediaRequest({ request, body, headers, server, set, gatewayKeyName: resolved.gatewayKeyName, gatewayKeyPrefix: resolved.gatewayKeyPrefix, route: resolved.route, mediaType: "image-generation", resourcePath: "images/generations" });
    if ("error" in result) return result.error;
    const isJson = result.upstream.headers.get("content-type")?.includes("application/json");
    if (isJson) {
      const responseData = await result.upstream.json().catch(() => null);
      const statusCode = result.upstream.status;
      requestLogService.complete(result.requestLogId, {
        status: result.upstream.ok ? "success" : "error",
        statusCode,
        durationMs: Math.round(performance.now() - result.started),
        responseDetails: responseData ?? { status_code: statusCode },
        ...(!result.upstream.ok ? { error: `Upstream returned ${statusCode}` } : {}),
      });
      set.status = statusCode;
      return responseData;
    }
    return trackedResponse(result.upstream, result.requestLogId, result.started, result.mediaType);
  }, { body: t.Any() })
  .post("/v1/images/edits", async (context) => {
    const { body, headers, request, set, server } = context as any;
    const resolved = await resolveMediaRoute(bodyValue(body, "model"), "image_generation", { headers, request, server, body });
    if ("error" in resolved) { set.status = resolved.status ?? 400; return resolved.error; }
    const contentType = headers["content-type"] ?? "";
    if (!contentType.includes("multipart/form-data")) { logMediaRejection({ headers, request, server, body }, { statusCode: 400, error: "Image edits require multipart/form-data", providerId: resolved.route.provider.id, providerName: resolved.route.provider.name, modelName: resolved.route.model.model_id, requesterName: resolved.gatewayKeyName, apiKeyPrefix: resolved.gatewayKeyPrefix }); set.status = 400; return apiError("Image edits require multipart/form-data"); }
    const result = await proxyMediaRequest({ request, body, headers, server, set, gatewayKeyName: resolved.gatewayKeyName, gatewayKeyPrefix: resolved.gatewayKeyPrefix, route: resolved.route, mediaType: "image-edit", resourcePath: "images/edits", formData: true });
    if ("error" in result) return result.error;
    return trackedResponse(result.upstream, result.requestLogId, result.started, result.mediaType);
  }, { body: t.Any() })
  .post("/v1/images/variations", async (context) => {
    const { body, headers, request, set, server } = context as any;
    const resolved = await resolveMediaRoute(bodyValue(body, "model"), "image_generation", { headers, request, server, body });
    if ("error" in resolved) { set.status = resolved.status ?? 400; return resolved.error; }
    const contentType = headers["content-type"] ?? "";
    if (!contentType.includes("multipart/form-data")) { logMediaRejection({ headers, request, server, body }, { statusCode: 400, error: "Image variations require multipart/form-data", providerId: resolved.route.provider.id, providerName: resolved.route.provider.name, modelName: resolved.route.model.model_id, requesterName: resolved.gatewayKeyName, apiKeyPrefix: resolved.gatewayKeyPrefix }); set.status = 400; return apiError("Image variations require multipart/form-data"); }
    const result = await proxyMediaRequest({ request, body, headers, server, set, gatewayKeyName: resolved.gatewayKeyName, gatewayKeyPrefix: resolved.gatewayKeyPrefix, route: resolved.route, mediaType: "image-variation", resourcePath: "images/variations", formData: true });
    if ("error" in result) return result.error;
    return trackedResponse(result.upstream, result.requestLogId, result.started, result.mediaType);
  }, { body: t.Any() })
  .post("/v1/audio/speech", async (context) => {
    const { body, headers, request, set, server } = context as any;
    const resolved = await resolveMediaRoute(bodyValue(body, "model"), "text_to_speech", { headers, request, server, body });
    if ("error" in resolved) { set.status = resolved.status ?? 400; return resolved.error; }
    if (typeof bodyValue(body, "input") !== "string" || !String(bodyValue(body, "input")).trim()) { logMediaRejection({ headers, request, server, body }, { statusCode: 400, error: "input is required", providerId: resolved.route.provider.id, providerName: resolved.route.provider.name, modelName: resolved.route.model.model_id, requesterName: resolved.gatewayKeyName, apiKeyPrefix: resolved.gatewayKeyPrefix }); set.status = 400; return apiError("input is required"); }
    const result = await proxyMediaRequest({ request, body, headers, server, set, gatewayKeyName: resolved.gatewayKeyName, gatewayKeyPrefix: resolved.gatewayKeyPrefix, route: resolved.route, mediaType: "text-to-speech", resourcePath: "audio/speech" });
    if ("error" in result) return result.error;
    return trackedResponse(result.upstream, result.requestLogId, result.started, result.mediaType);
  }, { body: t.Any() })
  .post("/v1/videos", async (context) => {
    const { body, headers, request, set, server } = context as any;
    const resolved = await resolveMediaRoute(bodyValue(body, "model"), "video_generation", { headers, request, server, body });
    if ("error" in resolved) { set.status = resolved.status ?? 400; return resolved.error; }
    if (typeof bodyValue(body, "prompt") !== "string" || !String(bodyValue(body, "prompt")).trim()) { logMediaRejection({ headers, request, server, body }, { statusCode: 400, error: "prompt is required", providerId: resolved.route.provider.id, providerName: resolved.route.provider.name, modelName: resolved.route.model.model_id, requesterName: resolved.gatewayKeyName, apiKeyPrefix: resolved.gatewayKeyPrefix }); set.status = 400; return apiError("prompt is required"); }
    const isForm = (headers["content-type"] ?? "").includes("multipart/form-data");
    const result = await proxyMediaRequest({ request, body, headers, server, set, gatewayKeyName: resolved.gatewayKeyName, gatewayKeyPrefix: resolved.gatewayKeyPrefix, route: resolved.route, mediaType: "video-generation", resourcePath: "videos", formData: isForm });
    if ("error" in result) return result.error;
    if (!result.upstream.ok) return trackedResponse(result.upstream, result.requestLogId, result.started, result.mediaType);
    const response = await result.upstream.json().catch(() => null);
    const upstreamId = typeof response?.id === "string" ? response.id : typeof response?.video_id === "string" ? response.video_id : typeof response?.task_id === "string" ? response.task_id : null;
    if (!response || !upstreamId) { set.status = 502; requestLogService.complete(result.requestLogId, { status: "error", statusCode: 502, error: "Provider response did not include a video ID" }); return apiError("Provider returned a video response without an ID", "server_error"); }
    const proxyId = `video_${crypto.randomUUID().replaceAll("-", "")}`;
    const rewritten = { ...response, id: proxyId, model: resolved.route.requestedModel };
    saveVideoJob(proxyId, upstreamId, resolved.route, String(response.status ?? "queued"), rewritten);
    requestLogService.complete(result.requestLogId, { statusCode: result.upstream.status, durationMs: Math.round(performance.now() - result.started), responseDetails: rewritten });
    return rewritten;
  }, { body: t.Any() })
  .get("/v1/videos", async ({ headers, set, query, request, server }) => {
    const apiKey = await requireGatewayKey(headers);
    if (!apiKey) {
      logMediaRejection({ headers, request, server }, { statusCode: 401, error: "Valid API key required", providerName: "Media API", modelName: "video list" });
      set.status = 401;
      return apiError("Valid API key required", "authentication_error");
    }
    const started = performance.now();
    const requestLogId = requestLogService.start({
      providerId: null,
      providerName: "Media API",
      modelName: "video list",
      clientIp: clientIp(request, headers, server as any),
      requesterName: apiKey.name,
      apiKeyPrefix: apiKey.prefix,
      requestDetails: { method: "GET", url: "/v1/videos", saturn: { media_type: "video-list" } },
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
  .delete("/v1/videos/:id", (context) => videoAction(context, "delete"))
  .get("/api/media/models", async ({ headers, set }) => {
    const auth = await authenticateMediaCaller(headers);
    if (!auth) {
      set.status = 401;
      return apiError("Valid API key or admin token required", "authentication_error");
    }
    const allModels = modelService.findAllActiveWithProvider();
    const mediaModels = allModels.filter((m) => isMediaModel(m)).map((m) => {
      const caps = m.capabilities ?? {};
      const isImg = isImageModel(m);
      const isTts = isTtsModel(m);
      const isVid = isVideoModel(m);
      return {
        id: m.id,
        public_id: providerModelPublicId(m.provider_name, m),
        model_id: m.model_id,
        pretty_id: m.pretty_id,
        display_name: m.display_name,
        provider_id: m.provider_id,
        provider_name: m.provider_name,
        model_type: m.model_type,
        input_modalities: m.input_modalities,
        output_modalities: m.output_modalities,
        capabilities: {
          ...caps,
          image_generation: isImg ? true : (caps.image_generation ?? false),
          text_to_speech: isTts ? true : (caps.text_to_speech ?? false),
          video_generation: isVid ? true : (caps.video_generation ?? false),
        },
        media_settings: m.media_settings ?? {},
      };
    });
    return { data: mediaModels };
  });
