import { normalizeToolDefinitions, normalizeToolName } from "../api/tool-names";

/** Wire protocols supported by the protocol conversion SDK. */
export type Protocol = "chat_completions" | "responses" | "anthropic";

type AnyRecord = Record<string, any>;

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as AnyRecord
    : {};
}

function dataOfSseEvent(event: string): { event: string; data: string } {
  let eventName = "message";
  const data: string[] = [];
  for (const line of event.split(/\r\n|\n|\r/)) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  return { event: eventName, data: data.join("\n") };
}

function responseContentPart(part: any): any[] {
  if (typeof part === "string") return [{ type: "text", text: part }];
  if (!part || typeof part !== "object") return [];
  if (["input_text", "output_text", "text"].includes(part.type))
    return [{ type: "text", text: part.text ?? "" }];
  if (part.type === "input_image" || part.type === "image_url") {
    const image = part.image_url ?? part.url;
    const url = typeof image === "string" ? image : image?.url;
    return [{ type: "image_url", image_url: { url, ...(image?.detail ? { detail: image.detail } : {}) } }];
  }
  if (part.type === "refusal") return [{ type: "refusal", refusal: part.refusal ?? part.text ?? "" }];
  throw new Error(`Content part type "${part.type}" is not supported by the Chat Completions adapter`);
}

function anthropicContentPart(part: any): any[] {
  if (typeof part === "string") return [{ type: "text", text: part }];
  if (!part || typeof part !== "object") return [];
  if (part.type === "text") return [{ type: "text", text: part.text ?? "" }];
  if (part.type === "image") {
    const source = part.source ?? {};
    if (source.type === "base64") return [{ type: "image_url", image_url: { url: `data:${source.media_type};base64,${source.data}` } }];
    if (source.type === "url") return [{ type: "image_url", image_url: { url: source.url } }];
  }
  if (part.type === "tool_use") return [{
    type: "__tool_use",
    id: part.id,
    name: part.name,
    input: part.input ?? {},
  }];
  if (part.type === "tool_result") return [{
    type: "__tool_result",
    tool_call_id: part.tool_use_id,
    content: Array.isArray(part.content)
      ? part.content.flatMap(anthropicContentPart)
      : part.content ?? "",
    is_error: Boolean(part.is_error),
  }];
  if (part.type === "thinking" || part.type === "redacted_thinking")
    return [{ type: "__reasoning", text: part.thinking ?? "", data: part.data }];
  if (part.type === "image_url" || part.type === "input_image") return responseContentPart(part);
  throw new Error(`Anthropic content block type "${part.type}" cannot be converted to Chat Completions`);
}

function anthropicToolChoice(choice: any) {
  if (!choice) return undefined;
  if (choice.type === "auto") return { type: "auto", ...(choice.disable_parallel_tool_use !== undefined ? { disable_parallel_tool_use: choice.disable_parallel_tool_use } : {}) };
  if (choice.type === "any") return { type: "required", ...(choice.disable_parallel_tool_use !== undefined ? { disable_parallel_tool_use: choice.disable_parallel_tool_use } : {}) };
  if (choice.type === "tool") return { type: "function", function: { name: choice.name }, ...(choice.disable_parallel_tool_use !== undefined ? { disable_parallel_tool_use: choice.disable_parallel_tool_use } : {}) };
  return undefined;
}

function anthropicToolChoiceToChat(choice: any) {
  if (!choice) return undefined;
  const parallel = choice.disable_parallel_tool_use !== undefined
    ? { disable_parallel_tool_calls: choice.disable_parallel_tool_use }
    : {};
  if (choice.type === "auto") return { type: "auto", ...parallel };
  if (choice.type === "any") return { type: "required", ...parallel };
  if (choice.type === "tool") return { type: "function", function: { name: choice.name }, ...parallel };
  return undefined;
}

function anthropicUser(metadata: any) {
  if (metadata == null) return undefined;
  if (typeof metadata !== "object" || Array.isArray(metadata))
    throw new Error("Anthropic metadata must be an object");
  const keys = Object.keys(metadata);
  if (keys.some((key) => key !== "user_id"))
    throw new Error("Anthropic metadata only supports user_id when converting to Chat Completions");
  return metadata.user_id;
}

function chatToolChoiceToAnthropic(choice: any) {
  if (choice === "none") throw new Error("Anthropic Messages has no tool_choice=none equivalent; omit tools to disable them");
  if (choice === "auto") return { type: "auto" };
  if (choice === "required") return { type: "any" };
  if (choice?.type === "function" && choice.function?.name) return { type: "tool", name: choice.function.name };
  if (choice?.type === "auto") return { type: "auto" };
  if (choice?.type === "required") return { type: "any" };
  if (choice?.type === "function" && choice.function?.name) return { type: "tool", name: choice.function.name };
  return undefined;
}

function responseToolChoice(choice: any) {
  if (choice === "required") return "required";
  if (choice === "none" || choice === "auto") return choice;
  if (choice?.type === "function") return { type: "function", function: { name: choice.name ?? choice.function?.name } };
  if (choice?.type === "tool") return { type: "function", function: { name: choice.name } };
  return choice;
}

function chatToolChoiceToResponses(choice: any) {
  if (choice?.type === "function") return { type: "function", name: choice.function?.name };
  return choice;
}

function responseToolsToChat(tools: any[]) {
  if (tools.some((tool: any) => tool?.type && tool.type !== "function")) {
    const unsupported = tools.find((tool: any) => tool?.type && tool.type !== "function");
    throw new Error(`Responses tool type "${unsupported.type}" cannot be converted to provider function tools`);
  }
  return normalizeToolDefinitions(tools)?.map((tool: any) => {
    if (tool?.type && tool.type !== "function")
      throw new Error(`Responses tool type "${tool.type}" cannot be converted to provider function tools`);
    if (tool?.type === "function" && !tool.function) {
      return { type: "function", function: {
        name: tool.name,
        ...(tool.description !== undefined ? { description: tool.description } : {}),
        parameters: tool.parameters ?? {},
        ...(tool.strict !== undefined ? { strict: tool.strict } : {}),
      } };
    }
    return tool;
  });
}

function inputToMessages(input: any, instructions?: string): any[] {
  const messages: any[] = [];
  let foundInstructions = false;
  const items = typeof input === "string" ? [{ role: "user", content: input }] : Array.isArray(input) ? input : [];
  for (const raw of items) {
    const item = asRecord(raw);
    if (item.type === "function_call") {
      messages.push({ role: "assistant", content: null, tool_calls: [{
        id: item.call_id ?? item.id,
        type: "function",
        function: { name: normalizeToolName("", item.name), arguments: item.arguments ?? "{}" },
      }] });
      continue;
    }
    if (item.type === "function_call_output") {
      const content = typeof item.output === "string" ? item.output : JSON.stringify(item.output ?? null);
      messages.push({ role: "tool", tool_call_id: item.call_id ?? item.id, content });
      continue;
    }
    if (item.type === "reasoning") {
      const text = (item.summary ?? []).map((part: any) => part.text ?? "").join("");
      if (text) messages.push({ role: "assistant", content: null, reasoning_content: text });
      continue;
    }
    if (["user", "assistant", "system", "developer"].includes(item.role)) {
      const content = Array.isArray(item.content) ? item.content.flatMap(responseContentPart) : item.content ?? "";
      if (item.role === "system" && instructions !== undefined && content === instructions) foundInstructions = true;
      messages.push({ role: item.role, content });
    } else if (["input_text", "input_image", "image_url"].includes(item.type)) {
      messages.push({ role: "user", content: [item].flatMap(responseContentPart) });
    } else if (item.type) {
      throw new Error(`Responses input item type "${item.type}" cannot be converted to Chat Completions`);
    }
  }
  if (instructions && !foundInstructions) messages.unshift({ role: "system", content: instructions });
  return messages;
}

function anthropicInputToMessages(body: AnyRecord): any[] {
  const messages: any[] = [];
  if (body.system !== undefined) {
    const system = Array.isArray(body.system)
      ? body.system.flatMap(anthropicContentPart).map((part: any) => {
          if (part.type !== "text") throw new Error(`Anthropic system block type "${part.type}" cannot be converted to Chat Completions`);
          return part.text;
        }).join("\n")
      : String(body.system);
    messages.push({ role: "system", content: system });
  }
  for (const raw of Array.isArray(body.messages) ? body.messages : []) {
    const message = asRecord(raw);
    const blocks = (Array.isArray(message.content) ? message.content : [message.content]).flatMap(anthropicContentPart);
    const normal: any[] = [];
    const calls: any[] = [];
    const thoughts: string[] = [];
    const results: any[] = [];
    for (const block of blocks) {
      if (block.type === "__tool_use") calls.push({ id: block.id, type: "function", function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) } });
      else if (block.type === "__tool_result") results.push({ role: "tool", tool_call_id: block.tool_call_id, content: block.content, ...(block.is_error ? { is_error: true } : {}) });
      else if (block.type === "__reasoning") thoughts.push(block.text ?? "");
      else normal.push(block);
    }
    if (message.role === "assistant") {
      messages.push({ role: "assistant", content: normal.length ? normal : null, ...(thoughts.length ? { reasoning_content: thoughts.join("") } : {}), ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      if (normal.length) messages.push({ role: "user", content: normal });
      messages.push(...results);
      continue;
    }
    messages.push(...results);
  }
  return messages;
}

/** Convert any supported request body into the SDK's canonical Chat Completions request. */
export function requestToChat(from: Protocol, body: unknown): AnyRecord {
  const source = asRecord(body);
  if (from === "chat_completions") {
    if (source.prompt !== undefined) throw new Error("Legacy Completions prompt input is not supported by the Chat Completions adapter");
    return { ...source, messages: Array.isArray(source.messages) ? source.messages : [] };
  }
  if (from === "responses") {
    const statefulField = ["previous_response_id", "conversation", "prompt", "background"].find((field) => source[field] !== undefined && source[field] !== false);
    if (statefulField)
      throw new Error(`${statefulField} is not supported by the stateless Responses adapter; send a self-contained input request`);
    const unsupportedResponseField = ["include", "truncation", "prompt_cache_retention"].find((field) => source[field] !== undefined);
    if (unsupportedResponseField)
      throw new Error(`Responses ${unsupportedResponseField} cannot be represented by the Chat Completions adapter`);
    const inputItems = typeof source.input === "string" ? [] : Array.isArray(source.input) ? source.input : [];
    if (inputItems.some((item: any) => item?.type === "message" && ["system", "developer"].includes(item.role)))
      throw new Error("Responses input system/developer messages cannot preserve position when converted to Chat Completions; use the instructions field");
    const format = source.text?.format ?? source.response_format;
    const responseFormat = format?.type === "json_schema"
      ? { type: "json_schema", json_schema: { name: format.json_schema?.name ?? format.name, description: format.json_schema?.description ?? format.description, schema: format.json_schema?.schema ?? format.schema, strict: format.json_schema?.strict ?? format.strict } }
      : format?.type ? { type: format.type } : undefined;
    return {
      model: source.model,
      messages: inputToMessages(source.input, source.instructions),
      stream: source.stream ?? false,
      ...(source.max_output_tokens !== undefined ? { max_output_tokens: source.max_output_tokens } : {}),
      ...(source.temperature !== undefined ? { temperature: source.temperature } : {}),
      ...(source.top_p !== undefined ? { top_p: source.top_p } : {}),
      ...(source.reasoning?.effort !== undefined ? { reasoning_effort: source.reasoning.effort } : {}),
      ...(source.reasoning !== undefined ? { reasoning: source.reasoning } : {}),
      ...(source.tools !== undefined ? { tools: responseToolsToChat(source.tools) } : {}),
      ...(source.tool_choice !== undefined ? { tool_choice: responseToolChoice(source.tool_choice) } : {}),
      ...(source.parallel_tool_calls !== undefined ? { parallel_tool_calls: source.parallel_tool_calls } : {}),
      ...(source.max_tool_calls !== undefined ? { max_tool_calls: source.max_tool_calls } : {}),
      ...(source.reasoning_effort !== undefined ? { reasoning_effort: source.reasoning_effort } : {}),
      ...(source.effort !== undefined ? { effort: source.effort } : {}),
      ...(source.metadata !== undefined ? { metadata: source.metadata } : {}),
      ...(source.service_tier !== undefined ? { service_tier: source.service_tier } : {}),
      ...(source.store !== undefined ? { store: source.store } : {}),
      ...(source.user !== undefined ? { user: source.user } : {}),
      ...(source.prompt_cache_key !== undefined ? { prompt_cache_key: source.prompt_cache_key } : {}),
      ...(source.safety_identifier !== undefined ? { safety_identifier: source.safety_identifier } : {}),
      ...(responseFormat ? { response_format: responseFormat } : {}),
    };
  }
  const effort = source.output_config?.effort ?? source.thinking?.effort;
  const structuredFormat = source.output_config?.format;
  if (source.thinking?.type === "enabled" && source.thinking.budget_tokens !== undefined && !effort)
    throw new Error("Anthropic thinking.budget_tokens has no exact cross-protocol equivalent; use output_config.effort for portable reasoning control");
  if (source.thinking?.type === "enabled" && source.thinking.budget_tokens !== undefined && effort)
    throw new Error("Anthropic thinking.budget_tokens and output_config.effort are conflicting reasoning controls");
  const anthropicTools = Array.isArray(source.tools) ? source.tools : [];
  if (anthropicTools.some((tool: any) => tool?.type && !["custom", "function"].includes(tool.type)))
    throw new Error("Anthropic server-side tools cannot be routed through the provider-model proxy");
  if (Array.isArray(source.tools) && source.tools.some((tool: any) => tool?.strict !== undefined))
    throw new Error("Anthropic tool strict mode has no equivalent in the Chat Completions adapter");
  if (source.output_config?.effort && source.thinking?.effort && source.output_config.effort !== source.thinking.effort)
    throw new Error("Anthropic thinking.effort and output_config.effort conflict");
  const unsupportedAnthropicField = ["context_management", "container", "mcp_servers"].find((field) => source[field] !== undefined);
  if (unsupportedAnthropicField)
    throw new Error(`Anthropic ${unsupportedAnthropicField} is not supported by the provider-model adapter`);
  const tools = Array.isArray(source.tools) ? source.tools.map((tool: any) => ({
    type: "function",
    function: { name: tool.name, ...(tool.description ? { description: tool.description } : {}), parameters: tool.input_schema ?? { type: "object", properties: {} } },
  })) : undefined;
  return {
    model: source.model,
    messages: anthropicInputToMessages(source),
    max_tokens: source.max_tokens,
    stream: source.stream ?? false,
    ...(source.temperature !== undefined ? { temperature: source.temperature } : {}),
    ...(source.top_p !== undefined ? { top_p: source.top_p } : {}),
    ...(source.top_k !== undefined ? { top_k: source.top_k } : {}),
    ...(source.stop_sequences ? { stop: source.stop_sequences } : {}),
    ...(source.thinking?.type === "disabled" ? { reasoning_effort: "none" } : {}),
    ...(structuredFormat?.type === "json_schema" ? { response_format: { type: "json_schema", json_schema: { name: structuredFormat.name ?? "response", schema: structuredFormat.schema, strict: true } } } : {}),
    ...(structuredFormat?.type === "json_object" ? { response_format: { type: "json_object" } } : {}),
    ...(tools ? { tools } : {}),
      ...(source.tool_choice ? { tool_choice: anthropicToolChoiceToChat(source.tool_choice) } : {}),
      ...(source.tool_choice?.disable_parallel_tool_use !== undefined ? { parallel_tool_calls: !source.tool_choice.disable_parallel_tool_use } : {}),
    ...(effort ? { reasoning_effort: effort } : {}),
    ...(anthropicUser(source.metadata) !== undefined ? { user: anthropicUser(source.metadata) } : {}),
  };
}

function chatMessagesToResponses(messages: any[]) {
  const input: any[] = [];
  const instructions: string[] = [];
  for (const raw of messages ?? []) {
    const message = asRecord(raw);
    if (message.role === "system" || message.role === "developer") {
      const text = typeof message.content === "string" ? message.content : (message.content ?? []).filter((part: any) => part.type === "text").map((part: any) => part.text ?? "").join("");
      if (text) instructions.push(text);
      continue;
    }
    if (message.role === "tool") {
      input.push({ type: "function_call_output", call_id: message.tool_call_id, output: typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? null) });
      continue;
    }
    if (message.role === "assistant" && message.reasoning_content) input.push({ type: "reasoning", summary: [{ type: "summary_text", text: message.reasoning_content }] });
    if (message.role === "assistant" && message.refusal) input.push({ type: "message", role: "assistant", content: [{ type: "refusal", refusal: message.refusal }] });
    if (message.content != null && message.content !== "") {
      const content = typeof message.content === "string" ? [{ type: message.role === "assistant" ? "output_text" : "input_text", text: message.content }] : message.content.flatMap(responseContentPart).map((part: any) => part.type === "text" ? { type: message.role === "assistant" ? "output_text" : "input_text", text: part.text } : part.type === "image_url" ? { type: "input_image", image_url: part.image_url } : part);
      input.push({ type: "message", role: message.role, content });
    }
    for (const call of message.tool_calls ?? []) input.push({ type: "function_call", call_id: call.id, name: call.function?.name, arguments: call.function?.arguments ?? "{}" });
  }
  return { input, ...(instructions.length ? { instructions: instructions.join("\n\n") } : {}) };
}

/** Convert a canonical Chat Completions request into another protocol's request body. */
export function requestFromChat(to: Protocol, body: unknown): AnyRecord {
  const source = asRecord(body);
  if (to === "chat_completions") return { ...source };
  const unsupportedChatFields: Record<Exclude<Protocol, "chat_completions">, string[]> = {
    responses: ["n", "presence_penalty", "frequency_penalty", "logit_bias", "logprobs", "top_logprobs", "functions", "function_call", "modalities", "audio", "prediction", "web_search_options", "stream_options", "top_k", "prompt_cache_retention"],
    anthropic: ["n", "presence_penalty", "frequency_penalty", "logit_bias", "logprobs", "top_logprobs", "functions", "function_call", "modalities", "audio", "prediction", "web_search_options", "stream_options", "max_tool_calls", "safety_identifier", "prompt_cache_key", "prompt_cache_retention"],
  };
  const unsupported = unsupportedChatFields[to].find((field) => source[field] !== undefined && !(field === "n" && source[field] === 1));
  if (unsupported) throw new Error(`${unsupported} cannot be represented in ${to}; conversion would lose request semantics`);
  if (to === "anthropic" && Array.isArray(source.tools) && source.tools.some((tool: any) => tool?.function?.strict !== undefined))
    throw new Error("Chat Completions strict tool schemas cannot be represented by Anthropic Messages");
  if (to === "responses" && source.reasoning_effort !== undefined && source.reasoning !== undefined)
    throw new Error("Chat Completions reasoning_effort and reasoning conflict; only one can be converted to Responses");
  if (to === "responses") {
    const converted = chatMessagesToResponses(source.messages ?? []);
    return {
      model: source.model,
      ...converted,
      ...(source.max_output_tokens ?? source.max_completion_tokens ?? source.max_tokens) !== undefined ? { max_output_tokens: source.max_output_tokens ?? source.max_completion_tokens ?? source.max_tokens } : {},
      ...(source.temperature !== undefined ? { temperature: source.temperature } : {}),
      ...(source.top_p !== undefined ? { top_p: source.top_p } : {}),
      ...(source.reasoning !== undefined ? { reasoning: source.reasoning } : source.reasoning_effort !== undefined ? { reasoning: { effort: source.reasoning_effort } } : {}),
      ...(source.tools !== undefined ? { tools: source.tools.map((tool: any) => ({ type: "function", name: tool.function?.name, description: tool.function?.description, parameters: tool.function?.parameters, strict: tool.function?.strict })) } : {}),
      ...(source.tool_choice !== undefined ? { tool_choice: chatToolChoiceToResponses(source.tool_choice) } : {}),
      ...(source.parallel_tool_calls !== undefined ? { parallel_tool_calls: source.parallel_tool_calls } : {}),
      ...(source.response_format?.type === "json_schema" ? { text: { format: { type: "json_schema", ...source.response_format.json_schema } } } : source.response_format?.type === "json_object" ? { text: { format: { type: "json_object" } } } : {}),
      ...(source.metadata !== undefined ? { metadata: source.metadata } : {}),
      ...(source.store !== undefined ? { store: source.store } : {}),
      ...(source.service_tier !== undefined ? { service_tier: source.service_tier } : {}),
      ...(source.user !== undefined ? { user: source.user } : {}),
      stream: source.stream ?? false,
    };
  }
  const messages: any[] = [];
  let system: any;
  for (const message of source.messages ?? []) {
    if (message.role === "system" || message.role === "developer") {
      system = [...(Array.isArray(system) ? system : system === undefined ? [] : [{ type: "text", text: system }]), { type: "text", text: typeof message.content === "string" ? message.content : JSON.stringify(message.content) }];
      continue;
    }
    if (message.role === "tool") {
      messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: message.tool_call_id, content: typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? null) }] });
      continue;
    }
    const content: any[] = [];
    if (message.reasoning_content || message.reasoning) throw new Error("Chat Completions reasoning content cannot be converted into Anthropic thinking without a provider-issued signature");
    if (message.refusal) content.push({ type: "text", text: message.refusal });
    if (typeof message.content === "string" && message.content) content.push({ type: "text", text: message.content });
    else if (Array.isArray(message.content)) for (const part of message.content) {
      if (part.type === "text") content.push({ type: "text", text: part.text ?? "" });
      else if (part.type === "image_url") {
        const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
        const match = typeof url === "string" ? url.match(/^data:(image\/[\w.+-]+);base64,(.+)$/i) : null;
        content.push(match ? { type: "image", source: { type: "base64", media_type: match[1], data: match[2] } } : { type: "image", source: { type: "url", url } });
      } else throw new Error(`Chat Completions content part type "${part.type}" cannot be converted to Anthropic Messages`);
    }
    for (const call of message.tool_calls ?? []) {
      let input: any = call.function?.arguments ?? "{}";
      try { if (typeof input === "string") input = JSON.parse(input); } catch { input = {}; }
      content.push({ type: "tool_use", id: call.id, name: call.function?.name, input });
    }
    messages.push({ role: message.role === "assistant" ? "assistant" : "user", content: content.length ? content : [{ type: "text", text: "" }] });
  }
  const choice = source.tool_choice;
  const toolChoice = chatToolChoiceToAnthropic(choice);
  const parallelDisabled = choice?.disable_parallel_tool_calls ?? (source.parallel_tool_calls === false);
  return {
    model: source.model,
    messages,
    ...(system ? { system } : {}),
    max_tokens: source.max_output_tokens ?? source.max_completion_tokens ?? source.max_tokens ?? 1024,
    ...(source.temperature !== undefined ? { temperature: source.temperature } : {}),
    ...(source.top_p !== undefined ? { top_p: source.top_p } : {}),
    ...(source.stop !== undefined ? { stop_sequences: Array.isArray(source.stop) ? source.stop : [source.stop] } : {}),
    ...(source.tools ? { tools: source.tools.map((tool: any) => ({ name: tool.function?.name, description: tool.function?.description, input_schema: tool.function?.parameters ?? { type: "object", properties: {} }, ...(tool.function?.strict !== undefined ? { strict: tool.function.strict } : {}) })) } : {}),
    ...(toolChoice && parallelDisabled === undefined ? { tool_choice: toolChoice } : {}),
    ...(parallelDisabled !== undefined ? { tool_choice: { ...(toolChoice ?? { type: "auto" }), disable_parallel_tool_use: parallelDisabled } } : {}),
    ...(source.reasoning?.effort || source.reasoning_effort ? { output_config: { effort: source.reasoning?.effort ?? source.reasoning_effort } } : {}),
    ...(source.response_format?.type === "json_schema" ? { output_config: { ...(source.reasoning?.effort || source.reasoning_effort ? { effort: source.reasoning?.effort ?? source.reasoning_effort } : {}), format: { type: "json_schema", name: source.response_format.json_schema?.name ?? "response", schema: source.response_format.json_schema?.schema } } } : {}),
    ...(source.response_format?.type === "json_object" ? { output_config: { ...(source.reasoning?.effort || source.reasoning_effort ? { effort: source.reasoning?.effort ?? source.reasoning_effort } : {}), format: { type: "json_object" } } } : {}),
    ...(source.user !== undefined ? { metadata: { ...(source.metadata ?? {}), user_id: source.user } } : source.metadata !== undefined ? { metadata: source.metadata } : {}),
    ...(source.prompt_cache_key !== undefined ? { prompt_cache_key: source.prompt_cache_key } : {}),
    stream: source.stream ?? false,
  };
}

/** Convert a request directly between any two protocols through canonical Chat Completions. */
export function convertRequest(from: Protocol, to: Protocol, body: unknown): AnyRecord {
  return requestFromChat(to, requestToChat(from, body));
}

function usageFromAnthropic(usage: any) {
  const prompt = Number(usage?.input_tokens ?? 0);
  const completion = Number(usage?.output_tokens ?? 0);
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion, prompt_tokens_details: { cached_tokens: Number(usage?.cache_read_input_tokens ?? 0) }, cache_creation_input_tokens: Number(usage?.cache_creation_input_tokens ?? 0) };
}

/** Convert a non-streaming Anthropic message into a canonical Chat Completion. */
export function anthropicResponseToChat(response: AnyRecord) {
  const content = Array.isArray(response.content) ? response.content : [];
  const text = content.filter((part: any) => part.type === "text").map((part: any) => part.text ?? "").join("");
  const reasoning = content.filter((part: any) => part.type === "thinking").map((part: any) => part.thinking ?? "").join("");
  const toolCalls = content.filter((part: any) => part.type === "tool_use").map((part: any, index: number) => ({ index, id: part.id ?? `call_${index}`, type: "function", function: { name: part.name ?? "", arguments: JSON.stringify(part.input ?? {}) } }));
  const refusal = content.filter((part: any) => part.type === "redacted_thinking").map(() => "This response contains redacted reasoning.").join("");
  const cacheRead = Number(response.usage?.cache_read_input_tokens ?? 0);
  const cacheWrite = Number(response.usage?.cache_creation_input_tokens ?? 0);
  const stopReason = response.stop_reason === "max_tokens" ? "length" : response.stop_reason === "tool_use" ? "tool_calls" : response.stop_reason === "stop_sequence" ? "stop" : "stop";
  return { id: response.id, object: "chat.completion", created: Math.floor(Date.now() / 1000), model: response.model, choices: [{ index: 0, message: { role: "assistant", content: text || null, ...(reasoning ? { reasoning_content: reasoning } : {}), ...(refusal ? { refusal } : {}), ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, finish_reason: response.stop_reason === "max_tokens" ? "length" : toolCalls.length ? "tool_calls" : stopReason }], usage: { ...usageFromAnthropic(response.usage), prompt_tokens_details: { cached_tokens: cacheRead }, cache_creation_input_tokens: cacheWrite } };
}

function stopReasonToAnthropic(reason: any) {
  if (reason === "length") return "max_tokens";
  if (reason === "tool_calls" || reason === "function_call") return "tool_use";
  if (reason === "stop") return "end_turn";
  return null;
}

/** Convert a canonical Chat Completion response to an Anthropic Message. */
export function chatCompletionToAnthropic(completion: AnyRecord) {
  if ((completion.choices?.length ?? 0) > 1)
    throw new Error("Anthropic Messages supports one completion choice; Chat Completions n > 1 is not representable");
  const choice = completion.choices?.[0] ?? {};
  const message = choice.message ?? {};
  const content: any[] = [];
  if (message.reasoning_content || message.reasoning) throw new Error("Chat Completions reasoning content cannot be converted into Anthropic thinking without a provider-issued signature");
  const responseText = typeof message.content === "string" ? message.content : "";
  const refusalText = typeof message.refusal === "string" ? message.refusal : "";
  if (refusalText && responseText.startsWith(refusalText)) {
    content.push({ type: "text", text: refusalText });
    if (responseText.slice(refusalText.length)) content.push({ type: "text", text: responseText.slice(refusalText.length) });
  } else {
    if (responseText) content.push({ type: "text", text: responseText });
    if (refusalText) content.push({ type: "text", text: refusalText });
  }
  for (const call of message.tool_calls ?? []) {
    let input: any = call.function?.arguments ?? "{}";
    try { if (typeof input === "string") input = JSON.parse(input); } catch { input = {}; }
    content.push({ type: "tool_use", id: call.id, name: call.function?.name ?? "", input });
  }
  const usage = completion.usage ?? {};
  const stopReason = choice.finish_reason === "length" ? "max_tokens" : stopReasonToAnthropic(choice.finish_reason);
  const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
  const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
  const cacheRead = Number(usage.prompt_tokens_details?.cached_tokens ?? usage.cache_read_input_tokens ?? 0);
  return {
    id: completion.id?.startsWith("msg_") ? completion.id : `msg_${String(completion.id ?? crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "_")}`,
    type: "message", role: "assistant", model: completion.model,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: Math.max(0, inputTokens - cacheRead), output_tokens: outputTokens, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: Number(usage.cache_creation_input_tokens ?? 0) },
  };
}

function responseId(id?: string) {
  return id?.startsWith("resp_") ? id : `resp_${String(id ?? crypto.randomUUID()).replace(/^chatcmpl-/, "").replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/** Convert canonical Chat Completion response to a Responses API response object. */
export function chatCompletionToResponse(completion: AnyRecord) {
  if ((completion.choices?.length ?? 0) > 1)
    throw new Error("Responses supports one response object; Chat Completions n > 1 is not representable");
  const choice = completion.choices?.[0] ?? {};
  const message = choice.message ?? {};
  const id = responseId(completion.id);
  const output: any[] = [];
  if (message.reasoning_content || message.reasoning) output.push({ id: `rs_${id.slice(5)}_reasoning`, type: "reasoning", summary: [{ type: "summary_text", text: message.reasoning_content ?? message.reasoning }] });
  if (typeof message.content === "string" && message.content && !message.refusal) output.push({ id: `msg_${id.slice(5)}_message`, type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text: message.content, annotations: [] }] });
  else if (typeof message.content === "string" && message.content && message.refusal) output.push({ id: `msg_${id.slice(5)}_message`, type: "message", status: "completed", role: "assistant", content: [{ type: "refusal", refusal: message.refusal }, ...(message.content.startsWith(message.refusal) && message.content.length > message.refusal.length ? [{ type: "output_text", text: message.content.slice(message.refusal.length), annotations: [] }] : [])] });
  else if (message.refusal) output.push({ id: `msg_${id.slice(5)}_refusal`, type: "message", status: "completed", role: "assistant", content: [{ type: "refusal", refusal: message.refusal }] });
  for (const call of message.tool_calls ?? []) output.push({ id: call.id, type: "function_call", status: "completed", call_id: call.id, name: call.function?.name ?? "", arguments: call.function?.arguments ?? "{}" });
  const usage = completion.usage;
  const input = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0);
  const outputTokens = Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0);
  const response: AnyRecord = { id, object: "response", created_at: completion.created ?? Math.floor(Date.now() / 1000), status: choice.finish_reason === "length" ? "incomplete" : "completed", error: null, incomplete_details: choice.finish_reason === "length" ? { reason: "max_output_tokens" } : null, instructions: null, model: completion.model, output, parallel_tool_calls: true, tool_choice: "auto", tools: [], usage: usage ? { input_tokens: input, input_tokens_details: { cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0 }, output_tokens: outputTokens, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: Number(usage.total_tokens ?? input + outputTokens) } : null };
  return response;
}

/** Convert a canonical Chat Completion response to another protocol. */
export function responseFromChat(to: Protocol, completion: AnyRecord): AnyRecord {
  if (to === "chat_completions") return completion;
  if (to === "responses") return chatCompletionToResponse(completion);
  return chatCompletionToAnthropic(completion);
}

export function convertResponse(from: Protocol, to: Protocol, response: AnyRecord): AnyRecord {
  const canonical = from === "chat_completions" ? response : from === "anthropic" ? anthropicResponseToChat(response) : responseToChatCompletion(response);
  return responseFromChat(to, canonical);
}

/** Convert a live SSE stream from any supported protocol to another. */
export function convertStream(from: Protocol, to: Protocol, stream: Response, model: string, onCancel?: () => void): Response {
  if (from === to) return stream;
  const toChat = from === "responses"
    ? responsesSseToChat(stream, model, onCancel)
    : from === "anthropic"
      ? anthropicSseToChat(stream, model, onCancel)
      : stream;
  if (from !== "chat_completions" && to === "anthropic") {
    const decoder = new TextDecoder();
    let buffered = "";
    const downstream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffered += decoder.decode(chunk, { stream: true });
        const blocks = buffered.split(/\r\n\r\n|\n\n|\r\r/);
        buffered = blocks.pop() ?? "";
        for (const block of blocks) {
          const parsed = dataOfSseEvent(block);
          if (parsed.event === "response.reasoning_summary_text.delta" || parsed.event === "response.reasoning_summary_part.added")
            throw new Error("Responses reasoning summaries cannot become Anthropic thinking without the original provider signature");
          controller.enqueue(new TextEncoder().encode(`${block}\n\n`));
        }
      },
      flush(controller) {
        buffered += decoder.decode();
        if (!buffered.trim()) return;
        const parsed = dataOfSseEvent(buffered);
        if (parsed.event === "response.reasoning_summary_text.delta" || parsed.event === "response.reasoning_summary_part.added")
          throw new Error("Responses reasoning summaries cannot become Anthropic thinking without the original provider signature");
        controller.enqueue(new TextEncoder().encode(buffered));
      },
    });
    return chatSseToAnthropic(new Response(toChat.body?.pipeThrough(downstream) ?? null, { headers: toChat.headers }), model);
  }
  if (to === "chat_completions") return toChat;
  if (to === "responses") return chatSseToResponses(toChat, model, from === "chat_completions" ? onCancel : undefined);
  return chatSseToAnthropic(toChat, model, from === "chat_completions" ? onCancel : undefined);
}

/** Convert any incoming protocol SSE stream to another protocol SSE stream. */
export function convertSse(from: Protocol, to: Protocol, stream: Response, model: string, onCancel?: () => void): Response {
  return convertStream(from, to, stream, model, onCancel);
}

/** Rewrite only the model field in Responses SSE events while preserving all other upstream fields. */
export function rewriteResponsesStreamModel(response: Response, model: string, onCancel?: () => void): Response {
  const reader = response.body?.getReader();
  if (!reader) return response;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  const rewriteBlock = (block: string) => {
    const lines = block.split(/\r\n|\n|\r/);
    return lines.map((line) => {
      if (!line.startsWith("data:")) return line;
      const prefix = line.slice(0, line.indexOf("data:") + 5);
      const raw = line.slice(line.indexOf("data:") + 5).replace(/^ /, "");
      if (!raw || raw === "[DONE]") return line;
      try {
        const event = JSON.parse(raw);
        if (event.response && typeof event.response === "object") event.response.model = model;
        return `${prefix} ${JSON.stringify(event)}`;
      } catch {
        return line;
      }
    }).join("\n");
  };
  return new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
          const events = buffer.split(/\r\n\r\n|\n\n|\r\r/);
          buffer = events.pop() ?? "";
          for (const event of events) controller.enqueue(encoder.encode(`${rewriteBlock(event)}\n\n`));
          if (done) {
            if (buffer) controller.enqueue(encoder.encode(rewriteBlock(buffer)));
            break;
          }
        }
      } catch (error) {
        controller.error(error);
      } finally {
        controller.close();
      }
    },
    cancel(reason) {
      onCancel?.();
      void reader.cancel(reason).catch(() => undefined);
    },
  }), { headers: response.headers, status: response.status, statusText: response.statusText });
}

function responseToChatCompletion(response: AnyRecord) {
  const message: AnyRecord = { role: "assistant", content: "" };
  const tools: any[] = [];
  const reasoning: string[] = [];
  let refusal = "";
  for (const item of response.output ?? []) {
    if (item.type === "message") {
      const text = (item.content ?? []).filter((part: any) => part.type === "output_text" || part.type === "text").map((part: any) => part.text ?? "").join("");
      const refusalText = (item.content ?? []).filter((part: any) => part.type === "refusal").map((part: any) => part.refusal ?? "").join("");
      message.content += text;
      if (refusalText) {
        message.refusal = (message.refusal ?? "") + refusalText;
        if (!text) message.content += refusalText;
      }
    }
    else if (item.type === "reasoning") reasoning.push((item.summary ?? []).map((part: any) => part.text ?? "").join(""));
    else if (item.type === "function_call") tools.push({ id: item.call_id ?? item.id, type: "function", function: { name: item.name, arguments: item.arguments ?? "{}" } });
    else if (["computer_call", "web_search_call", "code_interpreter_call"].includes(item.type))
      throw new Error(`Responses output item type "${item.type}" cannot be represented as a Chat Completion`);
  }
  if (!message.content) message.content = null;
  if (reasoning.length) message.reasoning_content = reasoning.join("");
  if (tools.length) message.tool_calls = tools;
  const usage = response.usage;
  return { id: response.id, object: "chat.completion", created: response.created_at, model: response.model, choices: [{ index: 0, message, finish_reason: response.status === "incomplete" ? "length" : tools.length ? "tool_calls" : "stop" }], ...(usage ? { usage: { prompt_tokens: usage.input_tokens ?? 0, completion_tokens: usage.output_tokens ?? 0, total_tokens: usage.total_tokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0), prompt_tokens_details: usage.input_tokens_details } } : {}) };
}

/** Translate OpenAI-style SSE chunks to the Responses event stream. */
export function chatSseToResponses(response: Response, model: string, onCancel?: () => void) {
  const reader = response.body?.getReader();
  if (!reader) return response;
  const encoder = new TextEncoder();
  const id = responseId();
  let sequence = 0;
  let buffer = "";
  let content = "";
  let reasoning = "";
  let reasoningRecord: { index: number; item: AnyRecord } | undefined;
  let usage: any;
  let error: any;
  let finishReason: string | null = null;
  let message: any;
  let messageIndex = -1;
  const calls = new Map<number, { index: number; item: AnyRecord }>();
  const output: any[] = [];
  const emit = (type: string, payload: AnyRecord = {}) => encoder.encode(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...payload })}\n\n`);
  return new Response(new ReadableStream({
    async start(controller) {
      const responseObject: AnyRecord = { id, object: "response", created_at: Math.floor(Date.now() / 1000), status: "in_progress", model, output, error: null };
      const addMessage = () => {
        if (message) return message;
        message = { id: `msg_${id.slice(5)}_message`, type: "message", status: "in_progress", role: "assistant", content: [] };
        messageIndex = output.length; output.push(message);
        controller.enqueue(emit("response.output_item.added", { output_index: messageIndex, item: message }));
        controller.enqueue(emit("response.content_part.added", { item_id: message.id, output_index: messageIndex, content_index: 0, part: { type: "output_text", text: "", annotations: [] } }));
        return message;
      };
      const process = (raw: string) => {
        if (!raw || raw === "[DONE]") return;
        const chunk = JSON.parse(raw);
        if (chunk.error) { error = chunk.error; controller.enqueue(emit("error", { error })); return; }
        usage = chunk.usage ?? usage;
        const delta = chunk.choices?.[0]?.delta ?? {};
        const reasoningDelta = delta.reasoning_content ?? delta.reasoning;
        if (typeof reasoningDelta === "string" && reasoningDelta) {
          if (!reasoningRecord) {
            const item = { id: `rs_${id.slice(5)}_reasoning`, type: "reasoning", status: "in_progress", summary: [] };
            reasoningRecord = { index: output.length, item }; output.push(item);
            controller.enqueue(emit("response.output_item.added", { output_index: reasoningRecord.index, item }));
            controller.enqueue(emit("response.reasoning_summary_part.added", { item_id: item.id, output_index: reasoningRecord.index, summary_index: 0, part: { type: "summary_text", text: "" } }));
          }
          reasoning += reasoningDelta;
          controller.enqueue(emit("response.reasoning_summary_text.delta", { item_id: reasoningRecord.item.id, output_index: reasoningRecord.index, summary_index: 0, delta: reasoningDelta }));
        }
        if (typeof delta.content === "string" && delta.content) {
          const target = addMessage(); content += delta.content;
          controller.enqueue(emit("response.output_text.delta", { item_id: target.id, output_index: messageIndex, content_index: 0, delta: delta.content }));
        }
        for (const toolDelta of delta.tool_calls ?? []) {
          const sourceIndex = Number(toolDelta.index ?? 0);
          let call = calls.get(sourceIndex);
          if (!call) {
            const callId = toolDelta.id ?? `call_${id.slice(5)}_${sourceIndex}`;
            const item = { id: callId, type: "function_call", status: "in_progress", call_id: callId, name: "", arguments: "" };
            call = { index: output.length, item }; calls.set(sourceIndex, call); output.push(item);
            controller.enqueue(emit("response.output_item.added", { output_index: call.index, item }));
          }
          if (toolDelta.id) call.item.id = call.item.call_id = toolDelta.id;
          if (toolDelta.function?.name) call.item.name = normalizeToolName(call.item.name, toolDelta.function.name);
          const args = toolDelta.function?.arguments ?? ""; call.item.arguments += args;
          if (args) controller.enqueue(emit("response.function_call_arguments.delta", { item_id: call.item.id, output_index: call.index, delta: args }));
        }
        if (typeof delta.refusal === "string" && delta.refusal) {
          const target = addMessage();
          target.content = [{ type: "refusal", refusal: "" }];
          content += delta.refusal;
          controller.enqueue(emit("response.refusal.delta", { item_id: target.id, output_index: messageIndex, content_index: 0, delta: delta.refusal }));
        }
        if (chunk.choices?.[0]?.finish_reason != null) finishReason = chunk.choices[0].finish_reason;
      };
      try {
        controller.enqueue(emit("response.created", { response: responseObject }));
        controller.enqueue(emit("response.in_progress", { response: responseObject }));
        while (true) {
          const { done, value } = await reader.read();
          buffer += new TextDecoder().decode(value ?? new Uint8Array(), { stream: !done });
          const blocks = buffer.split(/\r\n\r\n|\n\n|\r\r/); buffer = blocks.pop() ?? "";
          for (const block of blocks) { const parsed = dataOfSseEvent(block); if (parsed.data) process(parsed.data); }
          if (done) { if (buffer.trim()) { const parsed = dataOfSseEvent(buffer); if (parsed.data) process(parsed.data); } break; }
        }
        if (error) {
          responseObject.status = "failed"; responseObject.error = error;
          controller.enqueue(emit("response.failed", { response: responseObject }));
        } else {
          for (const [sourceIndex, call] of calls) { call.item.status = "completed"; controller.enqueue(emit("response.function_call_arguments.done", { item_id: call.item.id, output_index: call.index, arguments: call.item.arguments })); controller.enqueue(emit("response.output_item.done", { output_index: call.index, item: call.item })); void sourceIndex; }
          if (message) { const part = { type: "output_text", text: content, annotations: [] }; message.content = [part]; message.status = "completed"; controller.enqueue(emit("response.output_text.done", { item_id: message.id, output_index: messageIndex, content_index: 0, text: content })); controller.enqueue(emit("response.content_part.done", { item_id: message.id, output_index: messageIndex, content_index: 0, part })); controller.enqueue(emit("response.output_item.done", { output_index: messageIndex, item: message })); }
          if (reasoningRecord) { const part = { type: "summary_text", text: reasoning }; reasoningRecord.item.summary = [part]; reasoningRecord.item.status = "completed"; controller.enqueue(emit("response.reasoning_summary_text.done", { item_id: reasoningRecord.item.id, output_index: reasoningRecord.index, summary_index: 0, text: reasoning })); controller.enqueue(emit("response.reasoning_summary_part.done", { item_id: reasoningRecord.item.id, output_index: reasoningRecord.index, summary_index: 0, part })); controller.enqueue(emit("response.output_item.done", { output_index: reasoningRecord.index, item: reasoningRecord.item })); }
          responseObject.status = finishReason === "length" ? "incomplete" : "completed";
          if (finishReason === "length") responseObject.incomplete_details = { reason: "max_output_tokens" };
          const prompt = usage?.prompt_tokens ?? usage?.input_tokens ?? 0; const completion = usage?.completion_tokens ?? usage?.output_tokens ?? 0;
          responseObject.usage = usage ? { input_tokens: prompt, input_tokens_details: usage.prompt_tokens_details ?? { cached_tokens: 0 }, output_tokens: completion, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: usage.total_tokens ?? prompt + completion } : null;
          controller.enqueue(emit(responseObject.status === "incomplete" ? "response.incomplete" : "response.completed", { response: responseObject }));
        }
      } catch (cause: any) {
        const failure = { message: cause?.message ?? String(cause), type: "server_error" };
        controller.enqueue(emit("error", { error: failure })); responseObject.status = "failed"; responseObject.error = failure; controller.enqueue(emit("response.failed", { response: responseObject }));
      } finally { controller.close(); }
    },
    cancel(reason) { onCancel?.(); void reader.cancel(reason).catch(() => undefined); },
  }), { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
}

/** Translate OpenAI-style SSE chunks into Anthropic Messages SSE events. */
export function chatSseToAnthropic(response: Response, model: string, onCancel?: () => void) {
  const reader = response.body?.getReader();
  if (!reader) return response;
  const encoder = new TextEncoder();
  let buffer = "";
  let sequence = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let textIndex = -1;
  let reasoningIndex = -1;
  let nextIndex = 0;
  let stopReason: string | null = null;
  let messageStarted = false;
  let sawStreamError = false;
  let messageId = `msg_${crypto.randomUUID()}`;
  const toolByIndex = new Map<number, { blockIndex: number; id: string; name: string }>();
  const write = (controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: AnyRecord) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify({ ...data, ...(data.type ? {} : { type: event }), ...(event === "ping" ? {} : { sequence_number: sequence++ }) })}\n\n`));
  return new Response(new ReadableStream({
    async start(controller) {
      const startMessage = (chunk: any) => {
        if (messageStarted) return;
        messageStarted = true;
        inputTokens = Number(chunk.usage?.prompt_tokens ?? chunk.usage?.input_tokens ?? 0);
        write(controller, "message_start", { type: "message_start", message: { id: messageId, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: inputTokens, output_tokens: 0 } } });
      };
      const startBlock = (index: number, block: AnyRecord) => write(controller, "content_block_start", { type: "content_block_start", index, content_block: block });
      const stopBlock = (index: number) => write(controller, "content_block_stop", { type: "content_block_stop", index });
      const process = (raw: string) => {
        if (!raw || raw === "[DONE]") return;
        const chunk = JSON.parse(raw); startMessage(chunk);
        if (chunk.error) { sawStreamError = true; write(controller, "error", { type: "error", error: { type: "api_error", message: typeof chunk.error === "string" ? chunk.error : chunk.error.message ?? "Upstream error" } }); return; }
        if (Array.isArray(chunk.choices) && chunk.choices.length > 1) throw new Error("Anthropic Messages supports only one completion choice; n > 1 is not representable");
        const usage = chunk.usage;
        if (usage) { inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? inputTokens); outputTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? outputTokens); }
        const choice = chunk.choices?.[0]; const delta = choice?.delta ?? {};
        const thought = delta.reasoning_content ?? delta.reasoning;
        if (typeof thought === "string" && thought) throw new Error("Chat Completions reasoning deltas cannot become Anthropic thinking without a provider-issued signature");
        if (typeof delta.content === "string" && delta.content) {
          if (textIndex < 0) { textIndex = nextIndex++; startBlock(textIndex, { type: "text", text: "" }); }
          write(controller, "content_block_delta", { type: "content_block_delta", index: textIndex, delta: { type: "text_delta", text: delta.content } });
        }
        for (const tool of delta.tool_calls ?? []) {
          const sourceIndex = Number(tool.index ?? 0); let current = toolByIndex.get(sourceIndex);
          if (!current) { current = { blockIndex: nextIndex++, id: tool.id ?? `toolu_${crypto.randomUUID()}`, name: tool.function?.name ?? "" }; toolByIndex.set(sourceIndex, current); startBlock(current.blockIndex, { type: "tool_use", id: current.id, name: current.name, input: {} }); }
          if (tool.id) current.id = tool.id;
          if (tool.function?.name) current.name = normalizeToolName(current.name, tool.function.name);
          const partial = tool.function?.arguments ?? "";
          if (partial) write(controller, "content_block_delta", { type: "content_block_delta", index: current.blockIndex, delta: { type: "input_json_delta", partial_json: partial } });
        }
        if (choice?.finish_reason) stopReason = choice.finish_reason === "length" ? "max_tokens" : choice.finish_reason === "tool_calls" || choice.finish_reason === "function_call" ? "tool_use" : "end_turn";
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          buffer += new TextDecoder().decode(value ?? new Uint8Array(), { stream: !done });
          const blocks = buffer.split(/\r\n\r\n|\n\n|\r\r/); buffer = blocks.pop() ?? "";
          for (const block of blocks) { const parsed = dataOfSseEvent(block); if (parsed.data) process(parsed.data); }
          if (done) { if (buffer.trim()) { const parsed = dataOfSseEvent(buffer); if (parsed.data) process(parsed.data); } break; }
        }
        if (!messageStarted) startMessage({});
        for (const index of [reasoningIndex, textIndex].filter((item) => item >= 0)) stopBlock(index);
        for (const tool of toolByIndex.values()) stopBlock(tool.blockIndex);
        if (stopReason === "tool_use") {
          const tools = [...toolByIndex.values()];
          if (tools.length) stopReason = "tool_use";
        }
        if (!sawStreamError) {
          write(controller, "message_delta", { type: "message_delta", delta: { stop_reason: stopReason ?? "end_turn", stop_sequence: null }, usage: { output_tokens: outputTokens } });
          write(controller, "message_stop", { type: "message_stop" });
        }
      } catch (cause: any) {
        if (!messageStarted) startMessage({});
        write(controller, "error", { type: "error", error: { type: "api_error", message: cause?.message ?? String(cause) } });
      } finally { controller.close(); }
    },
    cancel(reason) { onCancel?.(); void reader.cancel(reason).catch(() => undefined); },
  }), { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
}

/** Convert Anthropic Messages SSE directly to Responses SSE via Chat Completions. */
export function anthropicSseToResponses(response: Response, model: string, onCancel?: () => void) {
  return chatSseToResponses(anthropicSseToChat(response, model, onCancel), model);
}

/** Convert Responses SSE directly to Anthropic Messages SSE via Chat Completions. */
export function responsesSseToAnthropic(response: Response, model: string, onCancel?: () => void) {
  return chatSseToAnthropic(responsesSseToChat(response, model, onCancel), model);
}

/** Convert Anthropic Messages SSE to the canonical Chat Completions SSE stream. */
export function anthropicSseToChat(response: Response, model: string, onCancel?: () => void) {
  const reader = response.body?.getReader();
  if (!reader) return response;
  const encoder = new TextEncoder();
  let buffer = "";
  let textBlockIndex: number | null = null;
  let reasoningBlockIndex: number | null = null;
  const toolIndexes = new Map<number, number>();
  let nextToolIndex = 0;
  let id = `chatcmpl-${crypto.randomUUID()}`;
  let created = Math.floor(Date.now() / 1000);
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let promptTokens = 0;
  let finishReason = "stop";
  let ended = false;
  let usageSent = false;
  return new Response(new ReadableStream({
    async start(controller) {
      const emit = (chunk: AnyRecord) => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model, ...chunk })}\n\n`));
      const finish = () => {
        if (ended) return; ended = true;
        emit({ choices: [{ index: 0, delta: {}, finish_reason: finishReason }] });
        if (!usageSent) emit({ choices: [], usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens, prompt_tokens_details: { cached_tokens: cacheRead }, cache_creation_input_tokens: cacheWrite } });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      };
      const process = (eventBlock: string) => {
        const { event, data } = dataOfSseEvent(eventBlock);
        if (!data) return;
        let payload: AnyRecord; try { payload = JSON.parse(data); } catch { return; }
        if (event === "message_start" || payload.type === "message_start") {
          if (payload.message?.id) id = `chatcmpl-${String(payload.message.id).replace(/^msg_/, "")}`;
          inputTokens = Number(payload.message?.usage?.input_tokens ?? 0); cacheRead = Number(payload.message?.usage?.cache_read_input_tokens ?? 0); cacheWrite = Number(payload.message?.usage?.cache_creation_input_tokens ?? 0); promptTokens = inputTokens + cacheRead; created = Math.floor(Date.now() / 1000);
          emit({ choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] }); return;
        }
        if (event === "content_block_start" || payload.type === "content_block_start") {
          const block = payload.content_block ?? {}; const index = Number(payload.index ?? 0);
          if (block.type === "text") textBlockIndex = index;
          else if (block.type === "thinking") reasoningBlockIndex = index;
          else if (block.type === "tool_use") {
            const toolIndex = nextToolIndex++; toolIndexes.set(index, toolIndex);
            emit({ choices: [{ index: 0, delta: { tool_calls: [{ index: toolIndex, id: block.id, type: "function", function: { name: block.name, arguments: "" } }] }, finish_reason: null }] });
          }
          return;
        }
        if (event === "content_block_delta" || payload.type === "content_block_delta") {
          const index = Number(payload.index ?? 0); const delta = payload.delta ?? {};
          if (delta.type === "text_delta") emit({ choices: [{ index: 0, delta: { content: delta.text ?? "" }, finish_reason: null }] });
          else if (delta.type === "thinking_delta") emit({ choices: [{ index: 0, delta: { reasoning_content: delta.thinking ?? "" }, finish_reason: null }] });
          else if (delta.type === "input_json_delta") emit({ choices: [{ index: 0, delta: { tool_calls: [{ index: toolIndexes.get(index) ?? 0, function: { arguments: delta.partial_json ?? "" } }] }, finish_reason: null }] });
          return;
        }
        if (event === "message_delta" || payload.type === "message_delta") {
          outputTokens = Number(payload.usage?.output_tokens ?? outputTokens);
          const stop = payload.delta?.stop_reason;
          finishReason = stop === "max_tokens" ? "length" : stop === "tool_use" ? "tool_calls" : "stop";
          emit({ choices: [], usage: { prompt_tokens: promptTokens, completion_tokens: outputTokens, total_tokens: promptTokens + outputTokens, prompt_tokens_details: { cached_tokens: cacheRead }, cache_creation_input_tokens: cacheWrite } }); usageSent = true; return;
        }
        if (event === "error" || payload.type === "error") {
          emit({ error: { message: payload.error?.message ?? "Anthropic stream failed", type: payload.error?.type ?? "api_error" } }); finish();
        }
        if (event === "message_stop" || payload.type === "message_stop") finish();
      };
      try {
        while (!ended) {
          const { done, value } = await reader.read(); buffer += new TextDecoder().decode(value ?? new Uint8Array(), { stream: !done });
          const blocks = buffer.split(/\r\n\r\n|\n\n|\r\r/); buffer = blocks.pop() ?? "";
          blocks.forEach(process);
          if (done) { if (buffer.trim()) process(buffer); break; }
        }
        finish();
      } catch (cause: any) { emit({ error: { message: cause?.message ?? String(cause) } }); finish(); }
      finally { if (textBlockIndex !== null || reasoningBlockIndex !== null) { /* tracked for diagnostics and future block-aware clients */ } controller.close(); }
    },
    cancel(reason) { onCancel?.(); void reader.cancel(reason).catch(() => undefined); },
  }), { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
}

/** Convert Responses API SSE events to canonical Chat Completions SSE chunks. */
export function responsesSseToChat(response: Response, model: string, onCancel?: () => void) {
  const reader = response.body?.getReader();
  if (!reader) return response;
  const encoder = new TextEncoder();
  let buffer = ""; let id = `chatcmpl-${crypto.randomUUID()}`; let created = Math.floor(Date.now() / 1000); let finishReason = "stop"; let ended = false; let sawToolCall = false; let incomplete = false; let sawTerminal = false;
  const calls = new Map<number, number>(); let nextTool = 0;
  return new Response(new ReadableStream({
    async start(controller) {
      const emit = (chunk: AnyRecord) => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model, ...chunk })}\n\n`));
      const process = (block: string) => {
        const parsed = dataOfSseEvent(block); if (!parsed.data) return;
        let event: AnyRecord; try { event = JSON.parse(parsed.data); } catch { return; }
        const type = event.type ?? parsed.event;
        if (type === "response.output_item.added" && event.item?.type === "reasoning")
          throw new Error("Responses reasoning cannot be converted to Chat Completions without losing signed reasoning semantics");
        if (type === "response.output_item.added" && event.item?.type !== "message" && event.item?.type !== "function_call")
          throw new Error(`Responses output item type "${event.item?.type}" cannot be represented as a Chat Completion`);
        if (type === "response.created") { id = (event.response?.id ?? id).replace(/^resp_/, "chatcmpl-"); created = event.response?.created_at ?? created; emit({ choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] }); }
        else if (type === "response.output_item.added" && event.item?.type === "function_call") { sawToolCall = true; const index = nextTool++; calls.set(event.output_index, index); emit({ choices: [{ index: 0, delta: { tool_calls: [{ index, id: event.item.call_id ?? event.item.id, type: "function", function: { name: event.item.name ?? "", arguments: "" } }] }, finish_reason: null }] }); }
        else if (type === "response.output_text.delta") emit({ choices: [{ index: 0, delta: { content: event.delta ?? "" }, finish_reason: null }] });
        else if (type === "response.reasoning_summary_text.delta") throw new Error("Responses reasoning cannot be converted to Chat Completions without losing signed reasoning semantics");
        else if (type === "response.refusal.delta") emit({ choices: [{ index: 0, delta: { refusal: event.delta ?? "" }, finish_reason: null }] });
        else if (type === "response.function_call_arguments.delta") emit({ choices: [{ index: 0, delta: { tool_calls: [{ index: calls.get(event.output_index) ?? 0, function: { arguments: event.delta ?? "" } }] }, finish_reason: null }] });
        else if (type.endsWith(".delta") && /audio|image|video|code_interpreter|computer_call|web_search/.test(type))
          throw new Error(`Responses stream event "${type}" cannot be represented as a Chat Completion`);
        else if (type === "response.completed" || type === "response.incomplete") { sawTerminal = true; incomplete = type === "response.incomplete" || event.response?.status === "incomplete"; const usage = event.response?.usage; emit({ choices: [{ index: 0, delta: {}, finish_reason: incomplete ? "length" : sawToolCall ? "tool_calls" : finishReason }], ...(usage ? { usage: { prompt_tokens: usage.input_tokens ?? 0, completion_tokens: usage.output_tokens ?? 0, total_tokens: usage.total_tokens ?? 0, prompt_tokens_details: usage.input_tokens_details } } : {}) }); controller.enqueue(encoder.encode("data: [DONE]\n\n")); ended = true; }
        else if (type === "response.failed" || type === "error") { sawTerminal = true; emit({ error: event.error ?? event.response?.error ?? { message: "Responses stream failed" } }); controller.enqueue(encoder.encode("data: [DONE]\n\n")); ended = true; }
      };
      try { while (!ended) { const { done, value } = await reader.read(); buffer += new TextDecoder().decode(value ?? new Uint8Array(), { stream: !done }); const blocks = buffer.split(/\r\n\r\n|\n\n|\r\r/); buffer = blocks.pop() ?? ""; blocks.forEach(process); if (done) { if (buffer.trim()) process(buffer); break; } } if (!sawTerminal) { emit({ choices: [{ index: 0, delta: {}, finish_reason: finishReason }] }); controller.enqueue(encoder.encode("data: [DONE]\n\n")); } }
      catch (cause: any) { emit({ error: { message: cause?.message ?? String(cause) } }); controller.enqueue(encoder.encode("data: [DONE]\n\n")); }
      finally { controller.close(); }
    }, cancel(reason) { onCancel?.(); void reader.cancel(reason).catch(() => undefined); },
  }), { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
}
