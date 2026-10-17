/* Adapted from opencode-compat-shim by ArcticWinter (Copyright 2026), MIT licensed. */
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getOpenfreeCliStatus } from "../../services/openfree-cli.service";

const MODELS_ENDPOINT = "https://opencode.ai/zen/v1/models";
const MODELS_CACHE_TTL_MS = 5 * 60_000;
const MODELS_RETRY_DELAY_MS = 30_000;
const FREE_MODEL_IDS_WITHOUT_MARKER = new Set(["big-pickle"]);
const OPEN_FENCE = "<hermes_tool_call>";
const CLOSE_FENCE = "</hermes_tool_call>";
const READ_TIMEOUT_MS = 5 * 60_000;
const TRANSIENT_ERROR = /interrupt|abort|timeout|econn|reset|timed out/i;

type OpenFreeModel = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  display_name: string;
  is_free: true;
  capabilities: {
    tools: boolean;
    vision: boolean;
    streaming: boolean;
    non_streaming: boolean;
  };
};

let modelsCache: OpenFreeModel[] = [];
let modelsCacheExpiresAt = 0;
let modelsRetryAt = 0;
let modelsFetchError: Error | null = null;
let modelsRequest: Promise<OpenFreeModel[]> | null = null;

const TOOL_PROTOCOL = `# TOOL PROTOCOL (read carefully)

You do NOT have any built-in tools. Anything you think you can do with a built-in shell, file reader or editor does not exist here, and its output is discarded. You have exactly the tools listed below, provided by an external harness that executes them for you and returns the results.

To call one or more tools, output ONLY this fenced block, with no other text:

<hermes_tool_call>
{"name": "TOOL_NAME", "arguments": {"KEY": "VALUE"}}
</hermes_tool_call>

Rules:
- The block must be the entire response. No prose before or after it.
- arguments must be a JSON object matching that tool's parameters schema.
- To call several tools at once, put one JSON object per line inside the single block. They are executed in parallel.
- Use EXACT tool names as written below.
- When you already have everything you need, reply with plain prose and NO block.`;

type ChatMessage = {
  role?: string;
  content?: unknown;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{ function?: { name?: string; arguments?: unknown } }>;
};

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export async function openfreeModels(): Promise<OpenFreeModel[]> {
  const now = Date.now();
  if (modelsCache.length && (now < modelsCacheExpiresAt || now < modelsRetryAt)) return modelsCache;
  if (modelsFetchError && now < modelsRetryAt) throw modelsFetchError;
  if (modelsRequest) return modelsRequest;

  const request = (async () => {
    try {
      const response = await fetch(MODELS_ENDPOINT, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`OpenCode Zen model catalog returned HTTP ${response.status}`);
      const payload: any = await response.json();
      const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : payload?.models;
      if (!Array.isArray(rows)) throw new Error("OpenCode Zen model catalog response has an unexpected format");

      const seen = new Set<string>();
      const models: OpenFreeModel[] = rows.flatMap((row: any) => {
        if (!row || typeof row !== "object") return [];
        const id = typeof row.id === "string" ? row.id.trim() : "";
        const hasFreeMarker = /free/i.test(`${id} ${typeof row.name === "string" ? row.name : ""}`);
        if (!id || (!hasFreeMarker && !FREE_MODEL_IDS_WITHOUT_MARKER.has(id.toLowerCase()))) return [];
        const key = id.toLowerCase();
        if (seen.has(key)) return [];
        seen.add(key);
        return [{
          id,
          object: "model" as const,
          created: typeof row.created === "number" ? row.created : 0,
          owned_by: typeof row.owned_by === "string" ? row.owned_by : "opencode",
          display_name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : id,
          is_free: true as const,
          capabilities: {
            tools: true,
            vision: false,
            streaming: true,
            non_streaming: true,
          },
        }];
      });
      if (!models.length) throw new Error("OpenCode Zen did not return any free OpenFREE models");

      modelsCache = models;
      modelsCacheExpiresAt = Date.now() + MODELS_CACHE_TTL_MS;
      modelsRetryAt = 0;
      modelsFetchError = null;
      return models;
    } catch (error) {
      modelsRetryAt = Date.now() + MODELS_RETRY_DELAY_MS;
      modelsFetchError = new Error(`Unable to load the public OpenCode Zen model catalog: ${error instanceof Error ? error.message : String(error)}`);
      if (modelsCache.length) return modelsCache;
      throw modelsFetchError;
    } finally {
      modelsRequest = null;
    }
  })();
  modelsRequest = request;
  return request;
}

async function resolveModel(value: string): Promise<string> {
  const available = await openfreeModels();
  let model = (value || "").trim();
  for (const prefix of ["opencode-go/", "opencode/"]) {
    if (model.startsWith(prefix)) model = model.slice(prefix.length);
  }
  const selected = model
    ? available.find((entry) => entry.id.toLowerCase() === model.toLowerCase())
    : available[0];
  if (!selected) {
    throw new Error(model
      ? `OpenFREE model '${model}' is not in the current public free model catalog`
      : "OpenFREE has no free models in the current public catalog");
  }
  return selected.id;
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part: any) => {
    if (!part || typeof part !== "object") return "";
    if (part.type === "image_url" || part.type === "image") return "[image supplied; this transport is text-only]";
    return typeof part.text === "string" ? part.text : "";
  }).filter(Boolean).join(" ");
}

function flattenHistory(messages: ChatMessage[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    const role = message.role || "user";
    if (role === "tool") {
      const name = message.name || message.tool_call_id || "tool";
      lines.push(`[tool result: ${name}]\n${contentText(message.content)}`);
      continue;
    }
    for (const toolCall of message.tool_calls || []) {
      const fn = toolCall.function || {};
      let args = fn.arguments;
      if (typeof args === "string") {
        try { args = JSON.stringify(JSON.parse(args)); } catch { /* Preserve malformed historical arguments. */ }
      }
      if (fn.name) lines.push(`[tool call: ${fn.name}]\narguments: ${JSON.stringify(args ?? {})}`);
    }
    const text = contentText(message.content);
    if (!text) continue;
    if (role === "system" || role === "developer") lines.push(`[system]\n${text}`);
    else if (role === "assistant") lines.push(`[assistant]\n${text}`);
    else lines.push(`[user]\n${text}`);
  }
  return lines.join("\n\n").trim();
}

function renderTools(tools: any[]): string {
  if (!tools.length) return "";
  const output = ["# AVAILABLE TOOLS"];
  for (const tool of tools) {
    const fn = tool?.function || {};
    output.push(`## ${fn.name || "unnamed"}`);
    if (typeof fn.description === "string") output.push(fn.description.trim());
    const schema = fn.parameters || {};
    const properties = schema.properties || {};
    if (Object.keys(properties).length) {
      output.push("parameters (JSON Schema):");
      output.push(JSON.stringify({
        type: schema.type || "object",
        properties,
        required: schema.required || [],
      }));
    }
    output.push("");
  }
  return output.join("\n");
}

function buildPrompt(body: any): string {
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const parts = tools.length ? [TOOL_PROTOCOL, renderTools(tools)] : [];
  const history = flattenHistory(Array.isArray(body.messages) ? body.messages : []);
  parts.push(history || "Hello");
  return parts.filter(Boolean).join("\n\n");
}

function partialSuffixLength(value: string, fence: string): number {
  for (let length = Math.min(fence.length - 1, value.length); length > 0; length--) {
    if (value.endsWith(fence.slice(0, length))) return length;
  }
  return 0;
}

class ToolFenceSplitter {
  private buffer = "";
  private inTool = false;

  feed(value: string): Array<["text" | "tool", string]> {
    this.buffer += value;
    const chunks: Array<["text" | "tool", string]> = [];
    while (this.buffer) {
      if (this.inTool) {
        const index = this.buffer.indexOf(CLOSE_FENCE);
        if (index >= 0) {
          if (index) chunks.push(["tool", this.buffer.slice(0, index)]);
          this.buffer = this.buffer.slice(index + CLOSE_FENCE.length);
          this.inTool = false;
          continue;
        }
        const keep = partialSuffixLength(this.buffer, CLOSE_FENCE);
        if (this.buffer.length > keep) {
          const cut = this.buffer.length - keep;
          chunks.push(["tool", this.buffer.slice(0, cut)]);
          this.buffer = this.buffer.slice(cut);
        }
        return chunks;
      }
      const index = this.buffer.indexOf(OPEN_FENCE);
      if (index >= 0) {
        if (index) chunks.push(["text", this.buffer.slice(0, index)]);
        this.buffer = this.buffer.slice(index + OPEN_FENCE.length);
        this.inTool = true;
        continue;
      }
      const keep = partialSuffixLength(this.buffer, OPEN_FENCE);
      if (this.buffer.length > keep) {
        const cut = this.buffer.length - keep;
        chunks.push(["text", this.buffer.slice(0, cut)]);
        this.buffer = this.buffer.slice(cut);
      }
      return chunks;
    }
    return chunks;
  }

  flush(): Array<["text" | "tool", string]> {
    if (!this.buffer) return [];
    const result: Array<["text" | "tool", string]> = [[this.inTool ? "tool" : "text", this.buffer]];
    this.buffer = "";
    this.inTool = false;
    return result;
  }
}

function parseToolBlock(raw: string): ToolCall[] {
  const value = raw.trim();
  if (!value) return [];
  let parsed: any;
  try {
    parsed = JSON.parse(value);
  } catch {
    const rows = value.split(/\r?\n/).flatMap((line) => {
      try { return [JSON.parse(line.trim().replace(/,$/, ""))]; } catch { return []; }
    });
    parsed = rows.length ? rows : null;
  }
  if (parsed == null) return [];
  return (Array.isArray(parsed) ? parsed : [parsed]).flatMap((item: any) => {
    if (!item || typeof item !== "object") return [];
    let name = item.name || item.tool || item.function;
    if (typeof name === "object") name = name.name;
    if (!name) return [];
    let args = item.arguments ?? item.parameters ?? item.args ?? {};
    if (typeof args === "string") {
      try { args = JSON.parse(args); } catch { args = { input: args }; }
    }
    if (!args || typeof args !== "object" || Array.isArray(args)) args = { value: args };
    return [{
      id: `call_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      type: "function" as const,
      function: { name: String(name), arguments: JSON.stringify(args) },
    }];
  });
}

function cliConfigContent(): string {
  let existing: Record<string, any> = {};
  try {
    const parsed = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) existing = parsed;
  } catch {
    // The runtime override must remain valid JSON even if the inherited value is malformed.
  }
  const disabledTools = ["*", "bash", "edit", "write", "read", "grep", "glob", "list", "task", "todowrite", "webfetch", "websearch", "skill", "lsp"];
  const deniedTools = Object.fromEntries(disabledTools.filter((tool) => tool !== "*").map((tool) => [tool, "deny"]));
  return JSON.stringify({
    ...existing,
    tools: { ...(existing.tools || {}), ...Object.fromEntries(disabledTools.map((tool) => [tool, false])) },
    permission: { ...(existing.permission || {}), "*": "deny", ...deniedTools },
  });
}

async function runOpenCode(
  model: string,
  prompt: string,
  signal: AbortSignal | undefined,
  onText: (value: string) => Promise<void> | void,
): Promise<string[]> {
  const cliStatus = getOpenfreeCliStatus();
  const executable = cliStatus.path;
  if (!executable) {
    throw new Error(cliStatus.warning
      ? `OpenFREE could not find an OpenCode CLI. ${cliStatus.warning} Set its path in the OpenFREE provider settings.`
      : "OpenFREE could not find an OpenCode CLI. Install and sign in to OpenCode, or set its executable path in the OpenFREE provider settings.");
  }
  const workDir = mkdtempSync(join(tmpdir(), "klove-openfree-"));
  const child = Bun.spawn(
    [executable, "run", "--format", "json", "--model", `opencode/${model}`],
    {
      cwd: workDir,
      env: {
        ...process.env,
        PWD: workDir,
        OPENCODE_CONFIG_CONTENT: cliConfigContent(),
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const alienTools: string[] = [];
  const stdout = child.stdout.getReader();
  const stderr = child.stderr.getReader();
  let stderrTail = "";
  let stderrDone = false;
  const drainStderr = async () => {
    const decoder = new TextDecoder();
    while (!stderrDone) {
      const { done, value } = await stderr.read();
      if (done) { stderrDone = true; break; }
      stderrTail = (stderrTail + decoder.decode(value, { stream: true })).slice(-2_000);
    }
  };
  const stderrTask = drainStderr();
  let aborted = false;
  const abortChild = () => {
    aborted = true;
    child.kill();
  };
  signal?.addEventListener("abort", abortChild, { once: true });
  if (signal?.aborted) abortChild();

  try {
    child.stdin.write(prompt);
    child.stdin.end();
    const decoder = new TextDecoder();
    let buffer = "";
    let sentText = "";
    const processLine = async (line: string) => {
      if (!line.trim()) return;
      let event: any;
      try { event = JSON.parse(line); } catch { return; }
      if (event.type === "error") {
        const error = event.error || {};
        throw new Error(`${error.type || "OpenCode error"}: ${error.message || "unknown CLI error"}`);
      }
      if (event.type === "tool_use") {
        alienTools.push(String(event.part?.tool || "unknown"));
        child.kill();
        return;
      }
      if (event.type === "permission" || event.type === "permission.asked") {
        alienTools.push(String(event.permission?.permission || event.permission?.tool || "permission request"));
        child.kill();
        return;
      }
      if (event.type === "text") {
        const text = event.part?.text ?? event.text ?? "";
        if (typeof text === "string" && text.length > sentText.length) {
          await onText(text.slice(sentText.length));
          sentText = text;
        }
      }
    };
    while (true) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const read = await Promise.race([
        stdout.read(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            child.kill();
            reject(new Error("OpenFREE timed out waiting for the OpenCode CLI"));
          }, READ_TIMEOUT_MS);
          timeout.unref?.();
        }),
      ]).finally(() => clearTimeout(timeout));
      if (read.done) break;
      buffer += decoder.decode(read.value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        await processLine(line);
        if (alienTools.length) break;
      }
      if (alienTools.length) break;
    }
    if (buffer.trim() && !alienTools.length) await processLine(buffer);
    const exitCode = await child.exited;
    await stderrTask;
    if (aborted || signal?.aborted) throw signal?.reason ?? new DOMException("The operation was aborted", "AbortError");
    if (alienTools.length) return alienTools;
    if (exitCode !== 0) throw new Error(`OpenCode CLI exited with code ${exitCode}${stderrTail ? `: ${stderrTail.trim().slice(-500)}` : ""}`);
    return alienTools;
  } catch (error) {
    if (child.exitCode === null) child.kill();
    await child.exited.catch(() => {});
    await stderrTask.catch(() => {});
    if (aborted || signal?.aborted) throw signal?.reason ?? new DOMException("The operation was aborted", "AbortError");
    throw error;
  } finally {
    signal?.removeEventListener("abort", abortChild);
    stdout.releaseLock();
    stderr.releaseLock();
    rmSync(workDir, { recursive: true, force: true });
  }
}

async function collect(
  model: string,
  prompt: string,
  signal?: AbortSignal,
  streamText?: (value: string) => Promise<void> | void,
): Promise<{ content: string; toolCalls: ToolCall[] }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const splitter = new ToolFenceSplitter();
    const content: string[] = [];
    const toolParts: string[] = [];
    let streamedText = false;
    const onCliText = async (value: string) => {
      for (const [kind, part] of splitter.feed(value)) {
        if (kind === "text") {
          content.push(part);
          if (streamText) {
            streamedText = true;
            await streamText(part);
          }
        } else toolParts.push(part);
      }
    };
    let alienTools: string[];
    try {
      alienTools = await runOpenCode(model, prompt, signal, onCliText);
    } catch (error) {
      if (attempt < 2 && !streamedText && error instanceof Error && TRANSIENT_ERROR.test(error.message)) continue;
      throw error;
    }
    for (const [kind, part] of splitter.flush()) {
      if (kind === "text") {
        content.push(part);
        if (streamText) {
          streamedText = true;
          await streamText(part);
        }
      } else toolParts.push(part);
    }
    const toolCalls = parseToolBlock(toolParts.join(""));
    if (toolCalls.length || !alienTools.length || attempt === 2) {
      return { content: content.join(""), toolCalls };
    }
    prompt += `\n\n[system] Your last attempt tried to use a built-in tool (${[...new Set(alienTools)].sort().join(", ")}). That tool does not exist here and its output is discarded. Use the tool protocol above with one of the listed tools, or answer in plain text.`;
  }
  return { content: "", toolCalls: [] };
}

function jsonResponse(model: string, content: string, toolCalls: ToolCall[]): Response {
  const id = `chatcmpl-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  return Response.json({
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: "assistant", content: content || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
      finish_reason: toolCalls.length ? "tool_calls" : "stop",
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
}

function sseChunk(id: string, model: string, created: number, delta: Record<string, unknown>, finishReason: string | null = null) {
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
}

function streamResponse(model: string, prompt: string, signal?: AbortSignal): Response {
  const id = `chatcmpl-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);
  const abortController = new AbortController();
  const abort = () => abortController.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const encoder = new TextEncoder();
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: string) => { if (!cancelled) controller.enqueue(encoder.encode(value)); };
      try {
        send(sseChunk(id, model, created, { role: "assistant", content: "" }));
        const result = await collect(model, prompt, abortController.signal, (value) => send(sseChunk(id, model, created, { content: value })));
        result.toolCalls.forEach((call, index) => {
          send(sseChunk(id, model, created, { tool_calls: [{ index, id: call.id, type: "function", function: { name: call.function.name, arguments: "" } }] }));
          send(sseChunk(id, model, created, { tool_calls: [{ index, function: { arguments: call.function.arguments } }] }));
        });
        send(sseChunk(id, model, created, {}, result.toolCalls.length ? "tool_calls" : "stop"));
        send("data: [DONE]\n\n");
        if (!cancelled) controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "OpenFREE request failed";
        send(`data: ${JSON.stringify({ error: { message } })}\n\n`);
        send("data: [DONE]\n\n");
        if (!cancelled) controller.close();
      } finally {
        signal?.removeEventListener("abort", abort);
      }
    },
    cancel() {
      // The stream has already been canceled by its consumer; stop the CLI without enqueueing more data.
      cancelled = true;
      abortController.abort(new DOMException("The operation was aborted", "AbortError"));
      signal?.removeEventListener("abort", abort);
    },
  }), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
  return response;
}

export async function openfreeResponses(body: any, requestedModel: string, signal?: AbortSignal): Promise<Response> {
  const model = await resolveModel(requestedModel);
  const prompt = buildPrompt(body);
  if (body.stream === true) return streamResponse(model, prompt, signal);
  const result = await collect(model, prompt, signal);
  return jsonResponse(model, result.content, result.toolCalls);
}
