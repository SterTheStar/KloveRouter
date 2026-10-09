import { getDb } from "../db/connection";
import { config } from "../config";
import { providerPrefix } from "./provider.service";
import { modelService, providerModelPublicId, type ModelWithProvider } from "./model.service";
import { createSseSplitter, extractSseData, SSE_DONE } from "./sse";
import { chatGenerationService } from "./chat-generation.service";
import { openAICompletionFromSse } from "../api/openai-completion";
import { estimateRequestTextTokens } from "./request-validation";
import { convertResponse, convertStream, requestFromChat } from "../sdk/protocol-converter";

export type ModelPoolStrategy = "priority" | "random";

export interface ModelPoolMember extends ModelWithProvider {
  priority: number;
  fallback: boolean;
  provider_protocol?: string;
}

export interface ModelPool {
  id: string;
  name: string;
  slug: string;
  strategy: ModelPoolStrategy;
  hide_members: boolean;
  is_active: boolean;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
  member_input_limit: number | null;
  member_output_limit: number | null;
  input_limiter_ids: string[];
  output_limiter_ids: string[];
  effective_input_limit: number | null;
  effective_output_limit: number | null;
  created_at: string;
  updated_at: string;
  public_id: string;
  members: ModelPoolMember[];
}

export interface ModelPoolInput {
  name: string;
  slug: string;
  strategy: ModelPoolStrategy;
  hide_members: boolean;
  is_active: boolean;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
  members: Array<{ model_id: string; priority: number; fallback?: boolean }>;
}

export function validatePoolGenerationOptions(pool: Pick<ModelPool, "strategy" | "members">) {
  if (!pool.members.some((member) => member.is_active)) return "At least one active member model is required";
  if (pool.strategy === "priority" && !pool.members[0].is_active) return "The first priority model must be active";
  return null;
}

export function validatePoolMemberCompatibility(
  members: ModelWithProvider[],
  body: { stream?: boolean; tools?: unknown; messages?: any[]; reasoning_effort?: string },
) {
  const contentParts = body.messages?.flatMap((message) => Array.isArray(message?.content) ? message.content : [] ) ?? [];
  if (contentParts.some((part: any) => part?.type === "file" || part?.type === "input_file")) {
    if (members.every((model) => model.capabilities?.attachments === false)) return "No active member supports file attachments";
  }
  if (body.stream === true && members.every((model) => model.capabilities?.streaming === false)) {
    return "No active member supports streaming for this request";
  }
  if (Array.isArray(body.tools) && body.tools.length && members.every((model) => model.capabilities?.tools === false)) {
    return "No active member supports tools required by this request";
  }
  const hasImage = contentParts.some((part: any) => ["image_url", "input_image", "image"].includes(part?.type));
  const hasAudio = contentParts.some((part: any) => ["input_audio", "audio_url", "audio"].includes(part?.type));
  const hasVideo = contentParts.some((part: any) => ["video_url", "input_video", "video"].includes(part?.type));
  const hasFile = contentParts.some((part: any) => part?.type === "input_file" || part?.type === "file");
  if (hasImage && members.every((model) => model.capabilities?.vision === false)) return "No active member supports image input in this request";
  if (hasAudio && members.every((model) => model.capabilities?.audio_input === false)) return "No active member supports audio input in this request";
  if (hasVideo && members.every((model) => model.capabilities?.video === false)) return "No active member supports video input in this request";
  if (hasFile && members.every((model) => model.capabilities?.attachments === false)) return "No active member supports file attachments";
  const hasUnsupportedConol = members.some((model) =>
    (model as ModelWithProvider & { provider_protocol?: string }).provider_protocol === "conol",
  );
  if (hasUnsupportedConol && members.length === 1 &&
    ((Array.isArray(body.tools) && body.tools.length > 0) || hasImage || hasAudio || hasVideo)) {
    return "A Conol model only supports text requests without tools or media";
  }
  if (typeof body.reasoning_effort === "string" && body.reasoning_effort) {
    const capable = members.filter((model) => model.reasoning_efforts.some((effort) => effort.effort === body.reasoning_effort));
    if (!capable.length) return `No pool member supports reasoning effort "${body.reasoning_effort}"`;
  }
  return null;
}

export function validatePoolTokenLimits(
  pool: Pick<ModelPool, "name" | "max_input_tokens" | "max_output_tokens" | "member_input_limit" | "member_output_limit" | "members" | "input_limiter_ids" | "output_limiter_ids">,
  requestedInput: number,
  requestedOutput: number,
): string | null {
  const limits = poolEffectiveLimits(pool);
  if (limits.inputLimit !== null && requestedInput > limits.inputLimit) {
    const limiter = pool.input_limiter_ids.map((id) => {
      const member = pool.members.find((item) => item.id === id);
      return member ? `${member.display_name || member.model_id} (${member.provider_name})` : id;
    }).join(", ");
    const configuredOverride = pool.max_input_tokens != null && pool.max_input_tokens < (pool.member_input_limit ?? Number.MAX_SAFE_INTEGER);
    return `Estimated input of ${requestedInput} tokens exceeds ${pool.name} input limit of ${limits.inputLimit}. Limiting ${limiter ? `model: ${limiter}` : configuredOverride ? `configured maximum for this compound model (${limits.inputLimit})` : `configured maximum (${limits.inputLimit})`}.`;
  }
  if (limits.outputLimit !== null && requestedOutput > limits.outputLimit) {
    const limiter = pool.output_limiter_ids.map((id) => {
      const member = pool.members.find((item) => item.id === id);
      return member ? `${member.display_name || member.model_id} (${member.provider_name})` : id;
    }).join(", ");
    const configuredOverride = pool.max_output_tokens != null && pool.max_output_tokens < (pool.member_output_limit ?? Number.MAX_SAFE_INTEGER);
    return `Requested output of ${requestedOutput} tokens exceeds ${pool.name} output limit of ${limits.outputLimit}. Limiting ${limiter ? `model: ${limiter}` : configuredOverride ? `configured maximum for this compound model (${limits.outputLimit})` : `configured maximum (${limits.outputLimit})`}.`;
  }
  return null;
}

export function resolvePoolCapabilities(members: ModelWithProvider[]) {
  const field = (key: keyof ModelWithProvider["capabilities"]) => {
    const values = members.map((member) => member.capabilities[key]);
    return values.every((value) => value === true) ? true : values.some((value) => value === true) ? null : false;
  };
  return {
    reasoning: field("reasoning"),
    tools: field("tools"),
    vision: field("vision"),
    attachments: field("attachments"),
    streaming: field("streaming"),
    non_streaming: field("non_streaming"),
  };
}

export async function routeModelPool(
  slug: string,
  body: Record<string, unknown>,
  authorization: string,
  signal?: AbortSignal,
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = (input, init) => {
    return fetch(input, { ...init, signal });
  },
): Promise<Response> {
  const pool = modelPoolService.findForRouting(slug);
  if (!pool?.length) {
    return Response.json({ error: "Compound model unavailable", message: `Pool "${slug}" is inactive or has no active member models` }, { status: 503 });
  }
  const poolConfig = modelPoolService.findBySlug(slug)!;
  const candidates = [...pool];
  const strategy = poolConfig.strategy;
  if (strategy === "random") {
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
  }
  let lastResponse: Response | null = null;
  let lastError: unknown;
  const failures: string[] = [];
  const outputFields = ["max_output_tokens", "max_completion_tokens", "max_tokens"] as const;
  const suppliedOutputs = outputFields.filter((field) => typeof body[field] === "number").map((field) => Number(body[field]));
  if (new Set(suppliedOutputs).size > 1) {
    return Response.json({ error: "Invalid output token limits", message: `Conflicting output limits supplied: ${suppliedOutputs.join(", ")}` }, { status: 400 });
  }
  const requestedOutput = suppliedOutputs[0];
  const limits = poolEffectiveLimits(poolConfig);
  const inputEstimate = estimateRequestTextTokens(body);
  const tokenError = validatePoolTokenLimits(poolConfig, inputEstimate, Math.min(requestedOutput ?? 0, limits.outputLimit ?? Number.MAX_SAFE_INTEGER));
  if (tokenError) return Response.json({ error: "Compound model token limit exceeded", message: tokenError }, { status: 400 });
  if (limits.outputLimit !== null && requestedOutput !== undefined && requestedOutput > limits.outputLimit) {
    const limiter = poolConfig.output_limiter_ids.map((id) => poolConfig.members.find((member) => member.id === id)?.display_name ?? id).join(", ");
    failures.push(`Requested output of ${requestedOutput} exceeds effective cap ${limits.outputLimit}; forwarding capped request (${limiter || "pool limit"})`);
  }
  for (const { model } of candidates) {
    const modelName = providerModelPublicId(model.provider_name, model);
    const memberConfig = poolConfig.members.find((member) => member.id === model.id)!;
    const memberIncompatibility = validatePoolMemberCompatibility([model], body);
    if (memberIncompatibility) {
      failures.push(`${modelName}: ${memberIncompatibility}`);
      if (!memberConfig.fallback) return Response.json({ error: "Compound model member failed", message: failures.at(-1) }, { status: 400 });
      continue;
    }
    try {
      if (signal?.aborted) throw signal.reason ?? new DOMException("Request aborted", "AbortError");
      const effectiveOutput = limits.outputLimit === null
        ? requestedOutput
        : requestedOutput === undefined ? limits.outputLimit : Math.min(requestedOutput, limits.outputLimit);
      const memberOutput = model.max_output_tokens;
      const memberCappedOutput = memberOutput === null
        ? effectiveOutput
        : effectiveOutput === undefined ? memberOutput : Math.min(effectiveOutput, memberOutput);
      const forwardedBody = { ...body };
      if (memberCappedOutput !== undefined && memberCappedOutput !== null) {
        const presentFields = outputFields.filter((field) => body[field] !== undefined);
        if (presentFields.length) presentFields.forEach((field) => { forwardedBody[field] = Math.min(Number(body[field]), memberCappedOutput); });
        else forwardedBody.max_tokens = memberCappedOutput;
      }
      const protocol = (model as ModelWithProvider & { provider_protocol?: string }).provider_protocol === "openai-responses" ? "responses" : "chat_completions";
      const requestBody = protocol === "responses"
        ? requestFromChat("responses", { ...forwardedBody, model: modelName })
        : { ...forwardedBody, model: modelName };
      const response = await fetcher(`http://127.0.0.1:${config.port}/v1/${protocol === "responses" ? "responses" : "chat/completions"}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authorization,
          Accept: body.stream === true ? "text/event-stream" : "application/json",
        },
        signal,
        body: JSON.stringify(requestBody),
      });
      if (response.ok) {
        const requestedStream = body.stream === true;
        const upstreamStream = response.headers.get("content-type")?.includes("text/event-stream") === true;
        if (upstreamStream) {
          const canonicalStream = protocol === "responses" ? convertStream("responses", "chat_completions", response, modelName) : response;
          const checked = await retryableStreamError(canonicalStream);
          if (!checked.ok) {
            lastResponse = checked;
            const payload = await checked.clone().text().catch(() => "stream ended before output");
            failures.push(`${modelName}: ${payload.slice(0, 400)}`);
            if (!memberConfig.fallback) return checked;
            continue;
          }
          if (requestedStream) return identifyPoolStream(checked, slug);
          const completion = await openAICompletionFromSse(checked, modelName);
          return responseFromCompletion({ ...completion.completion, model: `pool/${slug}` });
        }
        let raw: any;
        try {
          raw = await response.json();
        } catch {
          const invalid = Response.json({ error: "Invalid upstream response", message: "The provider returned a successful response with invalid JSON" }, { status: 502 });
          lastResponse = invalid;
          failures.push(`${modelName}: provider returned invalid JSON`);
          if (!memberConfig.fallback) return invalid;
          continue;
        }
        if (raw?.error) {
          const detail = typeof raw.error === "string" ? raw.error : raw.error.message ?? "The provider returned an error payload with HTTP 200";
          const invalid = Response.json({ error: "Invalid upstream response", message: detail }, { status: 502 });
          lastResponse = invalid;
          failures.push(`${modelName}: ${detail}`);
          if (!memberConfig.fallback) return invalid;
          continue;
        }
        if (protocol === "responses") {
          try { raw = convertResponse("responses", "chat_completions", raw); }
          catch (error) {
            const invalid = Response.json({ error: "Invalid upstream response", message: error instanceof Error ? error.message : "Could not convert Responses API output" }, { status: 502 });
            lastResponse = invalid;
            failures.push(`${modelName}: invalid Responses API output`);
            if (!memberConfig.fallback) return invalid;
            continue;
          }
        }
        const firstChoice = raw?.choices?.[0];
        const message = firstChoice?.message;
        const hasChoiceOutput = Boolean(message && (
          (typeof message.content === "string" && message.content.length > 0) ||
          message.refusal || message.reasoning_content || message.reasoning || message.audio ||
          message.tool_calls?.length || message.function_call
        ));
        const hasResponseOutput = Array.isArray(raw?.output) && raw.output.some((item: any) =>
          item?.type === "function_call" || item?.type === "reasoning" || item?.type === "message" &&
          Array.isArray(item.content) && item.content.some((part: any) => part?.text || part?.refusal || part?.data),
        );
        if (!raw || typeof raw !== "object" ||
          (!Array.isArray(raw.choices) && !hasResponseOutput && !(typeof raw.output_text === "string" && raw.output_text.length > 0)) ||
          (Array.isArray(raw.choices) && (!firstChoice || !hasChoiceOutput))) {
          const detail = typeof raw?.error === "string" ? raw.error : raw?.error?.message ?? "The provider returned no completion output";
          const invalid = Response.json({ error: "Invalid upstream response", message: detail }, { status: 502 });
          lastResponse = invalid;
          failures.push(`${modelName}: ${detail}`);
          if (!memberConfig.fallback) return invalid;
          continue;
        }
        const responseText = raw?.output?.map?.((item: any) => item?.content?.map?.((part: any) => part?.text ?? "").join("")).join("");
        const completion = raw?.choices?.[0]?.message?.content ?? raw?.choices?.[0]?.message ?? raw?.output_text ?? responseText ?? "";
        const usage = raw?.usage ?? {};
        if (!requestedStream) return Response.json(raw && typeof raw === "object" ? { ...raw, model: `pool/${slug}` } : raw);
        const id = raw?.id ?? `pool-${crypto.randomUUID()}`;
        const modelNameFromPool = `pool/${slug}`;
        const chunks = [
          { id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: modelNameFromPool, choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] },
          { id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: modelNameFromPool, choices: [{ index: 0, delta: { content: typeof completion === "string" ? completion : "" }, finish_reason: null }] },
          { id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: modelNameFromPool, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
          ...(body.stream_options && typeof body.stream_options === "object" && (body.stream_options as any).include_usage
            ? [{ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: modelNameFromPool, choices: [], usage }]
            : []),
        ];
        const streamBody = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
        return new Response(streamBody, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
      }
      lastResponse = response;
      if (response.status === 499) return response;
      const recoverable = memberConfig.fallback && ([401, 403, 404, 408, 409, 425, 429].includes(response.status) || response.status >= 500);
      if (!recoverable) return response;
      const payload = await response.clone().text().catch(() => response.statusText);
      failures.push(`${modelName} (${response.status}): ${payload.slice(0, 400)}`);
    } catch (error) {
      lastError = error;
      failures.push(`${modelName}: ${error instanceof Error ? error.message : String(error)}`);
      if (signal?.aborted || error instanceof DOMException && error.name === "AbortError") {
        return Response.json({ error: "Request aborted", message: error instanceof Error ? error.message : "Request aborted" }, { status: 499 });
      }
      if (!memberConfig.fallback) return Response.json({ error: "Compound model member failed", message: failures.at(-1) }, { status: 502 });
    }
  }
  if (lastResponse) {
    return Response.json({ error: "Compound model failed", message: formatPoolRequestError(poolConfig.name, failures) }, { status: lastResponse.status });
  }
  return Response.json({ error: "Compound model failed", message: formatPoolRequestError(poolConfig.name, failures.length ? failures : [String(lastError ?? "No member model could be called")]) }, { status: 502 });
}

export class InvalidModelPoolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidModelPoolError";
  }
}

export function formatPoolRequestError(poolName: string, failures: string[]) {
  const detail = failures.length ? failures.join("; ") : "No model could handle this request";
  return `Compound model "${poolName}" failed. ${detail}`;
}

const slugPattern = /^[a-z0-9][a-z0-9_-]{0,79}$/;

function identifyPoolStream(response: Response, slug: string): Response {
  if (!response.body) return response;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const split = createSseSplitter();
  return new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          for (const event of split(decoder.decode(value ?? new Uint8Array(), { stream: !done }))) {
            const data = extractSseData(event);
            if (!data || data === SSE_DONE) {
              controller.enqueue(encoder.encode(`${event}\n\n`));
              continue;
            }
            try {
              const chunk = JSON.parse(data);
              if (chunk && typeof chunk === "object" && "model" in chunk) chunk.model = `pool/${slug}`;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            } catch {
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }
          if (done) break;
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) { void reader.cancel(reason); },
  }), { status: response.status, statusText: response.statusText, headers: response.headers });
}

function responseFromCompletion(completion: any): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(completion));
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

async function retryableStreamError(response: Response): Promise<Response> {
  const reader = response.body?.getReader();
  if (!reader) return Response.json({ error: "Empty upstream stream", message: "The provider returned an empty stream" }, { status: 502 });
  const decoder = new TextDecoder();
  let textBuffer = "";
  let sawOutput = false;
  const prefix: Uint8Array[] = [];
  const release = (initial: Uint8Array[]) => new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (const chunk of initial) controller.enqueue(chunk);
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) { void reader.cancel(reason); },
  }), { status: response.status, statusText: response.statusText, headers: response.headers });

  while (true) {
    const { done, value } = await reader.read();
    if (value?.length) {
      prefix.push(value);
      textBuffer += decoder.decode(value, { stream: true });
      const events = textBuffer.split(/\r\n\r\n|\n\n|\r\r/);
      textBuffer = events.pop() ?? "";
      for (const event of events) {
        const data = extractSseData(event);
        if (!data) continue;
        if (data === SSE_DONE) {
          if (sawOutput) return release(prefix);
          await reader.cancel();
          return Response.json({ error: "Empty upstream response", message: "The provider completed without content, reasoning, tool calls, or refusal output" }, { status: 502 });
        }
        try {
          const chunk = JSON.parse(data);
          if (chunk?.error) {
            const error = typeof chunk.error === "string" ? chunk.error : chunk.error.message ?? "Upstream stream failed";
            await reader.cancel(error);
            return Response.json({ error: "Upstream stream failed", message: error }, { status: 502 });
          }
          if (chunk?.choices?.some((choice: any) => {
            const delta = choice?.delta;
            return Boolean(delta?.content || delta?.reasoning_content || delta?.refusal || delta?.tool_calls?.length || delta?.function_call);
          })) {
            sawOutput = true;
            return release(prefix);
          }
        } catch {
          // Preserve non-JSON SSE data and keep waiting for the first output.
        }
      }
    }
    if (done) {
      await reader.cancel();
      return Response.json({ error: "Empty upstream stream", message: "The provider closed its stream before returning any output" }, { status: 502 });
    }
  }
}

function hydratePool(id: string): ModelPool | null {
  const db = getDb();
  const pool = db.query("SELECT * FROM model_pools WHERE id = ?").get(id) as Omit<ModelPool, "members" | "public_id" | "hide_members" | "is_active" | "member_input_limit" | "member_output_limit" | "input_limiter_ids" | "output_limiter_ids"> & {
    hide_members: number;
    is_active: number;
  } | null;
  if (!pool) return null;
  const members = db.query(`
    SELECT m.id AS model_id, pm.priority, pm.fallback
    FROM model_pool_members pm
    JOIN models m ON m.id = pm.model_id
    WHERE pm.pool_id = ?
    ORDER BY pm.priority ASC
  `).all(id) as Array<{ model_id: string; priority: number; fallback: number }>;
  // Management needs to retain inactive or temporarily unavailable members.
  const allModels = new Map<string, ModelWithProvider>(modelService.findAllWithProvider().map((model) => [model.id, model]));
  const hydrated = {
    ...pool,
    hide_members: Boolean(pool.hide_members),
    is_active: Boolean(pool.is_active),
    public_id: `pool/${pool.slug}`,
    members: members.flatMap((member) => {
      const model = allModels.get(member.model_id);
      return model ? [{ ...model, priority: member.priority, fallback: Boolean(member.fallback), provider_protocol: modelService.findProviderProtocol(model.provider_id) ?? undefined }] : [];
    }),
  };
  const limits = poolEffectiveLimits(hydrated);
  return {
    ...hydrated,
    member_input_limit: limits.memberInputLimit,
    member_output_limit: limits.memberOutputLimit,
    input_limiter_ids: limits.inputLimiterIds,
    output_limiter_ids: limits.outputLimiterIds,
    effective_input_limit: limits.inputLimit,
    effective_output_limit: limits.outputLimit,
  };
}

function validateInput(input: ModelPoolInput) {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  if (!name || name.length > 120) throw new InvalidModelPoolError("Name is required and must be at most 120 characters");
  if (!slugPattern.test(slug)) throw new InvalidModelPoolError("ID must use lowercase letters, numbers, hyphens, or underscores");
  if (!(input.strategy === "priority" || input.strategy === "random")) throw new InvalidModelPoolError("Unsupported selection strategy");
  if (!Array.isArray(input.members) || input.members.length < 2) throw new InvalidModelPoolError("Choose at least two models for a compound model");
  const modelIds = input.members.map((member) => member.model_id);
  if (new Set(modelIds).size !== modelIds.length) throw new InvalidModelPoolError("A model can only appear once in a compound model");
  const available = new Set(modelService.findAllWithProvider().map((model) => model.id));
  if (modelIds.some((id) => !available.has(id))) throw new InvalidModelPoolError("One or more selected models no longer exist");
  const maxInput = input.max_input_tokens ?? null;
  const maxOutput = input.max_output_tokens ?? null;
  for (const [field, value] of [["max_input_tokens", maxInput], ["max_output_tokens", maxOutput]] as const) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 1)) throw new InvalidModelPoolError(`${field} must be a positive safe integer or empty`);
  }
  const members = modelService.findAllWithProvider().filter((model) => modelIds.includes(model.id));
  if (input.is_active && members.some((model) => !model.is_active || !model.provider_is_active)) {
    throw new InvalidModelPoolError("Enable every member model and its provider before enabling this compound model");
  }
  const contextLimit = minimumKnown(members.map((model) => model.context_window));
  const outputLimit = minimumKnown(members.map((model) => model.max_output_tokens));
  if (contextLimit === null && maxInput === null) throw new InvalidModelPoolError("At least one selected model must have a configured context window, or set a compound maximum input token limit");
  if (outputLimit === null && maxOutput === null) throw new InvalidModelPoolError("At least one selected model must have a configured maximum output, or set a compound maximum output token limit");
  if (maxInput !== null && contextLimit !== null && maxInput > contextLimit) {
    throw new InvalidModelPoolError(`Maximum input tokens cannot exceed ${contextLimit}, the lowest member context window`);
  }
  if (maxOutput !== null && outputLimit !== null && maxOutput > outputLimit) {
    throw new InvalidModelPoolError(`Maximum output tokens cannot exceed ${outputLimit}, the lowest member output limit`);
  }
  return {
    name,
    slug,
    max_input_tokens: maxInput,
    max_output_tokens: maxOutput,
    members: input.members.map((member, priority) => ({ model_id: member.model_id, priority, fallback: member.fallback !== false })),
  };
}

export function minimumKnown(values: Array<number | null | undefined>): number | null {
  const defined = values.filter((value): value is number => value != null);
  return defined.length ? Math.min(...defined) : null;
}

export function poolEffectiveLimits(pool: Pick<ModelPool, "max_input_tokens" | "max_output_tokens" | "members">) {
  const memberInputLimit = minimumKnown(pool.members.map((member) => member.context_window));
  const memberOutputLimit = minimumKnown(pool.members.map((member) => member.max_output_tokens));
  const inputLimit = minimumKnown([pool.max_input_tokens, memberInputLimit]);
  const outputLimit = minimumKnown([pool.max_output_tokens, memberOutputLimit]);
  const inputLimiterIds = inputLimit == null || (pool.max_input_tokens != null && pool.max_input_tokens <= (memberInputLimit ?? Number.MAX_SAFE_INTEGER))
    ? []
    : pool.members.filter((member) => member.context_window === inputLimit).map((member) => member.id);
  const outputLimiterIds = outputLimit == null || (pool.max_output_tokens != null && pool.max_output_tokens <= (memberOutputLimit ?? Number.MAX_SAFE_INTEGER))
    ? []
    : pool.members.filter((member) => member.max_output_tokens === outputLimit).map((member) => member.id);
  return { inputLimit, outputLimit, memberInputLimit, memberOutputLimit, inputLimiterIds, outputLimiterIds };
}

export function getPoolLimiterLabels(pool: ModelPool, ids: string[]) {
  return ids.flatMap((id) => {
    const member = pool.members.find((item) => item.id === id);
    return member ? [`${member.display_name || member.model_id} (${member.provider_name})`] : [];
  });
}

export function poolTokenLimitError(pool: ModelPool, body: Record<string, unknown>) {
  const output = [body.max_output_tokens, body.max_completion_tokens, body.max_tokens]
    .find((value) => typeof value === "number") as number | undefined;
  return validatePoolTokenLimits(pool, estimateRequestTextTokens(body), output ?? 0);
}

export const modelPoolService = {
  list(): ModelPool[] {
    const ids = getDb().query("SELECT id FROM model_pools ORDER BY created_at DESC, name COLLATE NOCASE ASC").all() as Array<{ id: string }>;
    return ids.flatMap(({ id }) => {
      const pool = hydratePool(id);
      return pool ? [pool] : [];
    });
  },

  findById(id: string): ModelPool | null {
    return hydratePool(id);
  },

  findBySlug(slug: string): ModelPool | null {
    const row = getDb().query("SELECT id FROM model_pools WHERE slug = ?").get(slug) as { id: string } | null;
    return row ? hydratePool(row.id) : null;
  },

  routeCandidates(slug: string): Array<{ model: ModelWithProvider; priority: number }> | null {
    const pool = this.findBySlug(slug);
    if (!pool || !pool.is_active) return null;
    const activeById = new Map(modelService.findAllActiveWithProvider().map((model) => [model.id, model]));
    return pool.members.flatMap((member) => {
      const model = activeById.get(member.id);
      return model ? [{ model: { ...model, provider_protocol: modelService.findProviderProtocol(model.provider_id) ?? undefined } as ModelWithProvider, priority: member.priority }] : [];
    });
  },

  findForRouting(slug: string): Array<{ model: ModelWithProvider; priority: number }> | null {
    return this.routeCandidates(slug);
  },

  memberModelIdsHiddenFromCatalog(): Set<string> {
    const rows = getDb().query(`
      SELECT DISTINCT pm.model_id
      FROM model_pool_members pm
      JOIN model_pools p ON p.id = pm.pool_id
      WHERE p.is_active = 1 AND p.hide_members = 1
    `).all() as Array<{ model_id: string }>;
    return new Set(rows.map((row) => row.model_id));
  },

  create(input: ModelPoolInput): ModelPool {
    const normalized = validateInput({ ...input, max_input_tokens: input.max_input_tokens ?? null, max_output_tokens: input.max_output_tokens ?? null });
    const db = getDb();
    if (db.query("SELECT 1 FROM model_pools WHERE slug = ?").get(normalized.slug)) throw new InvalidModelPoolError("This public ID is already in use");
    const id = crypto.randomUUID();
    const transaction = db.transaction(() => {
      db.query("INSERT INTO model_pools (id, name, slug, strategy, hide_members, is_active, max_input_tokens, max_output_tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, normalized.name, normalized.slug, input.strategy, Number(input.hide_members), Number(input.is_active), normalized.max_input_tokens, normalized.max_output_tokens);
      const insert = db.query("INSERT INTO model_pool_members (pool_id, model_id, priority, fallback) VALUES (?, ?, ?, ?)");
      normalized.members.forEach((member) => insert.run(id, member.model_id, member.priority, Number(member.fallback)));
    });
    transaction();
    return hydratePool(id)!;
  },

  update(id: string, input: ModelPoolInput): ModelPool | null {
    if (!getDb().query("SELECT 1 FROM model_pools WHERE id = ?").get(id)) return null;
    const normalized = validateInput({ ...input, max_input_tokens: input.max_input_tokens ?? null, max_output_tokens: input.max_output_tokens ?? null });
    const duplicate = getDb().query("SELECT 1 FROM model_pools WHERE slug = ? AND id != ?").get(normalized.slug, id);
    if (duplicate) throw new InvalidModelPoolError("This public ID is already in use");
    const db = getDb();
    const transaction = db.transaction(() => {
      db.query("DELETE FROM model_pool_members WHERE pool_id = ?").run(id);
      const insert = db.query("INSERT INTO model_pool_members (pool_id, model_id, priority, fallback) VALUES (?, ?, ?, ?)");
      normalized.members.forEach((member) => insert.run(id, member.model_id, member.priority, Number(member.fallback)));
      // Deleting members may fire the underfilled-pool trigger; apply the requested
      // active state after the replacement members have been inserted.
      db.query("UPDATE model_pools SET name = ?, slug = ?, strategy = ?, hide_members = ?, is_active = ?, max_input_tokens = ?, max_output_tokens = ?, updated_at = datetime('now') WHERE id = ?")
        .run(normalized.name, normalized.slug, input.strategy, Number(input.hide_members), Number(input.is_active), normalized.max_input_tokens, normalized.max_output_tokens, id);
    });
    transaction();
    return hydratePool(id);
  },

  delete(id: string): boolean {
    return getDb().query("DELETE FROM model_pools WHERE id = ?").run(id).changes > 0;
  },

  deleteMembersForModel(modelId: string): void {
    const db = getDb();
    db.query("DELETE FROM model_pool_members WHERE model_id = ?").run(modelId);
  },

  async test(poolId: string, authorization: string): Promise<{ success: boolean; model?: string; duration_ms: number; error?: string }> {
    const pool = this.findById(poolId);
    if (!pool || !pool.is_active) return { success: false, duration_ms: 0, error: "Compound model is inactive or was not found" };
    const started = performance.now();
    let response: Response;
    try {
      response = await routeModelPool(pool.slug, {
      model: pool.public_id,
      messages: [{ role: "user", content: "Reply with exactly: ok" }],
      stream: false,
      max_tokens: 8,
      }, authorization);
    } catch (error) {
      return { success: false, duration_ms: Math.round(performance.now() - started), error: error instanceof Error ? error.message : String(error) };
    }
    const duration_ms = Math.round(performance.now() - started);
    const data = await response.json().catch(() => null) as any;
    if (!response.ok) return { success: false, duration_ms, error: data?.message ?? data?.error ?? `HTTP ${response.status}` };
    const content = data?.choices?.[0]?.message?.content ?? data?.output_text ?? data?.output?.map?.((item: any) => item?.content?.map?.((part: any) => part?.text ?? "").join("")).join("");
    if (typeof content === "object" && content !== null && Array.isArray(content.parts)) {
      const text = content.parts.map((part: any) => typeof part === "string" ? part : part?.text ?? "").join("").trim();
      return text ? { success: true, model: pool.public_id, duration_ms } : { success: false, duration_ms, error: "Compound model returned an empty response" };
    }
    return typeof content === "string" && content.trim()
      ? { success: true, model: pool.public_id, duration_ms }
      : { success: false, duration_ms, error: "Compound model returned an empty response" };
  },

  publicModels() {
    return this.apiModels();
  },

  apiModels() {
    return this.list().filter((pool) => pool.is_active).map((pool) => {
      const first = pool.members[0];
      const memberModels = pool.members;
      const sharedEfforts = memberModels.length
        ? memberModels[0].reasoning_efforts.filter((effort) => memberModels.every((member) =>
          member.reasoning_efforts.some((candidate) => candidate.effort === effort.effort && candidate.upstream_value === effort.upstream_value),
        ))
        : [];
      const contextLimits = memberModels.map((member) => member.context_window).filter((value): value is number => value != null);
      const outputLimits = memberModels.map((member) => member.max_output_tokens).filter((value): value is number => value != null);
      const effectiveLimits = poolEffectiveLimits(pool);
      return {
        ...(first ?? {}),
        id: pool.public_id,
        model_record_id: pool.id,
        provider_id: null,
        model_id: pool.slug,
        pretty_id: pool.slug,
        display_name: pool.name,
        is_manual: 1,
        is_active: 1,
        created_at: pool.created_at,
        updated_at: pool.updated_at,
        provider_name: "pool",
        provider_avatar: null,
        provider_avatar_sources: [],
        context_window: effectiveLimits.inputLimit,
        max_output_tokens: effectiveLimits.outputLimit,
        max_input_tokens: effectiveLimits.inputLimit,
        member_context_window: contextLimits.length ? Math.min(...contextLimits) : null,
        member_max_output_tokens: outputLimits.length ? Math.min(...outputLimits) : null,
        max_input_tokens_is_custom: pool.max_input_tokens != null,
        max_output_tokens_is_custom: pool.max_output_tokens != null,
        max_output_tokens_source: first?.max_output_tokens_source ?? "auto",
        max_output_tokens_is_default: first?.max_output_tokens_is_default ?? true,
        think_opening_tag_mode: first?.think_opening_tag_mode ?? "off",
        fix_missing_think_opening_tag: first?.fix_missing_think_opening_tag ?? false,
        capabilities: resolvePoolCapabilities(pool.members),
        reasoning_efforts: sharedEfforts.map((effort) => ({ ...effort, is_default: false })),
        pricing_tiers: [],
        model_pool: true,
        pool_id: pool.id,
        strategy: pool.strategy,
        members: pool.members.map((member) => ({ id: member.id, display_name: member.display_name, provider_name: member.provider_name, priority: member.priority, fallback: member.fallback })),
      };
    });
  },
};

export function poolSlugFromModelId(model: string): string | null {
  const prefix = `${providerPrefix("pool")}/`;
  return model.toLowerCase().startsWith(prefix) ? model.slice(prefix.length).toLowerCase() : null;
}
