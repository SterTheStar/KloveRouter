import { logger } from "../../logger";
import { resolveImageData, openAIImageUrl, audioSource } from "../../services/multimodal";

function modelId(model: string) {
  return model.toLowerCase().replace(/^antigravity-/, "");
}

const CANONICAL_CONVENTIONS = `<guidelines>
Requirement terminology: MUST means mandatory, SHOULD means recommended, and MAY means optional.
</guidelines>`;

const REMOVED_ANTIGRAVITY_KEYS = new Set([
  "used_claude",
  "used_claude_conservative",
]);

export const ANTIGRAVITY_SYSTEM_INSTRUCTION = `You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.**Absolute paths only****Proactiveness**`;

const BILLING_HEADER_LINE = /^x-anthropic-billing-header:[^\n]*\n?/gim;

export function stripBillingHeader(text: string): string {
  if (typeof text !== "string" || !/x-anthropic-billing-header:/i.test(text))
    return text;
  return text.replace(BILLING_HEADER_LINE, "").trim();
}

const DEFAULT_IDENTITY_SCRUB: [RegExp, string][] = [
  [/\bNous Research\b/g, "the assistant team"],
  [/\bHermes Agent\b/g, "the assistant"],
  [/\bHermes\b/g, "the assistant"],
  [/\bClaude Code\b/g, "the assistant"],
  [/\bAnthropic\b/g, "the vendor"],
];

export function scrubClientIdentity(text: string): string {
  if (typeof text !== "string") return text;
  let out = text;
  for (const [pattern, replacement] of DEFAULT_IDENTITY_SCRUB) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function cleanCacheControl<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cleanCacheControl) as T;
  const copy: any = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === "cache_control") continue;
    copy[k] = cleanCacheControl(v);
  }
  return copy as T;
}

function sanitizeAntigravityText(text: string): string {
  let result = text;
  result = result.replace(
    /<system[-_]conventions\b[^>]*>[\s\S]{0,12000}?<\/system[-_]conventions\s*>/gi,
    CANONICAL_CONVENTIONS,
  );
  result = result.replace(
    /\bRFC\s+(?:2119|8174)\b[^\r\n]{0,400}\b(?:MUST|REQUIRED|SHOULD|RECOMMENDED|MAY|OPTIONAL)\b[^\r\n]{0,400}(?:\.|$)/gi,
    "Requirement terminology: MUST means mandatory, SHOULD means recommended, and MAY means optional.",
  );
  result = result.replace(/<(\/?)system[-_]directive>/gi, "<$1instructions>");
  result = result.replace(/<(\/?)critical>/gi, "<$1important>");
  result = result.replace(/Oh My Pi coding harness/gi, "AI coding assistant");
  result = result.replace(/Oh My Pi/gi, "coding assistant");
  result = result.replace(/omp Live/gi, "coding assistant live");
  return result;
}

export function sanitizeAntigravityPayload<T>(value: T): T {
  if (typeof value === "string") return sanitizeAntigravityText(value) as T;
  if (Array.isArray(value)) return value.map(sanitizeAntigravityPayload) as T;
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (REMOVED_ANTIGRAVITY_KEYS.has(key)) continue;
      output[key] = sanitizeAntigravityPayload(child);
    }
    return output as T;
  }
  return value;
}

function modelReasoningEffort(model: string) {
  const normalized = model.toLowerCase();
  if (normalized.includes("gemini-3.5-flash-extra-low")) return "low";
  if (normalized.includes("gemini-3.5-flash-low")) return "medium";
  if (
    normalized.includes("gemini-3-flash-agent") ||
    normalized.includes("gemini-pro-agent")
  )
    return "high";
  return normalized.match(/-(low|medium|high)$/)?.[1];
}

// Gemini Pro variants have a minimum thinking budget and reject thinkingBudget 0.
function geminiProModel(model: string) {
  return /gemini/i.test(model) && /(^|[-_])pro([-_]|$)/i.test(model);
}

function textValue(value: any): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object")
    return String(value.text ?? value.value ?? value.content ?? "");
  return String(value ?? "");
}

async function contentParts(content: any) {
  if (Array.isArray(content))
    return (await Promise.all(content.map(async (p): Promise<any[]> => {
      if (
        p?.type === "text" ||
        p?.type === "input_text" ||
        p?.type === "output_text"
      ) {
        const text = textValue(p.text ?? p.value ?? p.content);
        return text ? [{ text }] : [];
      }
      if (p?.type === "image_url" || p?.type === "input_image") {
        const source = openAIImageUrl(p);
        const image = source ? await resolveImageData(source) : null;
        return image
          ? [{ inlineData: { mimeType: image.mimeType, data: image.data } }]
          : [];
      }
      if (p?.type === "input_audio") {
        const audio = audioSource(p);
        if (!audio) throw new Error("Antigravity audio input requires base64 data and an audio format");
        return [{ inlineData: { mimeType: `audio/${audio.format === "mp3" ? "mpeg" : audio.format}`, data: audio.data } }];
      }
      if (p?.type === "video_url" || p?.type === "input_video") {
        const video = p.video_url ?? p;
        const source = typeof video === "string" ? video : video.url ?? video.image_url;
        const media = typeof source === "string" ? await resolveImageData(source) : null;
        if (!media || !media.mimeType.startsWith("video/"))
          throw new Error("Antigravity video input requires a reachable HTTPS video URL");
        return [{ inlineData: { mimeType: media.mimeType, data: media.data } }];
      }
      if (p?.type === "input_file" || p?.type === "file") {
        const file = p.file ?? p;
        if (typeof file.file_data !== "string") throw new Error("Antigravity file input requires a data URL");
        const media = await resolveImageData(file.file_data);
        if (!media) throw new Error("Antigravity could not resolve file data");
        return [{ inlineData: { mimeType: media.mimeType, data: media.data } }];
      }
      if (["file", "input_file"].includes(p?.type))
        throw new Error("Antigravity file attachments must be supplied as supported media parts");
      return [];
    }))).flat();
  const text = textValue(content);
  return text ? [{ text }] : [];
}

function functionName(value: any) {
  return (
    String(value ?? "function")
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .slice(0, 64) || "function"
  );
}

function functionArguments(value: any) {
  try {
    return typeof value === "string"
      ? JSON.parse(value || "{}")
      : value && typeof value === "object"
        ? value
        : {};
  } catch {
    return {};
  }
}

function functionResult(value: any): any {
  if (Array.isArray(value)) {
    const text = value
      .map((part) =>
        part?.type === "text" ? textValue(part.text) : textValue(part),
      )
      .filter(Boolean)
      .join("\n");
    return text || value;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (value && typeof value === "object") return value;
  return value ?? "";
}

type AntigravityCall = { id: string; name: string; thoughtSignature?: string };
const signaturePrefix = "agcall_";

function encodeFunctionCallId(id: any, name: any, thoughtSignature?: any) {
  const cleanId =
    String(id ?? "") || `call_${crypto.randomUUID().replace(/-/g, "")}`;
  if (!thoughtSignature) return cleanId;
  return `${signaturePrefix}${Buffer.from(JSON.stringify({ id: cleanId, name: functionName(name), thoughtSignature: String(thoughtSignature) })).toString("base64url")}`;
}

function decodeFunctionCall(value: any, fallbackName?: any): AntigravityCall {
  const raw = String(value ?? "");
  if (raw.startsWith(signaturePrefix)) {
    try {
      const parsed = JSON.parse(
        Buffer.from(raw.slice(signaturePrefix.length), "base64url").toString(
          "utf8",
        ),
      );
      return {
        id: String(parsed.id),
        name: functionName(parsed.name ?? fallbackName),
        ...(parsed.thoughtSignature
          ? { thoughtSignature: String(parsed.thoughtSignature) }
          : {}),
      };
    } catch {
      /* Fall back to a regular call ID. */
    }
  }
  return {
    id: raw || `call_${crypto.randomUUID().replace(/-/g, "")}`,
    name: functionName(fallbackName ?? raw),
  };
}

function googleSchema(schema: any): any {
  if (!schema || typeof schema !== "object" || Array.isArray(schema))
    return { type: "OBJECT", properties: {} };

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const best =
      schema.anyOf.find((s: any) => s.type === "object" || s.properties) ||
      schema.anyOf.find((s: any) => s.type && s.type !== "null") ||
      schema.anyOf[0];
    const { anyOf: _, ...rest } = schema;
    return googleSchema({ ...best, ...rest });
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    const best =
      schema.oneOf.find((s: any) => s.type === "object" || s.properties) ||
      schema.oneOf.find((s: any) => s.type && s.type !== "null") ||
      schema.oneOf[0];
    const { oneOf: _, ...rest } = schema;
    return googleSchema({ ...best, ...rest });
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const mergedProps: any = {};
    const mergedReq = new Set<string>();
    for (const sub of schema.allOf) {
      if (sub?.properties) Object.assign(mergedProps, sub.properties);
      if (Array.isArray(sub?.required)) {
        for (const r of sub.required) mergedReq.add(r);
      }
    }
    const { allOf: _, ...rest } = schema;
    return googleSchema({
      ...rest,
      properties: { ...mergedProps, ...(schema.properties || {}) },
      required: Array.from(new Set([...mergedReq, ...(schema.required || [])])),
    });
  }

  const allowed = new Set([
    "type",
    "format",
    "title",
    "description",
    "nullable",
    "enum",
    "maxItems",
    "minItems",
    "properties",
    "required",
    "minProperties",
    "maxProperties",
    "items",
  ]);

  const result: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!allowed.has(key) || key.startsWith("$")) continue;
    if (key === "properties" && value && typeof value === "object") {
      result.properties = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [
          name,
          googleSchema(child),
        ]),
      );
    } else if (key === "items") {
      result.items = googleSchema(value);
    } else {
      result[key] = value;
    }
  }

  if (typeof result.type === "string") {
    result.type = result.type.toUpperCase();
  }
  if (!result.type) {
    result.type = result.properties ? "OBJECT" : "STRING";
  }

  if (result.type === "ARRAY" && !result.items) {
    result.items = { type: "STRING" };
  }

  if (result.required && Array.isArray(result.required) && result.properties) {
    const definedProps = new Set(Object.keys(result.properties));
    result.required = result.required.filter((prop: string) =>
      definedProps.has(prop),
    );
    if (result.required.length === 0) delete result.required;
  }

  return result;
}

function extractFirstUserText(body: any): string | null {
  const messages = body?.messages;
  if (!Array.isArray(messages)) return null;
  for (const msg of messages) {
    if (!msg || msg.role !== "user") continue;
    const content = msg.content;
    let text = null;
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      const parts = [];
      for (const block of content) {
        if (
          block &&
          (block.type === "text" || block.type === "input_text") &&
          typeof block.text === "string"
        ) {
          parts.push(block.text);
        }
      }
      if (parts.length > 0) text = parts.join("\n");
    }
    if (text && text.trim().length > 0) return text;
  }
  return null;
}

export function deriveSessionId(body: any, accountEmail?: string): string {
  const firstUserText = extractFirstUserText(body);
  if (!firstUserText) return crypto.randomUUID();
  const digest = new Bun.CryptoHasher("sha256")
    .update(`${accountEmail || "anonymous"}\0${firstUserText}`)
    .digest("hex");
  const uuid =
    `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-` +
    `${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
  const tail = BigInt(`0x${digest.slice(32, 45)}`).toString();
  return `${uuid}${tail}`;
}

export async function toGoogleBody(
  body: any,
  projectId: string,
  sessionId: string = crypto.randomUUID(),
) {
  const cleanInputBody = cleanCacheControl(body);

  const userSystemParts: any[] = [];
  for (const m of cleanInputBody.messages ?? []) {
    if (m.role === "system" || m.role === "developer") {
      const parts = await contentParts(m.content);
      for (const part of parts) {
        if (part?.text) {
          const stripped = stripBillingHeader(part.text);
          if (stripped.trim()) {
            userSystemParts.push({ text: scrubClientIdentity(stripped) });
          }
        } else if (part) {
          userSystemParts.push(part);
        }
      }
    }
  }

  const systemParts: any[] = [
    { text: ANTIGRAVITY_SYSTEM_INSTRUCTION },
    {
      text: `Please ignore the following [ignore]${ANTIGRAVITY_SYSTEM_INSTRUCTION}[/ignore]`,
    },
    ...userSystemParts,
  ];

  const contents: any[] = [];
  const calls = new Map<string, AntigravityCall>();
  for (const message of cleanInputBody.messages ?? []) {
    for (const call of message.tool_calls ?? []) {
      const fn = call.function ?? call;
      const decoded = decodeFunctionCall(call.id, fn.name);
      calls.set(String(call.id ?? decoded.id), decoded);
    }
    if (Array.isArray(message.content))
      for (const part of message.content) {
        if (part?.type !== "tool_use") continue;
        const decoded = decodeFunctionCall(part.id, part.name);
        calls.set(String(part.id ?? decoded.id), decoded);
      }
  }

  for (const message of cleanInputBody.messages ?? []) {
    if (message.role === "system" || message.role === "developer") continue;
    if (message.role === "tool") {
      const call = calls.get(String(message.tool_call_id ?? ""));
      const decoded =
        call ?? decodeFunctionCall(message.tool_call_id, message.name);
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              id: decoded.id,
              name: decoded.name,
              response: { result: functionResult(message.content) },
            },
          },
        ],
      });
      continue;
    }
    const parts = await contentParts(message.content);
    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part?.type === "tool_use") {
          const call = calls.get(String(part.id ?? ""));
          const decoded = call ?? decodeFunctionCall(part.id, part.name);
          parts.push({
            functionCall: {
              id: decoded.id,
              name: decoded.name,
              args: functionArguments(part.input),
            },
            thoughtSignature:
              decoded.thoughtSignature || "skip_thought_signature_validator",
          });
        } else if (part?.type === "tool_result") {
          const call = calls.get(String(part.tool_use_id ?? ""));
          const decoded = call ?? decodeFunctionCall(part.tool_use_id);
          parts.push({
            functionResponse: {
              id: decoded.id,
              name: decoded.name,
              response: { result: functionResult(part.content) },
            },
          });
        }
      }
    }
    if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        const fn = call.function ?? call;
        const mapped = calls.get(String(call.id ?? ""));
        const decoded = mapped ?? decodeFunctionCall(call.id, fn.name);
        parts.push({
          functionCall: {
            id: decoded.id,
            name: decoded.name,
            args: functionArguments(fn.arguments),
          },
          thoughtSignature:
            decoded.thoughtSignature || "skip_thought_signature_validator",
        });
      }
    }
    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: parts.length ? parts : [{ text: "." }],
    });
  }

  const generationConfig: any = {};
  if (body.temperature !== undefined)
    generationConfig.temperature = body.temperature;
  if (body.max_tokens !== undefined)
    generationConfig.maxOutputTokens = body.max_tokens;
  else if (body.max_completion_tokens !== undefined)
    generationConfig.maxOutputTokens = body.max_completion_tokens;
  else if (body.max_output_tokens !== undefined)
    generationConfig.maxOutputTokens = body.max_output_tokens;
  if (body.top_p !== undefined) generationConfig.topP = body.top_p;
  if (body.top_k !== undefined) generationConfig.topK = body.top_k;
  if (body.stop !== undefined)
    generationConfig.stopSequences = Array.isArray(body.stop)
      ? body.stop
      : [body.stop];

  const isClaude = /claude/i.test(body.model);
  if (isClaude) {
    const thinkingBudget = body.thinking?.budget_tokens || 32000;
    generationConfig.thinkingConfig = {
      include_thoughts: true,
      thinking_budget: thinkingBudget,
    };
    if (
      generationConfig.maxOutputTokens &&
      generationConfig.maxOutputTokens <= thinkingBudget
    ) {
      generationConfig.maxOutputTokens = thinkingBudget + 8192;
    }
  } else if (/gemini|gpt|thinking/i.test(body.model)) {
    const resolvedEffort = body.__klove_reasoning?.effort;
    const effort =
      body.__klove_reasoning?.upstreamValue ??
      body.reasoning?.effort ??
      body.reasoning_effort ??
      modelReasoningEffort(body.model);
    const normalizedEffort = String(effort ?? "").toLowerCase();
    const disabled = resolvedEffort === "none" || normalizedEffort === "none";
    const thinkingConfig: any = {
      includeThoughts: !disabled,
    };
    if (disabled) {
      if (/gemini-3/i.test(body.model)) {
        // Gemini 3 is level-based and cannot fully disable thinking.
        thinkingConfig.thinkingLevel = "low";
      } else if (geminiProModel(body.model)) {
        thinkingConfig.thinkingBudget = 128;
      } else {
        thinkingConfig.thinkingBudget = 0;
      }
    } else if (effort && /gemini-2\.5/i.test(body.model)) {
      thinkingConfig.thinkingBudget =
        (
          {
            minimal: 512,
            low: 1024,
            medium: 8192,
            high: 16000,
            xhigh: 24576,
            max: 24576,
          } as Record<string, number>
        )[normalizedEffort] ?? 8192;
    } else if (effort) {
      thinkingConfig.thinkingLevel =
        normalizedEffort === "xhigh" || normalizedEffort === "max"
          ? "high"
          : normalizedEffort;
    }
    generationConfig.thinkingConfig = thinkingConfig;
  }

  const request: any = { contents, generationConfig, sessionId };
  if (systemParts.length) {
    request.systemInstruction = {
      role: "user",
      parts: systemParts,
    };
  }

  if (body.tools?.length) {
    request.tools = [
      {
        functionDeclarations: body.tools.map((tool: any) => {
          const fn = tool.function ?? tool;
          return {
            name: functionName(fn.name),
            description: textValue(fn.description),
            parameters: googleSchema(
              fn.parameters ??
                fn.input_schema ?? { type: "object", properties: {} },
            ),
          };
        }),
      },
    ];
  }

  if (isClaude && body.tools?.length) {
    request.toolConfig = {
      functionCallingConfig: {
        mode: "VALIDATED",
      },
    };
  } else {
    const choice = body.tool_choice;
    if (choice || body.parallel_tool_calls !== undefined) {
      request.toolConfig = {
        functionCallingConfig: {
          mode:
            choice === "none" ? "NONE" : choice === "required" ? "ANY" : "AUTO",
          ...(choice?.function?.name
            ? { allowedFunctionNames: [functionName(choice.function.name)] }
            : {}),
        },
      };
    }
  }

  return {
    project: projectId,
    model: modelId(body.model),
    userAgent: "antigravity",
    requestType: "agent",
    requestId: `agent-${crypto.randomUUID()}`,
    request: sanitizeAntigravityPayload(request),
  };
}

export function googleEventToOpenAI(data: any, model: string, id: string) {
  const value = data.response ?? data;
  const candidate = value.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const delta: any = {};
  for (const part of parts) {
    if (part.text)
      delta[part.thought ? "reasoning_content" : "content"] =
        `${delta[part.thought ? "reasoning_content" : "content"] ?? ""}${part.text}`;
    if (part.functionCall)
      delta.tool_calls = [
        {
          index: 0,
          id: encodeFunctionCallId(
            part.functionCall.id,
            part.functionCall.name,
            part.thoughtSignature ??
              part.thought_signature ??
              part.functionCall.thoughtSignature ??
              part.functionCall.thought_signature,
          ),
          type: "function",
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args ?? {}),
          },
        },
      ];
  }
  const reason = candidate?.finishReason;
  const finish_reason =
    reason === "STOP"
      ? "stop"
      : reason === "MAX_TOKENS"
        ? "length"
        : reason
          ? "stop"
          : null;
  const usageMetadata = value.usageMetadata;
  const promptTokens = usageMetadata?.promptTokenCount ?? 0;
  const candidatesTokens = usageMetadata?.candidatesTokenCount ?? 0;
  const thoughtsTokens = usageMetadata?.thoughtsTokenCount ?? 0;
  const totalCompletionTokens = candidatesTokens + thoughtsTokens;
  const cachedTokens = usageMetadata?.cachedContentTokenCount ?? 0;
  const totalTokens =
    usageMetadata?.totalTokenCount ?? promptTokens + totalCompletionTokens;

  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason }],
    ...(usageMetadata
      ? {
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: totalCompletionTokens,
            total_tokens: totalTokens,
            prompt_tokens_details: {
              cached_tokens: cachedTokens,
            },
          },
        }
      : {}),
  };
}

export function googleStreamToOpenAI(
  response: Response,
  model: string,
  id: string,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Antigravity returned an empty stream");
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const streamStarted = performance.now();
  let buffer = "";
  let firstDeltaLogged = false;
  let finishEmitted = false;

  return new Response(
    new ReadableStream({
      async start(controller) {
        const emit = (data: any) =>
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        const processEvent = (eventText: string) => {
          const raw = eventText
            .split(/\r\n|\r|\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).replace(/^ /, ""))
            .join("\n")
            .trim();
          if (!raw || raw === "[DONE]") return;
          try {
            const event = googleEventToOpenAI(JSON.parse(raw), model, id);
            const choice = event.choices[0];
            const hasDelta =
              choice.delta.content ||
              choice.delta.reasoning_content ||
              choice.delta.tool_calls;
            if (!firstDeltaLogged && hasDelta) {
              firstDeltaLogged = true;
              logger.debug("Antigravity first stream delta received", {
                model,
                duration_ms: Math.round(performance.now() - streamStarted),
              });
            }
            if (choice.finish_reason) finishEmitted = true;
            if (hasDelta || choice.finish_reason || event.usage) emit(event);
          } catch {
            /* Ignore non-JSON SSE keepalive events. */
          }
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value ?? new Uint8Array(), {
              stream: !done,
            });
            const events = buffer.split(/\r\n\r\n|\n\n|\r\r/);
            buffer = events.pop() ?? "";
            for (const event of events) processEvent(event);
            if (done) {
              if (buffer.trim()) processEvent(buffer);
              break;
            }
          }
          if (!finishEmitted) {
            emit({
              id,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            });
          }
        } catch (error: any) {
          emit({
            error: {
              message: error?.message ?? "Antigravity stream disconnected",
            },
          });
        } finally {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
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
