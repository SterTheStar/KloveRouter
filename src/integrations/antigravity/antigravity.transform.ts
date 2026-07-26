import { logger } from "../../logger";

function modelId(model: string) {
  return model.toLowerCase().replace(/^antigravity-/, "");
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
function textValue(value: any): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object")
    return String(value.text ?? value.value ?? value.content ?? "");
  return String(value ?? "");
}
function contentParts(content: any) {
  if (Array.isArray(content))
    return content.flatMap((p): any[] => {
      if (
        p?.type === "text" ||
        p?.type === "input_text" ||
        p?.type === "output_text"
      ) {
        const text = textValue(p.text ?? p.value ?? p.content);
        return text ? [{ text }] : [];
      }
      if (p?.type === "image_url" && p.image_url?.url) {
        const match = String(p.image_url.url).match(
          /^data:([^;]+);base64,(.+)$/,
        );
        return match
          ? [{ inlineData: { mimeType: match[1], data: match[2] } }]
          : [];
      }
      return [];
    });
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
    if (key === "properties" && value && typeof value === "object")
      result.properties = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [
          name,
          googleSchema(child),
        ]),
      );
    else if (key === "items") result.items = googleSchema(value);
    else if (key === "anyOf" || key === "oneOf" || key === "allOf") continue;
    else result[key] = value;
  }
  if (typeof result.type === "string") result.type = result.type.toUpperCase();
  if (!result.type) result.type = result.properties ? "OBJECT" : "STRING";
  return result;
}
export function toGoogleBody(
  body: any,
  projectId: string,
  sessionId = crypto.randomUUID(),
) {
  const systemParts = (body.messages ?? [])
    .filter((m: any) => m.role === "system" || m.role === "developer")
    .flatMap((m: any) => contentParts(m.content));
  const contents: any[] = [];
  const calls = new Map<string, AntigravityCall>();
  for (const message of body.messages ?? []) {
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
  for (const message of body.messages ?? []) {
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
    const parts = contentParts(message.content);
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
            ...(decoded.thoughtSignature
              ? { thoughtSignature: decoded.thoughtSignature }
              : {}),
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
          ...(decoded.thoughtSignature
            ? { thoughtSignature: decoded.thoughtSignature }
            : {}),
        });
      }
    }
    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: parts.length ? parts : [{ text: "" }],
    });
  }
  const generationConfig: any = {};
  if (body.temperature !== undefined)
    generationConfig.temperature = body.temperature;
  if (body.max_tokens !== undefined)
    generationConfig.maxOutputTokens = body.max_tokens;
  else if (body.max_completion_tokens !== undefined)
    generationConfig.maxOutputTokens = body.max_completion_tokens;
  if (body.top_p !== undefined) generationConfig.topP = body.top_p;
  if (body.top_k !== undefined) generationConfig.topK = body.top_k;
  if (body.stop !== undefined)
    generationConfig.stopSequences = Array.isArray(body.stop)
      ? body.stop
      : [body.stop];
  if (/gemini|claude|gpt|thinking/i.test(body.model)) {
    const effort =
      modelReasoningEffort(body.model) ??
      body.reasoning?.effort ??
      body.reasoning_effort;
    const thinkingConfig: any = { includeThoughts: true };
    if (effort && /gemini-2\.5/i.test(body.model))
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
        )[effort] ?? 8192;
    else if (effort)
      thinkingConfig.thinkingLevel =
        effort === "xhigh" || effort === "max" ? "high" : effort;
    generationConfig.thinkingConfig = thinkingConfig;
  }
  const request: any = { contents, generationConfig, sessionId };
  if (systemParts.length) request.systemInstruction = { parts: systemParts };
  if (body.tools?.length)
    request.tools = [
      {
        functionDeclarations: body.tools.map((tool: any) => {
          const fn = tool.function ?? tool;
          return {
            name: functionName(fn.name),
            description: textValue(fn.description),
            parameters: googleSchema(
              fn.parameters ?? { type: "object", properties: {} },
            ),
          };
        }),
      },
    ];
  const choice = body.tool_choice;
  if (choice || body.parallel_tool_calls !== undefined)
    request.toolConfig = {
      functionCallingConfig: {
        mode:
          choice === "none" ? "NONE" : choice === "required" ? "ANY" : "AUTO",
        ...(choice?.function?.name
          ? { allowedFunctionNames: [functionName(choice.function.name)] }
          : {}),
      },
    };
  return {
    project: projectId,
    model: modelId(body.model),
    userAgent: "antigravity",
    requestId: `agent-${crypto.randomUUID()}`,
    requestType: "agent",
    request,
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
  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason }],
    ...(usageMetadata
      ? {
          usage: {
            prompt_tokens: usageMetadata.promptTokenCount ?? 0,
            completion_tokens: usageMetadata.candidatesTokenCount ?? 0,
            total_tokens: usageMetadata.totalTokenCount ?? 0,
            prompt_tokens_details: {
              cached_tokens: usageMetadata.cachedContentTokenCount ?? 0,
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
