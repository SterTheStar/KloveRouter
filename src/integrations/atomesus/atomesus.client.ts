import { getDb } from "../../db/connection";
import { createHash } from "node:crypto";

const DEFAULT_BASE_URL = "https://api.atomesus.com";
const DEFAULT_MODELS = ["atomesus-1-5", "atomesus-2", "cipher"] as const;
const EFFORTS = ["Low", "Medium", "High"] as const;

type AtomesusCredential = { id: string; secret?: string | null };
type ChatMessage = { role?: string; content?: unknown };

function tokenOf(credential: AtomesusCredential) {
  if (!credential.secret) throw new Error("AtomeSus token is not configured");
  return credential.secret;
}

function apiUrl(endpoint?: string) {
  const base = (endpoint || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return base.endsWith("/api/chat/atomesus")
    ? base
    : `${base}/api/chat/atomesus`;
}

function textContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function normalizedHistory(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: textContent(message.content),
    }));
}

function resolveEffort(body: any): (typeof EFFORTS)[number] {
  const raw = body.__klove_reasoning?.upstreamValue ??
    body.reasoning?.effort ??
    body.reasoning_effort ??
    body.effort;
  if (raw == null) return "Medium";
  const normalized = String(raw).toLowerCase();
  const aliases: Record<string, (typeof EFFORTS)[number]> = {
    none: "Low",
    off: "Low",
    disabled: "Low",
    false: "Low",
    minimal: "Low",
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "High",
    max: "High",
  };
  const effort = aliases[normalized];
  if (!effort) throw new Error(`Unsupported AtomeSus effort: ${raw}`);
  return effort;
}

export function encodeAtomesusConfig(model: string, effort: string, timestamp = Date.now()) {
  return Buffer.from(JSON.stringify({ m: model, e: effort, t: timestamp }), "utf8").toString("base64");
}

function findSession(
  credentialId: string,
  messages: ChatMessage[],
  model: string,
  effort: string,
  system: string,
  fileKey: string,
) {
  const incoming = normalizedHistory(messages);
  if (!incoming.length) return null;
  const rows = getDb()
    .query(
      "SELECT session_id, messages FROM atomesus_sessions WHERE credential_id = ? AND model = ? AND effort = ? AND system = ? AND file_key = ? ORDER BY updated_at DESC",
    )
    .all(credentialId, model, effort, system, fileKey) as {
      session_id: string;
      messages: string;
    }[];
  for (const row of rows) {
    try {
      const stored = JSON.parse(row.messages);
      if (!Array.isArray(stored) || stored.length > incoming.length) continue;
      if (stored.every((message, index) =>
        message.role === incoming[index]?.role &&
        message.content === incoming[index]?.content
      )) return row.session_id;
    } catch {
      continue;
    }
  }
  return null;
}

function saveSession(
  credentialId: string,
  sessionId: string,
  messages: ChatMessage[],
  assistantContent: string,
  model: string,
  effort: string,
  system: string,
  fileKey: string,
) {
  const history = normalizedHistory(messages);
  if (history.at(-1)?.role !== "assistant")
    history.push({ role: "assistant", content: assistantContent });
  getDb().query(
    `INSERT INTO atomesus_sessions (credential_id, session_id, messages, model, effort, system, file_key, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(credential_id, session_id) DO UPDATE SET
       messages = excluded.messages, model = excluded.model, effort = excluded.effort,
       system = excluded.system, file_key = excluded.file_key, updated_at = datetime('now')`,
  ).run(
    credentialId,
    sessionId,
    JSON.stringify(history),
    model,
    effort,
    system,
    fileKey,
  );
}

function replyFromJson(data: any): { content: string; sessionId?: string } {
  const content = data?.data?.reply ?? data?.content ?? data?.text ?? data?.response;
  if (typeof content !== "string")
    throw new Error("AtomeSus returned an invalid response");
  return { content, sessionId: data?.data?.sessionId ?? data?.sessionId };
}

function parseSseEvent(raw: string) {
  if (!raw || raw === "[DONE]") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readAtomesusResponse(response: Response) {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/event-stream"))
    return replyFromJson(await response.json());
  const text = await response.text();
  let content = "";
  let sessionId: string | undefined;
  for (const event of text.split(/\r?\n\r?\n/)) {
    const raw = event.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    const data = parseSseEvent(raw);
    if (data?.type === "start" && data.sessionId) sessionId = data.sessionId;
    if (data?.type === "content" && typeof data.content === "string") content += data.content;
  }
  if (!content) throw new Error("AtomeSus returned an empty response");
  return { content, sessionId };
}

function completion(model: string, content: string) {
  return {
    id: `chatcmpl-${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: "assistant", content },
      logprobs: null,
      finish_reason: "stop",
    }],
  };
}

function streamCompletion(model: string, content: string) {
  const encoder = new TextEncoder();
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  return new Response(new ReadableStream({
    start(controller) {
      const send = (delta: Record<string, unknown>, finishReason: string | null = null) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta, finish_reason: finishReason }],
        })}\n\n`));
      send({ role: "assistant", content: "" });
      if (content) send({ content });
      send({}, "stop");
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function liveStreamCompletion(
  response: Response,
  model: string,
  credentialId: string,
  messages: ChatMessage[],
  existingSessionId: string | null,
  effort: string,
  system: string,
  fileKey: string,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("AtomeSus returned an empty stream");
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  let buffer = "";
  let content = "";
  let sessionId = existingSessionId ?? undefined;
  let cancelled = false;

  return new Response(new ReadableStream({
    start(controller) {
      const send = (delta: Record<string, unknown>, finishReason: string | null = null) => {
        if (cancelled) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta, finish_reason: finishReason }],
        })}\n\n`));
      };
      const processEvent = (event: string) => {
        const raw = event.split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        const data = parseSseEvent(raw);
        if (data?.type === "start" && data.sessionId) sessionId = data.sessionId;
        if (data?.type === "content" && typeof data.content === "string") {
          content += data.content;
          send({ content: data.content });
        }
      };

      send({ role: "assistant", content: "" });
      void (async () => {
        try {
          while (!cancelled) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
            const events = buffer.split(/\r?\n\r?\n/);
            buffer = events.pop() ?? "";
            for (const event of events) processEvent(event);
            if (done) break;
          }
          if (buffer.trim()) processEvent(buffer);
          if (!cancelled) {
            if (sessionId)
              saveSession(
                credentialId,
                sessionId,
                messages,
                content,
                model,
                effort,
                system,
                fileKey,
              );
            send({}, "stop");
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        } catch (error) {
          if (!cancelled) {
            const message = error instanceof Error ? error.message : "AtomeSus stream disconnected";
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { message } })}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        }
      })();
    },
    cancel() {
      cancelled = true;
      void reader.cancel();
    },
  }), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function appendFile(form: FormData, file: any) {
  if (!file) return;
  const name = typeof file.name === "string" ? file.name : "attachment";
  const type = typeof file.type === "string" ? file.type : "application/octet-stream";
  if (typeof file.data !== "string")
    throw new Error("AtomeSus file.data must be a base64 string or data URL");
  const encoded = file.data.includes(",") ? file.data.slice(file.data.indexOf(",") + 1) : file.data;
  form.append("file", new Blob([Buffer.from(encoded, "base64")], { type }), name);
}

export function atomesusModels() {
  return DEFAULT_MODELS.map((id) => ({ id, display_name: id }));
}

export async function atomesusResponses(
  body: any,
  model: string,
  credential: AtomesusCredential,
  endpoint?: string,
): Promise<Response | ReturnType<typeof completion>> {
  if (!DEFAULT_MODELS.includes(model as any))
    throw new Error(`Unsupported AtomeSus model: ${model}`);
  if (body.tools?.length || body.functions?.length)
    throw new Error("AtomeSus does not support tool calls");
  const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find((message) => message?.role === "user");
  const message = textContent(lastUser?.content);
  if (!message) throw new Error("AtomeSus requires a user text message");
  const system = messages
    .filter((item) => item?.role === "system" || item?.role === "developer")
    .map((item) => textContent(item.content))
    .filter(Boolean)
    .join("\n\n");
  const effort = resolveEffort(body);
  const fileKey = body.file
    ? createHash("sha256")
        .update(
          JSON.stringify({
            name: body.file.name ?? "attachment",
            type: body.file.type ?? "application/octet-stream",
            data: body.file.data ?? "",
          }),
        )
        .digest("hex")
    : "";
  const sessionId = findSession(
    credential.id,
    messages,
    model,
    effort,
    system,
    fileKey,
  );
  const form = new FormData();
  form.append("message", message);
  if (system) form.append("system", system);
  if (sessionId) form.append("sessionId", sessionId);
  appendFile(form, body.file);

  const response = await fetch(apiUrl(endpoint), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenOf(credential)}`,
      Accept: "text/event-stream, application/json",
      Cookie: `__ax_cfg_v1=${encodeAtomesusConfig(model, effort)}`,
    },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    throw new Error(`AtomeSus request failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  if (body.stream && response.headers.get("content-type")?.includes("text/event-stream"))
    return liveStreamCompletion(
      response,
      model,
      credential.id,
      messages,
      sessionId,
      effort,
      system,
      fileKey,
    );
  const result = await readAtomesusResponse(response);
  const resolvedSessionId = result.sessionId ?? sessionId;
  if (resolvedSessionId)
    saveSession(
      credential.id,
      resolvedSessionId,
      messages,
      result.content,
      model,
      effort,
      system,
      fileKey,
    );
  return body.stream
    ? streamCompletion(model, result.content)
    : completion(model, result.content);
}

export async function atomesusTest(
  model: string,
  credential: AtomesusCredential,
  endpoint?: string,
) {
  return atomesusResponses({
    messages: [{ role: "user", content: "Say 'ok' and nothing else." }],
    stream: false,
  }, model, credential, endpoint);
}
