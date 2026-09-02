import { codexAuthService } from "./codex-auth.service";
import { logger } from "../../logger";
import { extractSseData, SSE_DONE } from "../../services/sse";

const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
const CODEX_CLIENT_VERSION = process.env.CODEX_CLIENT_VERSION || "1.0.0";
const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const CODEX_RESET_CREDITS_URL =
  "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";

type CodexModel = {
  slug?: string;
  display_name?: string;
  visibility?: string;
  supported_in_api?: boolean;
  [key: string]: unknown;
};

export type CodexUsage = {
  plan_type?: string;
  rate_limit?: {
    allowed?: boolean;
    limit_reached?: boolean;
    primary_window?: CodexUsageWindow | null;
    secondary_window?: CodexUsageWindow | null;
  };
  credits?: {
    has_credits?: boolean;
    unlimited?: boolean;
    balance?: string | number;
  };
  spend_control?: unknown;
  rate_limit_reached_type?: unknown;
};

export type CodexUsageWindow = {
  used_percent?: number;
  limit_window_seconds?: number;
  reset_after_seconds?: number;
  reset_at?: number;
};

function codexHeaders(token: string, accountId: string | null) {
  return {
    Authorization: `Bearer ${token}`,
    ...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
    "User-Agent": "codex-cli",
    Accept: "application/json",
  };
}

type CodexCredentials = {
  access_token?: string | null;
  account_id?: string | null;
};

function requiredCredentials(credentials?: CodexCredentials) {
  if (!credentials?.access_token)
    throw new Error("Codex account is not authenticated");
  return credentials;
}

export async function codexUsage(
  credentials?: CodexCredentials,
): Promise<CodexUsage> {
  const selected = requiredCredentials(
    credentials ?? {
      access_token: await codexAuthService.accessToken(),
      account_id: await codexAuthService.accountId(),
    },
  );
  const response = await fetch(CODEX_USAGE_URL, {
    headers: codexHeaders(selected.access_token!, selected.account_id ?? null),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      data?.detail ||
        data?.message ||
        `Codex usage request failed (${response.status})`,
    );
  return data as CodexUsage;
}

export async function codexResetCredits(credentials?: CodexCredentials) {
  const selected = requiredCredentials(
    credentials ?? {
      access_token: await codexAuthService.accessToken(),
      account_id: await codexAuthService.accountId(),
    },
  );
  const response = await fetch(CODEX_RESET_CREDITS_URL, {
    headers: codexHeaders(selected.access_token!, selected.account_id ?? null),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      data?.detail ||
        data?.message ||
        `Codex reset credits request failed (${response.status})`,
    );
  return data;
}

export async function codexConsumeResetCredit(
  creditId?: string,
  credentials?: CodexCredentials,
) {
  const selected = requiredCredentials(
    credentials ?? {
      access_token: await codexAuthService.accessToken(),
      account_id: await codexAuthService.accountId(),
    },
  );
  const response = await fetch(`${CODEX_RESET_CREDITS_URL}/consume`, {
    method: "POST",
    headers: {
      ...codexHeaders(selected.access_token!, selected.account_id ?? null),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      redeem_request_id: crypto.randomUUID(),
      ...(creditId ? { credit_id: creditId } : {}),
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      data?.detail ||
        data?.message ||
        `Codex reset credit request failed (${response.status})`,
    );
  return data;
}

export async function codexModels(credentials?: CodexCredentials) {
  const selected = requiredCredentials(
    credentials ?? {
      access_token: await codexAuthService.accessToken(),
      account_id: await codexAuthService.accountId(),
    },
  );
  const url = new URL(`${CODEX_BASE_URL}/models`);
  url.searchParams.set("client_version", CODEX_CLIENT_VERSION);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${selected.access_token}`,
      "chatgpt-account-id": selected.account_id || "",
      originator: "codex_cli_rs",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Codex models request failed (${response.status})`);
  }

  const payload = (await response.json().catch(() => null)) as {
    models?: CodexModel[];
  } | null;
  const models = (payload?.models || [])
    .filter(
      (model) =>
        model.slug &&
        model.visibility !== "hidden" &&
        model.supported_in_api !== false,
    )
    .map((model) => ({
      ...model,
      id: model.slug!,
      object: "model",
      owned_by: "codex",
      display_name: model.display_name || model.slug!,
    }));

  if (!models.length) {
    throw new Error("Codex returned no API-compatible models");
  }

  return models;
}

function toResponsesContent(content: any, role: "user" | "assistant") {
  if (typeof content === "string")
    return [
      {
        type: role === "assistant" ? "output_text" : "input_text",
        text: content,
      },
    ];
  if (!Array.isArray(content))
    return [
      {
        type: role === "assistant" ? "output_text" : "input_text",
        text: String(content ?? ""),
      },
    ];
  return content.flatMap((part: any) => {
    if (part.type === "text" || part.type === "input_text")
      return [
        {
          type: role === "assistant" ? "output_text" : "input_text",
          text: part.text ?? "",
        },
      ];
    if (part.type === "image_url" && role === "user")
      return [
        {
          type: "input_image",
          image_url: part.image_url?.url ?? part.image_url,
        },
      ];
    if (part.type === "input_image" && role === "user") return [part];
    return [];
  });
}

function toResponsesInput(messages: any[] = []) {
  const callIds = new Map<string, string>();
  const responseCallId = (value: unknown) => {
    const original = String(value ?? "");
    if (original.startsWith("fc_")) return original;
    const existing = callIds.get(original);
    if (existing) return existing;
    const id = `fc_${crypto.randomUUID().replace(/-/g, "")}`;
    callIds.set(original, id);
    return id;
  };
  const input: any[] = [];
  const instructions: string[] = [];
  for (const message of messages) {
    if (message.role === "system" || message.role === "developer") {
      const content =
        typeof message.content === "string"
          ? message.content
          : toResponsesContent(message.content, "user")
              .map((part) => part.text ?? "")
              .join("\n");
      if (content) instructions.push(content);
      continue;
    }
    if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
      const text = toResponsesContent(message.content, "assistant");
      input.push(
        ...(text.length ? [{ role: "assistant", content: text }] : []),
        ...message.tool_calls.map((call: any) => ({
          type: "function_call",
          id: responseCallId(call.id),
          call_id: responseCallId(call.id),
          name: call.function?.name,
          arguments: call.function?.arguments ?? "{}",
        })),
      );
      continue;
    }
    if (message.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: responseCallId(message.tool_call_id),
        output:
          typeof message.content === "string"
            ? message.content
            : JSON.stringify(message.content ?? ""),
      });
      continue;
    }
    if (message.role === "user" || message.role === "assistant") {
      input.push({
        role: message.role,
        ...(message.name ? { name: message.name } : {}),
        content: toResponsesContent(message.content, message.role),
      });
    }
  }
  return { input, instructions: instructions.join("\n\n") };
}

function toResponsesTools(tools: any[] = []) {
  return tools.map((tool) => {
    if (tool?.type === "function" && tool.function) {
      return {
        type: "function",
        name: tool.function.name,
        description: tool.function.description ?? "",
        parameters: tool.function.parameters ?? {
          type: "object",
          properties: {},
        },
        strict: tool.function.strict ?? tool.strict ?? false,
      };
    }
    return tool;
  });
}

function toResponsesToolChoice(choice: any) {
  if (choice === "auto" || choice === "none" || choice === "required")
    return choice;
  if (choice?.type === "function" && choice.function?.name)
    return { type: "function", name: choice.function.name };
  if (choice?.type === "function" && choice.name)
    return { type: "function", name: choice.name };
  return choice;
}

function toResponsesTextFormat(format: any) {
  if (!format) return undefined;
  if (format.type === "text") return { format: { type: "text" } };
  if (format.type === "json_object") return { format: { type: "json_object" } };
  if (format.type === "json_schema" && format.json_schema) {
    return {
      format: {
        type: "json_schema",
        name: format.json_schema.name,
        description: format.json_schema.description,
        schema: format.json_schema.schema,
        strict: format.json_schema.strict ?? true,
      },
    };
  }
  return undefined;
}

export async function codexResponses(
  body: any,
  model: string,
  credentials?: { access_token?: string | null; account_id?: string | null },
) {
  const legacySession =
    credentials && !credentials.access_token && credentials.account_id === null;
  const token = legacySession
    ? await codexAuthService.accessToken()
    : credentials
      ? credentials.access_token
      : await codexAuthService.accessToken();
  const accountId = legacySession
    ? await codexAuthService.accountId()
    : credentials
      ? credentials.account_id
      : await codexAuthService.accountId();
  if (!token) throw new Error("Codex account is not authenticated");
  const converted = body.input
    ? { input: body.input, instructions: body.instructions ?? "" }
    : toResponsesInput(body.messages);
  const requestBody = codexRequestBody(body, model, converted);
  const requestStarted = performance.now();
  const response = await fetch(
    "https://chatgpt.com/backend-api/codex/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "chatgpt-account-id": accountId || "",
        "OpenAI-Beta": "responses=experimental",
        originator: "codex_cli_rs",
        session_id: crypto.randomUUID(),
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    },
  );
  logger.debug("Codex response headers received", {
    model,
    duration_ms: Math.round(performance.now() - requestStarted),
    status: response.status,
  });
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 429 && text.includes("usage_limit_reached"))
      throw new Error("Codex usage limit reached");
    throw new Error(text || `Codex request failed (${response.status})`);
  }
  return response;
}

export function codexRequestBody(
  body: any,
  model: string,
  converted = body.input
    ? { input: body.input, instructions: body.instructions ?? "" }
    : toResponsesInput(body.messages),
) {
  const text = toResponsesTextFormat(body.response_format);
  const resolved = body.__klove_reasoning;
  const reasoningInput =
    body.reasoning && typeof body.reasoning === "object" ? body.reasoning : {};
  const reasoning =
    resolved?.effort === "none"
      ? undefined
      : resolved?.upstreamValue
        ? {
            ...reasoningInput,
            effort: resolved.upstreamValue,
            summary: reasoningInput.summary ?? "auto",
          }
        : Object.keys(reasoningInput).length
          ? reasoningInput
          : undefined;
  return {
    model,
    input: converted.input,
    instructions: converted.instructions,
    store: body.store ?? false,
    stream: true,
    ...(body.tools?.length ? { tools: toResponsesTools(body.tools) } : {}),
    ...(body.tool_choice !== undefined
      ? { tool_choice: toResponsesToolChoice(body.tool_choice) }
      : {}),
    ...(body.parallel_tool_calls !== undefined
      ? { parallel_tool_calls: body.parallel_tool_calls }
      : {}),
    ...(body.temperature !== undefined
      ? { temperature: body.temperature }
      : {}),
    ...(body.top_p !== undefined ? { top_p: body.top_p } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(text ? { text } : {}),
  };
}

export function codexStreamToOpenAI(response: Response, model: string) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Codex returned an empty response");
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const tools = new Map<number, { id?: string; name?: string }>();
  let buffer = "";
  let cancelled = false;
  const streamStarted = performance.now();
  let firstDeltaLogged = false;

  return new Response(
    new ReadableStream({
      async start(controller) {
        const emit = (chunk: any) => {
          if (cancelled) return;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
          );
        };
        const processEvent = (event: string) => {
          const raw = extractSseData(event);
          if (!raw || raw === SSE_DONE) return;
          let data: any;
          try {
            data = JSON.parse(raw);
          } catch {
            return;
          }
          if (
            !firstDeltaLogged &&
            typeof data.type === "string" &&
            data.type.endsWith(".delta")
          ) {
            firstDeltaLogged = true;
            logger.debug("Codex first stream delta received", {
              model,
              duration_ms: Math.round(performance.now() - streamStarted),
              event_type: data.type,
            });
          }
          const base = {
            id,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
          };
          if (data.type === "response.output_text.delta") {
            emit({
              ...base,
              choices: [
                {
                  index: 0,
                  delta: { content: data.delta ?? "" },
                  finish_reason: null,
                },
              ],
            });
          } else if (
            data.type === "response.reasoning_summary_text.delta" ||
            data.type === "response.reasoning_text.delta" ||
            data.type === "response.reasoning.delta"
          ) {
            emit({
              ...base,
              choices: [
                {
                  index: 0,
                  delta: { reasoning_content: data.delta ?? "" },
                  finish_reason: null,
                },
              ],
            });
          } else if (
            data.type === "response.output_item.added" &&
            data.item?.type === "function_call"
          ) {
            const index = Number(data.output_index ?? 0);
            tools.set(index, {
              id: data.item.call_id ?? data.item.id,
              name: data.item.name,
            });
            emit({
              ...base,
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      {
                        index,
                        id: data.item.call_id ?? data.item.id,
                        type: "function",
                        function: { name: data.item.name, arguments: "" },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            });
          } else if (data.type === "response.function_call_arguments.delta") {
            const index = Number(data.output_index ?? 0);
            const tool = tools.get(index);
            emit({
              ...base,
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      {
                        index,
                        ...(tool?.id ? { id: tool.id } : {}),
                        type: "function",
                        function: {
                          ...(tool?.name ? { name: tool.name } : {}),
                          arguments: data.delta ?? "",
                        },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            });
          } else if (data.type === "response.completed") {
            const status = data.response?.status;
            const finish =
              status === "incomplete"
                ? "length"
                : tools.size
                  ? "tool_calls"
                  : "stop";
            const usage = data.response?.usage;
            emit({
              ...base,
              choices: [{ index: 0, delta: {}, finish_reason: finish }],
              ...(usage
                ? {
                    usage: {
                      prompt_tokens: usage.input_tokens ?? 0,
                      completion_tokens: usage.output_tokens ?? 0,
                      total_tokens: usage.total_tokens ?? 0,
                      ...(usage.input_tokens_details
                        ? { prompt_tokens_details: usage.input_tokens_details }
                        : {}),
                      ...(usage.prompt_tokens_details
                        ? { prompt_tokens_details: usage.prompt_tokens_details }
                        : {}),
                      ...(usage.cache_read_input_tokens !== undefined
                        ? {
                            cache_read_input_tokens:
                              usage.cache_read_input_tokens,
                          }
                        : {}),
                      ...(usage.cached_input_tokens !== undefined
                        ? { cached_input_tokens: usage.cached_input_tokens }
                        : {}),
                      ...(usage.cached_tokens !== undefined
                        ? { cached_tokens: usage.cached_tokens }
                        : {}),
                    },
                  }
                : {}),
            });
          } else if (data.type === "response.failed" || data.type === "error") {
            emit({
              error: {
                message:
                  data.error?.message ??
                  data.message ??
                  "Codex response failed",
              },
            });
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
            if (done || cancelled) {
              if (done && !cancelled && buffer.trim()) processEvent(buffer);
              break;
            }
          }
          if (!cancelled) controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (error: any) {
          if (!cancelled) emit({ error: { message: error.message } });
        } finally {
          if (!cancelled) controller.close();
        }
      },
      cancel() {
        cancelled = true;
        void reader.cancel();
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

export async function codexTest(
  model: string,
  credentials?: { access_token?: string | null; account_id?: string | null },
) {
  const response = await codexResponses(
    {
      messages: [{ role: "user", content: "Say 'ok' and nothing else." }],
    },
    model,
    credentials,
  );
  const text = await response.text();
  const reply: string[] = [];

  for (const event of text.split("\n\n")) {
    const dataLine = event.split("\n").find((line) => line.startsWith("data:"));
    if (!dataLine) continue;
    const data = dataLine.slice(5).trim();
    if (data === "[DONE]") continue;
    try {
      const parsed = JSON.parse(data);
      if (
        parsed.type === "response.output_text.delta" &&
        typeof parsed.delta === "string"
      ) {
        reply.push(parsed.delta);
      }
    } catch {
      // Ignore non-JSON SSE keepalive events.
    }
  }

  const output = reply.join("").trim();
  if (!output) throw new Error("Codex returned an empty response");
  return output;
}
