import { Elysia, t } from "elysia";
import { keyService } from "../services/key.service";
import { providerService } from "../services/provider.service";
import { modelService } from "../services/model.service";
import { credentialService } from "../services/credential.service";
import { requestLogService } from "../services/request-log.service";
import { upstreamProviderHeaders } from "../services/provider-headers";
import { assertSafeRemoteUrl } from "../services/ssrf";
import { parseModelName } from "../clients/openai";
import { clientIp } from "../services/request-ip";

const apiError = (message: string, type = "invalid_request_error", code: string | null = null) => ({
  error: { message, type, code },
});

type SystemOneRejectionContext = {
  headers: Record<string, string | undefined>;
  request: Request;
  server?: unknown;
  body?: unknown;
};

function logSystemOneRejection(
  ctx: SystemOneRejectionContext,
  input: {
    statusCode: number;
    error: string;
    providerId?: string | null;
    providerName?: string | null;
    modelName?: string | null;
    requesterName?: string | null;
    apiKeyPrefix?: string | null;
  },
) {
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
      requestDetails: {
        method: ctx.request.method,
        url: new URL(ctx.request.url).pathname,
        headers: ctx.headers,
        payload: ctx.body,
        saturn: { rejected: true, endpoint: "/v1/systemone" },
      },
    });
  } catch {
    /* Rejection logging must never affect the response. */
  }
}

async function verifyApiKey(headers: Record<string, string | undefined>) {
  const auth = headers.authorization;
  const xApiKey = headers["x-api-key"];
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : xApiKey;
  if (!token) return null;
  return keyService.verify(token);
}

function resolveSystemOneEndpoint(providerBaseUrl: string): string {
  const base = providerBaseUrl.replace(/\/+$/, "");
  // OpenCode Console SystemOne API
  if (base.includes("opencode.ai")) {
    return "https://opencode.ai/inference/systemone/v1/systemone";
  }
  // Generic TypeSafe AI / SystemOne provider endpoints
  if (base.endsWith("/systemone")) {
    return base;
  }
  if (base.endsWith("/v1")) {
    return `${base}/systemone`;
  }
  return `${base}/v1/systemone`;
}

export const systemOneProxyPlugin = (app: Elysia) =>
  app
    .post(
      "/v1/systemone",
      async ({ body, set, headers, request, server }) => {
        const started = performance.now();
        const rawModel = typeof body?.model === "string" ? body.model.trim() : null;

        const reject = (
          statusCode: number,
          errorMessage: string,
          type = "invalid_request_error",
          code: string | null = null,
          details: {
            providerId?: string | null;
            providerName?: string | null;
            modelName?: string | null;
            requesterName?: string | null;
            apiKeyPrefix?: string | null;
          } = {},
        ) => {
          logSystemOneRejection(
            { headers, request, server, body },
            { statusCode, error: errorMessage, modelName: details.modelName ?? rawModel, ...details },
          );
          set.status = statusCode;
          return apiError(errorMessage, type, code);
        };

        if (!body || typeof body !== "object" || !rawModel) {
          return reject(400, "model is required and must be a string");
        }

        if (body.state === undefined || body.state === null) {
          return reject(400, "state is required for SystemOne evaluation");
        }

        if (!body.questions || typeof body.questions !== "object" || Object.keys(body.questions).length === 0) {
          return reject(400, "questions is required and must contain at least one question definition");
        }

        const auth = await verifyApiKey(headers);
        if (!auth) {
          return reject(401, "Valid API key required", "authentication_error");
        }

        const parsed = parseModelName(rawModel);
        if (!parsed) {
          return reject(400, 'Model must use "provider/model" format');
        }

        const provider = providerService.findByName(parsed.providerName);
        if (!provider || !provider.is_active) {
          return reject(404, `Provider "${parsed.providerName}" was not found or is disabled`, "invalid_request_error", "provider_not_found");
        }

        const model = modelService.findByPublicId(provider.id, parsed.modelId);
        if (!model || !model.is_active) {
          return reject(404, `Model "${parsed.modelId}" was not found or is disabled`, "invalid_request_error", "model_not_found");
        }

        const sequence = provider.credential_mode === "round_robin" || provider.credential_mode === "failover"
          ? credentialService.beginRequest(provider.id)
          : undefined;

        const credential = credentialService.select(provider.id, provider.credential_mode, provider.fixed_credential_id, sequence)
          || credentialService.select(provider.id, provider.credential_mode === "failover" ? "failover" : "round_robin", null, sequence);

        if (!credential) {
          return reject(503, `Provider "${provider.name}" has no active credential`, "server_error", "no_active_credential");
        }

        let upstreamEndpoint: string;
        try {
          upstreamEndpoint = resolveSystemOneEndpoint(provider.base_url);
          assertSafeRemoteUrl(upstreamEndpoint);
        } catch (err: any) {
          return reject(400, `Invalid upstream endpoint: ${err.message}`, "invalid_request_error", "invalid_endpoint");
        }

        // Pass-through puro do payload
        const upstreamPayload = {
          ...body,
          model: model.model_id,
        };

        const requestLogId = requestLogService.start({
          providerId: provider.id,
          providerName: provider.name,
          modelName: model.model_id,
          streaming: false,
          clientIp: clientIp(request, headers, server as any),
          requesterName: auth.name,
          apiKeyPrefix: auth.prefix,
          requestDetails: {
            method: "POST",
            url: "/v1/systemone",
            headers,
            payload: upstreamPayload,
            saturn: {
              endpoint: "/v1/systemone",
              questions_count: Object.keys(body.questions).length,
            },
          },
        });

        const upstreamHeaders = upstreamProviderHeaders({
          provider,
          credential,
          sourceHeaders: headers,
          customHeadersString: provider.custom_headers,
          contentType: "application/json",
        });

        const abort = new AbortController();
        const onClientAbort = () => abort.abort(request.signal.reason);
        if (request.signal.aborted) onClientAbort();
        else request.signal.addEventListener("abort", onClientAbort, { once: true });

        try {
          const upstreamResponse = await fetch(upstreamEndpoint, {
            method: "POST",
            headers: upstreamHeaders,
            body: JSON.stringify(upstreamPayload),
            signal: abort.signal,
          });

          const durationMs = Math.round(performance.now() - started);
          const responseJson = await upstreamResponse.json().catch(() => null);

          if (!upstreamResponse.ok) {
            const errorMessage = responseJson?.error?.message ?? responseJson?.message ?? `Upstream returned ${upstreamResponse.status}`;
            requestLogService.complete(requestLogId, {
              status: "error",
              statusCode: upstreamResponse.status,
              durationMs,
              error: errorMessage,
              responseDetails: responseJson ?? { status_code: upstreamResponse.status },
            });
            set.status = upstreamResponse.status;
            return responseJson ?? apiError(errorMessage, "upstream_error");
          }

          requestLogService.complete(requestLogId, {
            status: "success",
            statusCode: 200,
            durationMs,
            responseDetails: responseJson,
          });

          credentialService.clearError(credential.id);
          credentialService.clearCooldown(credential.id);

          return responseJson;
        } catch (err: any) {
          const durationMs = Math.round(performance.now() - started);
          const message = err instanceof Error ? err.message : String(err);
          requestLogService.complete(requestLogId, {
            status: "error",
            statusCode: 502,
            durationMs,
            error: message,
          });
          set.status = 502;
          return apiError(`Failed to proxy SystemOne request: ${message}`, "server_error");
        }
      },
      { body: t.Any() },
    )
    .post("/v1/systemone/evaluations", (context) => {
      // Alias for evaluations
      return (app as any).handle(
        new Request(new URL("/v1/systemone", context.request.url).toString(), {
          method: "POST",
          headers: context.request.headers,
          body: JSON.stringify(context.body),
        }),
      );
    }, { body: t.Any() });
