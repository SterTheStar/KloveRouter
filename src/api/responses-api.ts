import { normalizeToolDefinitions, normalizeToolName } from "./tool-names";

function idPart(value: unknown, fallback: string) {
  return String(value ?? fallback).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function stableId(prefix: string, value: unknown, fallback: string) {
  return `${prefix}_${idPart(value, fallback)}`;
}

function imageUrl(value: any): any {
  if (typeof value === "string") return { url: value };
  if (value && typeof value === "object") {
    const url = value.url ?? value.image_url;
    return { ...(url !== undefined ? { url } : {}), ...(value.detail ? { detail: value.detail } : {}) };
  }
  return { url: value };
}

function responseContentPart(part: any): any[] {
  if (typeof part === "string") return [{ type: "text", text: part }];
  if (!part || typeof part !== "object") return [];
  if (part.type === "input_text" || part.type === "output_text" || part.type === "text") {
    return [{ type: "text", text: part.text ?? "" }];
  }
  if (part.type === "input_image" || part.type === "image_url") {
    return [{ type: "image_url", image_url: imageUrl(part.image_url ?? part.url) }];
  }
  return [part];
}

function asToolOutput(output: any) {
  return typeof output === "string" ? output : JSON.stringify(output ?? null);
}

export function responsesInputToMessages(input: any, instructions?: string) {
  const messages: any[] = [];
  let hasInstruction = false;
  const items = typeof input === "string" ? [{ role: "user", content: input }] : (Array.isArray(input) ? input : []);
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (["user", "assistant", "system", "developer"].includes(item.role)) {
      const content = Array.isArray(item.content)
        ? item.content.flatMap(responseContentPart)
        : item.content ?? "";
      if (item.role === "system" && instructions !== undefined && content === instructions) hasInstruction = true;
      messages.push({ role: item.role, content });
      continue;
    }
    if (item.type === "function_call") {
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [{
          id: item.call_id ?? item.id,
          type: "function",
          function: { name: item.name ?? "", arguments: item.arguments ?? "{}" },
        }],
      });
      continue;
    }
    if (item.type === "function_call_output") {
      messages.push({ role: "tool", tool_call_id: item.call_id ?? item.id, content: asToolOutput(item.output) });
    }
  }
  if (instructions !== undefined && instructions !== "" && !hasInstruction) {
    messages.unshift({ role: "system", content: instructions });
  }
  return messages;
}

function chatTool(tool: any) {
  if (tool?.type === "function" && !tool.function) {
    return { type: "function", function: {
      name: normalizeToolName("", tool.name),
      ...(tool.description !== undefined ? { description: tool.description } : {}),
      parameters: tool.parameters ?? {},
      ...(tool.strict !== undefined ? { strict: tool.strict } : {}),
    } };
  }
  if (tool?.function?.name) {
    return { ...tool, function: { ...tool.function, name: normalizeToolName("", tool.function.name) } };
  }
  return tool;
}

function responseFormat(format: any) {
  if (!format) return undefined;
  if (format.type !== "json_schema") return { type: format.type };
  const schema = format.json_schema ?? format;
  return { type: "json_schema", json_schema: {
    name: schema.name,
    ...(schema.description !== undefined ? { description: schema.description } : {}),
    schema: schema.schema,
    ...(schema.strict !== undefined ? { strict: schema.strict } : {}),
  } };
}

export function responsesToChatBody(body: any): any {
  const format = responseFormat(body.text?.format ?? body.response_format);
  const tools = Array.isArray(body.tools)
    ? normalizeToolDefinitions(body.tools)?.map(chatTool)
    : undefined;
  return {
    model: body.model,
    messages: responsesInputToMessages(body.input, body.instructions),
    stream: body.stream ?? false,
    ...(body.max_output_tokens !== undefined ? { max_output_tokens: body.max_output_tokens } : {}),
    ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
    ...(body.top_p !== undefined ? { top_p: body.top_p } : {}),
    ...(body.reasoning !== undefined ? { reasoning: body.reasoning } : {}),
    ...(body.reasoning_effort !== undefined ? { reasoning_effort: body.reasoning_effort } : {}),
    ...(tools ? { tools } : {}),
    ...(body.tool_choice !== undefined ? { tool_choice: body.tool_choice } : {}),
    ...(body.parallel_tool_calls !== undefined ? { parallel_tool_calls: body.parallel_tool_calls } : {}),
    ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
    ...(body.store !== undefined ? { store: body.store } : {}),
    ...(body.service_tier !== undefined ? { service_tier: body.service_tier } : {}),
    ...(format ? { response_format: format } : {}),
  };
}

function responseId(id?: string) {
  return id?.startsWith("resp_") ? id : `resp_${idPart(id?.replace(/^chatcmpl-/, ""), crypto.randomUUID())}`;
}

function usageObject(usage: any) {
  if (!usage) return null;
  const input = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const output = usage.completion_tokens ?? usage.output_tokens ?? 0;
  return {
    input_tokens: input,
    input_tokens_details: usage.prompt_tokens_details ?? usage.input_tokens_details ?? { cached_tokens: 0 },
    output_tokens: output,
    output_tokens_details: usage.completion_tokens_details ?? usage.output_tokens_details ?? { reasoning_tokens: 0 },
    total_tokens: usage.total_tokens ?? input + output,
  };
}

export function chatCompletionToResponse(completion: any) {
  const choice = completion?.choices?.[0] ?? {};
  const message = choice.message ?? {};
  const id = responseId(completion?.id);
  const output: any[] = [];
  const base = idPart(id.replace(/^resp_/, ""), "response");
  if (message.reasoning_content || message.reasoning) {
    output.push({ id: stableId("rs", `${base}-reasoning`, "reasoning"), type: "reasoning", summary: [{ type: "summary_text", text: message.reasoning_content ?? message.reasoning }] });
  }
  if (message.content !== undefined && message.content !== null && message.content !== "") {
    output.push({ id: stableId("msg", `${base}-message`, "message"), type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text: String(message.content), annotations: [] }] });
  }
  for (const call of message.tool_calls ?? []) {
    const callId = call.id ?? stableId("call", `${base}-${output.length}`, "call");
    output.push({ id: callId, type: "function_call", status: "completed", call_id: call.call_id ?? callId, name: normalizeToolName("", call.function?.name), arguments: call.function?.arguments ?? "{}" });
  }
  const usage = usageObject(completion?.usage);
  return {
    id, object: "response", created_at: completion?.created ?? Math.floor(Date.now() / 1000), status: "completed",
    error: null, incomplete_details: null, instructions: null, model: completion?.model, output,
    parallel_tool_calls: true, tool_choice: "auto", tools: [], usage,
  };
}

function parseSseBlock(block: string): string | null {
  const lines = block.split(/\r?\n/);
  const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).replace(/^ /, "")).join("\n").trim();
  return data || null;
}

export function chatSseToResponses(response: Response, model: string, onCancel?: () => void) {
  const reader = response.body?.getReader();
  if (!reader) return response;
  const encoder = new TextEncoder();
  const responseObject: any = { id: responseId(), object: "response", created_at: Math.floor(Date.now() / 1000), status: "in_progress", model, output: [], error: null };
  let sequence = 0;
  let buffer = "";
  let text = "";
  let reasoning = "";
  let usage: any = null;
  let streamError: any = null;
  let errorSent = false;
  let outputCount = 0;
  const itemByIndex = new Map<number, any>();
  const callByIndex = new Map<number, any>();
  const event = (type: string, payload: any = {}) => encoder.encode(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...payload })}\n\n`);
  const nextIndex = () => outputCount++;
  const addMessage = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (itemByIndex.has(-1)) return itemByIndex.get(-1);
    const item = { id: stableId("msg", responseObject.id, "message"), type: "message", status: "in_progress", role: "assistant", content: [] };
    const index = nextIndex(); itemByIndex.set(-1, { index, item }); responseObject.output.push(item);
    controller.enqueue(event("response.output_item.added", { output_index: index, item }));
    controller.enqueue(event("response.content_part.added", { item_id: item.id, output_index: index, content_index: 0, part: { type: "output_text", text: "", annotations: [] } }));
    return itemByIndex.get(-1);
  };
  return new Response(new ReadableStream({
    async start(controller) {
      controller.enqueue(event("response.created", { response: responseObject }));
      controller.enqueue(event("response.in_progress", { response: responseObject }));
      const process = (chunk: any) => {
        if (chunk.error) {
          streamError = chunk.error;
          if (!errorSent) { errorSent = true; controller.enqueue(event("error", { error: chunk.error })); }
          return;
        }
        usage = chunk.usage ?? usage;
        const delta = chunk.choices?.[0]?.delta;
        const reasoningDelta = delta?.reasoning_content ?? delta?.reasoning;
        if (typeof reasoningDelta === "string" && reasoningDelta) {
          let record = itemByIndex.get(-2);
          if (!record) {
            const item = { id: stableId("rs", responseObject.id, "reasoning"), type: "reasoning", status: "in_progress", summary: [] };
            record = { index: nextIndex(), item }; itemByIndex.set(-2, record); responseObject.output.push(item);
            controller.enqueue(event("response.output_item.added", { output_index: record.index, item }));
            controller.enqueue(event("response.reasoning_summary_part.added", { item_id: item.id, output_index: record.index, summary_index: 0, part: { type: "summary_text", text: "" } }));
          }
          reasoning += reasoningDelta;
          controller.enqueue(event("response.reasoning_summary_text.delta", { item_id: record.item.id, output_index: record.index, summary_index: 0, delta: reasoningDelta }));
        }
        if (typeof delta?.content === "string" && delta.content) {
          const record = addMessage(controller); text += delta.content;
          controller.enqueue(event("response.output_text.delta", { item_id: record.item.id, output_index: record.index, content_index: 0, delta: delta.content }));
        }
        for (const callDelta of delta?.tool_calls ?? []) {
          const sourceIndex = Number(callDelta.index ?? 0);
          let call = callByIndex.get(sourceIndex);
          if (!call) {
            const callId = callDelta.id ?? stableId("call", `${responseObject.id}-${sourceIndex}`, "call");
            const item = { id: callId, type: "function_call", status: "in_progress", call_id: callId, name: "", arguments: "" };
            call = { index: nextIndex(), item }; callByIndex.set(sourceIndex, call); responseObject.output.push(item);
            controller.enqueue(event("response.output_item.added", { output_index: call.index, item }));
          }
          if (callDelta.id) call.item.id = call.item.call_id = callDelta.id;
          if (callDelta.function?.name)
            call.item.name = normalizeToolName(call.item.name, callDelta.function.name);
          const args = callDelta.function?.arguments ?? ""; call.item.arguments += args;
          if (args) controller.enqueue(event("response.function_call_arguments.delta", { item_id: call.item.id, output_index: call.index, delta: args }));
        }
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          buffer += new TextDecoder().decode(value ?? new Uint8Array(), { stream: !done });
          let match: RegExpMatchArray | null;
          while ((match = buffer.match(/\r?\n\r?\n/))) {
            const block = buffer.slice(0, match.index); buffer = buffer.slice((match.index ?? 0) + match[0].length);
            const raw = parseSseBlock(block); if (!raw || raw === "[DONE]") continue;
            process(JSON.parse(raw));
          }
          if (done) {
            const raw = parseSseBlock(buffer); buffer = "";
            if (raw && raw !== "[DONE]") process(JSON.parse(raw));
            break;
          }
        }
        if (streamError) {
          responseObject.status = "failed"; responseObject.error = streamError;
          controller.enqueue(event("response.failed", { response: responseObject })); return;
        }
        for (const record of itemByIndex.values()) {
          const { item, index } = record;
          if (item.type === "message") {
            const part = { type: "output_text", text, annotations: [] }; item.content = [part]; item.status = "completed";
            controller.enqueue(event("response.output_text.done", { item_id: item.id, output_index: index, content_index: 0, text }));
            controller.enqueue(event("response.content_part.done", { item_id: item.id, output_index: index, content_index: 0, part }));
          } else if (item.type === "reasoning") {
            const part = { type: "summary_text", text: reasoning }; item.summary = [part]; item.status = "completed";
            controller.enqueue(event("response.reasoning_summary_text.done", { item_id: item.id, output_index: index, summary_index: 0, text: reasoning }));
            controller.enqueue(event("response.reasoning_summary_part.done", { item_id: item.id, output_index: index, summary_index: 0, part }));
          } else if (item.type === "function_call") {
            item.status = "completed";
          }
          if (item.type !== "function_call") controller.enqueue(event("response.output_item.done", { output_index: index, item }));
        }
        for (const { index, item } of callByIndex.values()) {
          item.status = "completed";
          controller.enqueue(event("response.function_call_arguments.done", { item_id: item.id, output_index: index, arguments: item.arguments }));
          controller.enqueue(event("response.output_item.done", { output_index: index, item }));
        }
        const completed = chatCompletionToResponse({ id: responseObject.id, model, choices: [{ message: { content: text || undefined, reasoning_content: reasoning || undefined, tool_calls: [...callByIndex.values()].map(({ item }) => ({ id: item.id, function: { name: item.name, arguments: item.arguments } })) } }], usage });
        responseObject.output = completed.output; responseObject.status = "completed"; responseObject.usage = completed.usage;
        controller.enqueue(event("response.completed", { response: { ...completed, output: responseObject.output, usage: responseObject.usage } }));
      } catch (error: any) {
        const failure = { message: error?.message ?? String(error), type: "server_error" };
        if (!errorSent) { errorSent = true; controller.enqueue(event("error", { error: failure })); }
        responseObject.status = "failed"; responseObject.error = failure;
        controller.enqueue(event("response.failed", { response: responseObject }));
      } finally { controller.close(); }
    },
    cancel() { onCancel?.(); reader.cancel().catch(() => {}); },
  }), { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" } });
}
