import { normalizeToolName } from "./tool-names";

export type OpenAICompletionResult = {
  completion: any;
  firstDeltaAt: number | null;
};

function eventData(event: string) {
  return event
    .split(/\r\n|\r|\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n")
    .trim();
}

function streamError(chunk: any) {
  if (!chunk?.error) return null;
  const value = chunk.error;
  return new Error(
    typeof value === "string"
      ? value
      : value.message ?? value.error?.message ?? "Upstream stream failed",
  );
}

export async function openAICompletionFromSse(
  response: Response,
  fallbackModel: string,
  now: () => number = () => performance.now(),
): Promise<OpenAICompletionResult> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Upstream returned an empty stream");

  const decoder = new TextDecoder();
  const choices = new Map<number, any>();
  let buffer = "";
  let id: string | undefined;
  let created: number | undefined;
  let model: string | undefined;
  let usage: any;
  let firstDeltaAt: number | null = null;

  const processEvent = (event: string) => {
    const raw = eventData(event);
    if (!raw || raw === "[DONE]") return;

    let chunk: any;
    try {
      chunk = JSON.parse(raw);
    } catch {
      throw new Error("Upstream returned invalid OpenAI SSE JSON");
    }
    const error = streamError(chunk);
    if (error) throw error;
    id ??= chunk.id;
    created ??= chunk.created;
    model ??= chunk.model;
    if (chunk.usage) {
      usage = {
        ...usage,
        ...chunk.usage,
        ...(usage?.prompt_tokens_details || chunk.usage.prompt_tokens_details
          ? {
              prompt_tokens_details: {
                ...usage?.prompt_tokens_details,
                ...chunk.usage.prompt_tokens_details,
              },
            }
          : {}),
        ...(usage?.input_tokens_details || chunk.usage.input_tokens_details
          ? {
              input_tokens_details: {
                ...usage?.input_tokens_details,
                ...chunk.usage.input_tokens_details,
              },
            }
          : {}),
      };
    }

    for (const incoming of chunk.choices ?? []) {
      const index = Number(incoming.index ?? 0);
      let choice = choices.get(index);
      if (!choice) {
        choice = {
          index,
          message: { role: "assistant", content: "" },
          finish_reason: null,
        };
        choices.set(index, choice);
      }
      const delta = incoming.delta ?? {};
      const semantic =
        typeof delta.content === "string" ||
        typeof delta.reasoning_content === "string" ||
        typeof delta.refusal === "string" ||
        Array.isArray(delta.tool_calls) ||
        delta.function_call;
      if (semantic) firstDeltaAt ??= now();
      if (typeof delta.content === "string")
        choice.message.content += delta.content;
      if (typeof delta.reasoning_content === "string")
        choice.message.reasoning_content =
          (choice.message.reasoning_content ?? "") + delta.reasoning_content;
      if (typeof delta.refusal === "string")
        choice.message.refusal =
          (choice.message.refusal ?? "") + delta.refusal;
      if (delta.function_call) {
        choice.message.function_call ??= { name: "", arguments: "" };
        if (delta.function_call.name)
          choice.message.function_call.name = normalizeToolName(
            choice.message.function_call.name,
            delta.function_call.name,
          );
        if (delta.function_call.arguments)
          choice.message.function_call.arguments += delta.function_call.arguments;
      }
      for (const callDelta of delta.tool_calls ?? []) {
        choice.message.tool_calls ??= [];
        const toolIndex = Number(
          callDelta.index ?? choice.message.tool_calls.length,
        );
        choice.message.tool_calls[toolIndex] ??= {
          id: "",
          type: "function",
          function: { name: "", arguments: "" },
        };
        const call = choice.message.tool_calls[toolIndex];
        if (callDelta.id) call.id += callDelta.id;
        if (callDelta.type) call.type = callDelta.type;
        if (callDelta.function?.name)
          call.function.name = normalizeToolName(
            call.function.name,
            callDelta.function.name,
          );
        if (callDelta.function?.arguments)
          call.function.arguments += callDelta.function.arguments;
      }
      if (incoming.finish_reason != null)
        choice.finish_reason = incoming.finish_reason;
      if (incoming.logprobs !== undefined) choice.logprobs = incoming.logprobs;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const events = buffer.split(/\r\n\r\n|\n\n|\r\r/);
    buffer = events.pop() ?? "";
    for (const event of events) processEvent(event);
    if (done) {
      if (buffer.trim()) processEvent(buffer);
      break;
    }
  }

  const resultChoices = [...choices.values()]
    .sort((a, b) => a.index - b.index)
    .map((choice) => {
      if (choice.message.tool_calls?.length)
        choice.message.tool_calls = choice.message.tool_calls.filter(Boolean);
      if (!choice.message.content) choice.message.content = null;
      return choice;
    });
  if (!resultChoices.length)
    throw new Error("Upstream stream returned no completion choices");

  return {
    completion: {
      id: id ?? `chatcmpl-${crypto.randomUUID()}`,
      object: "chat.completion",
      created: created ?? Math.floor(Date.now() / 1000),
      model: model ?? fallbackModel,
      choices: resultChoices,
      ...(usage ? { usage } : {}),
    },
    firstDeltaAt,
  };
}
