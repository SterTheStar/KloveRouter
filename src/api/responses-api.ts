function responseContentPart(part: any): any[] {
  if (typeof part === "string") return [{ type: "text", text: part }];
  if (!part || typeof part !== "object") return [];
  if (part.type === "input_text" || part.type === "text")
    return [{ type: "text", text: part.text ?? "" }];
  if (part.type === "input_image" || part.type === "image_url")
    return [{
      type: "image_url",
      image_url: {
        url: part.image_url ?? part.url,
        ...(part.detail ? { detail: part.detail } : {}),
      },
    }];
  return [part];
}

export function responsesInputToMessages(input: any, instructions?: string) {
  const messages: any[] = [];
  if (instructions) messages.push({ role: "system", content: instructions });
  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
    return messages;
  }
  for (const item of Array.isArray(input) ? input : []) {
    if (!item || typeof item !== "object") continue;
    if (["user", "assistant", "system", "developer"].includes(item.role)) {
      const content = Array.isArray(item.content)
        ? item.content.flatMap(responseContentPart)
        : item.content ?? "";
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
          function: { name: item.name, arguments: item.arguments ?? "{}" },
        }],
      });
      continue;
    }
    if (item.type === "function_call_output")
      messages.push({
        role: "tool",
        tool_call_id: item.call_id,
        content: typeof item.output === "string" ? item.output : JSON.stringify(item.output),
      });
  }
  return messages;
}

export function responsesToChatBody(body: any) {
  const tools = Array.isArray(body.tools)
    ? body.tools.map((tool: any) => tool?.type === "function" && !tool.function
      ? {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters ?? {},
            strict: tool.strict,
          },
        }
      : tool)
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
    ...(body.text?.format ? {
      response_format: body.text.format.type === "json_schema"
        ? {
            type: "json_schema",
            json_schema: {
              name: body.text.format.name,
              description: body.text.format.description,
              schema: body.text.format.schema,
              strict: body.text.format.strict,
            },
          }
        : { type: body.text.format.type },
    } : {}),
  };
}

function responseId(id?: string) {
  return id?.startsWith("resp_") ? id : `resp_${id?.replace(/^chatcmpl-/, "") ?? crypto.randomUUID()}`;
}

export function chatCompletionToResponse(completion: any) {
  const choice = completion?.choices?.[0] ?? {};
  const message = choice.message ?? {};
  const id = responseId(completion?.id);
  const output: any[] = [];
  if (message.reasoning_content)
    output.push({
      id: `rs_${crypto.randomUUID().replace(/-/g, "")}`,
      type: "reasoning",
      summary: [{ type: "summary_text", text: message.reasoning_content }],
    });
  if (message.content !== undefined && message.content !== null)
    output.push({
      id: `msg_${crypto.randomUUID().replace(/-/g, "")}`,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: String(message.content), annotations: [] }],
    });
  for (const call of message.tool_calls ?? [])
    output.push({
      id: call.id,
      type: "function_call",
      status: "completed",
      call_id: call.id,
      name: call.function?.name,
      arguments: call.function?.arguments ?? "{}",
    });
  const usage = completion?.usage;
  return {
    id,
    object: "response",
    created_at: completion?.created ?? Math.floor(Date.now() / 1000),
    status: "completed",
    error: null,
    incomplete_details: null,
    instructions: null,
    model: completion?.model,
    output,
    parallel_tool_calls: true,
    tool_choice: "auto",
    tools: [],
    usage: usage ? {
      input_tokens: usage.prompt_tokens ?? usage.input_tokens ?? 0,
      input_tokens_details: usage.prompt_tokens_details ?? usage.input_tokens_details ?? { cached_tokens: 0 },
      output_tokens: usage.completion_tokens ?? usage.output_tokens ?? 0,
      output_tokens_details: usage.completion_tokens_details ?? usage.output_tokens_details ?? { reasoning_tokens: 0 },
      total_tokens: usage.total_tokens ?? 0,
    } : null,
  };
}

export function chatSseToResponses(response: Response, model: string) {
  const reader = response.body?.getReader();
  if (!reader) return response;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const responseObject: any = {
    id: responseId(), object: "response", created_at: Math.floor(Date.now() / 1000),
    status: "in_progress", model, output: [], error: null,
  };
  const messageId = `msg_${crypto.randomUUID().replace(/-/g, "")}`;
  let sequence = 0;
  let buffer = "";
  let text = "";
  let reasoning = "";
  const reasoningId = `rs_${crypto.randomUUID().replace(/-/g, "")}`;
  let reasoningAdded = false;
  let usage: any = null;
  let streamError: any = null;
  const toolCalls = new Map<number, { id: string; name: string; arguments: string; added: boolean }>();
  const event = (type: string, payload: any = {}) =>
    encoder.encode(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...payload })}\n\n`);
  return new Response(new ReadableStream({
    async start(controller) {
      controller.enqueue(event("response.created", { response: responseObject }));
      controller.enqueue(event("response.in_progress", { response: responseObject }));
      const item = { id: messageId, type: "message", status: "in_progress", role: "assistant", content: [] };
      controller.enqueue(event("response.output_item.added", { output_index: 0, item }));
      controller.enqueue(event("response.content_part.added", {
        item_id: messageId, output_index: 0, content_index: 0,
        part: { type: "output_text", text: "", annotations: [] },
      }));
      try {
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() ?? "";
          for (const rawEvent of events) {
            const raw = rawEvent.split(/\r?\n/).filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart()).join("\n").trim();
            if (!raw || raw === "[DONE]") continue;
            const chunk = JSON.parse(raw);
            if (chunk.error) {
              streamError = chunk.error;
              controller.enqueue(event("error", { error: chunk.error }));
              continue;
            }
            usage = chunk.usage ?? usage;
            const delta = chunk.choices?.[0]?.delta;
            const reasoningDelta = delta?.reasoning_content ?? delta?.reasoning;
            if (typeof reasoningDelta === "string" && reasoningDelta) {
              if (!reasoningAdded) {
                reasoningAdded = true;
                controller.enqueue(event("response.output_item.added", {
                  output_index: 1,
                  item: { id: reasoningId, type: "reasoning", status: "in_progress", summary: [] },
                }));
                controller.enqueue(event("response.reasoning_summary_part.added", {
                  item_id: reasoningId, output_index: 1, summary_index: 0,
                  part: { type: "summary_text", text: "" },
                }));
              }
              reasoning += reasoningDelta;
              controller.enqueue(event("response.reasoning_summary_text.delta", {
                item_id: reasoningId, output_index: 1, summary_index: 0, delta: reasoningDelta,
              }));
            }
            if (typeof delta?.content === "string" && delta.content) {
              text += delta.content;
              controller.enqueue(event("response.output_text.delta", {
                item_id: messageId, output_index: 0, content_index: 0, delta: delta.content,
              }));
            }
            for (const callDelta of delta?.tool_calls ?? []) {
              const index = Number(callDelta.index ?? 0);
              const call = toolCalls.get(index) ?? {
                id: callDelta.id ?? `call_${crypto.randomUUID().replace(/-/g, "")}`,
                name: callDelta.function?.name ?? "",
                arguments: "",
                added: false,
              };
              if (callDelta.id) call.id = callDelta.id;
              if (callDelta.function?.name) call.name += callDelta.function.name;
              const args = callDelta.function?.arguments ?? "";
              call.arguments += args;
              if (!call.added) {
                call.added = true;
                controller.enqueue(event("response.output_item.added", {
                  output_index: index + 2,
                  item: { id: call.id, type: "function_call", status: "in_progress", call_id: call.id, name: call.name, arguments: "" },
                }));
              }
              if (args)
                controller.enqueue(event("response.function_call_arguments.delta", {
                  item_id: call.id, output_index: index + 2, delta: args,
                }));
              toolCalls.set(index, call);
            }
          }
          if (done) break;
        }
        if (streamError) {
          controller.enqueue(event("response.failed", {
            response: { ...responseObject, status: "failed", error: streamError },
          }));
          return;
        }
        controller.enqueue(event("response.output_text.done", {
          item_id: messageId, output_index: 0, content_index: 0, text,
        }));
        const part = { type: "output_text", text, annotations: [] };
        controller.enqueue(event("response.content_part.done", {
          item_id: messageId, output_index: 0, content_index: 0, part,
        }));
        const doneItem = { ...item, status: "completed", content: [part] };
        controller.enqueue(event("response.output_item.done", { output_index: 0, item: doneItem }));
        if (reasoningAdded) {
          const summary = { type: "summary_text", text: reasoning };
          controller.enqueue(event("response.reasoning_summary_text.done", {
            item_id: reasoningId, output_index: 1, summary_index: 0, text: reasoning,
          }));
          controller.enqueue(event("response.reasoning_summary_part.done", {
            item_id: reasoningId, output_index: 1, summary_index: 0, part: summary,
          }));
          controller.enqueue(event("response.output_item.done", {
            output_index: 1,
            item: { id: reasoningId, type: "reasoning", status: "completed", summary: [summary] },
          }));
        }
        for (const [index, call] of toolCalls) {
          controller.enqueue(event("response.function_call_arguments.done", {
            item_id: call.id, output_index: index + 2, arguments: call.arguments,
          }));
          controller.enqueue(event("response.output_item.done", {
            output_index: index + 2,
            item: { id: call.id, type: "function_call", status: "completed", call_id: call.id, name: call.name, arguments: call.arguments },
          }));
        }
        const completed = chatCompletionToResponse({
          id: responseObject.id,
          model,
          choices: [{ message: {
            content: text,
            reasoning_content: reasoning || undefined,
            tool_calls: [...toolCalls.values()].map((call) => ({
              id: call.id, type: "function", function: { name: call.name, arguments: call.arguments },
            })),
          } }],
          usage,
        });
        controller.enqueue(event("response.completed", { response: completed }));
      } catch (error: any) {
        controller.enqueue(event("error", { error: { message: error.message, type: "server_error" } }));
        controller.enqueue(event("response.failed", {
          response: {
            ...responseObject,
            status: "failed",
            error: { message: error.message, type: "server_error" },
          },
        }));
      } finally {
        controller.close();
      }
    },
  }), { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" } });
}
