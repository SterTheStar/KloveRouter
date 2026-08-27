import type { ThinkOpeningTagMode } from "../services/model.service";

const openingTag = /<think\s*>/i;
const closingTag = /<\/think\s*>/i;
const thinkBlockRegex = /<think\s*>[\s\S]*?<\/think\s*>/gi;

function extractReasoningFromContent(
  content: string,
): { remaining: string; reasoning: string | null } {
  thinkBlockRegex.lastIndex = 0;
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = thinkBlockRegex.exec(content)) !== null) {
    blocks.push(match[0]);
  }
  if (blocks.length === 0) return { remaining: content, reasoning: null };
  const reasoning = blocks.join("");
  const remaining = content.replace(thinkBlockRegex, "").trim();
  return { remaining, reasoning };
}

export function fixMissingThinkOpeningTag(
  completion: any,
  mode: ThinkOpeningTagMode = "off",
) {
  if (mode === "off") return completion;
  for (const choice of completion?.choices ?? []) {
    const content = choice?.message?.content;
    if (typeof content !== "string" || content.length === 0) continue;

    if (mode === "force") {
      const closing = closingTag.exec(content);
      if (closing) {
        const reasoning = content.slice(0, closing.index + closing[0].length);
        const remaining = content.slice(closing.index + closing[0].length).trim();
        choice.message.reasoning_content =
          (choice.message.reasoning_content ?? "") + reasoning;
        choice.message.content = remaining || null;
      } else {
        choice.message.reasoning_content =
          (choice.message.reasoning_content ?? "") + content;
        choice.message.content = null;
      }
      continue;
    }

    const { remaining, reasoning } = extractReasoningFromContent(content);
    if (reasoning) {
      choice.message.reasoning_content =
        (choice.message.reasoning_content ?? "") + reasoning;
      choice.message.content = remaining || null;
    }
  }
  return completion;
}

type Phase = "answer" | "reasoning";

type StreamChoiceState = {
  phase: Phase;
  buffer: string;
  started: boolean;
  lastBase: Record<string, unknown>;
  lastChoice: any;
};

function partialOpeningSuffix(text: string): string {
  const lower = text.toLowerCase();
  const tag = "<think>";
  for (let length = Math.min(tag.length - 1, text.length); length > 0; length--) {
    if (lower.endsWith(tag.slice(0, length))) return text.slice(-length);
  }
  return "";
}

export class ThinkTagChunkFixer {
  private readonly mode: ThinkOpeningTagMode;
  private readonly states = new Map<number, StreamChoiceState>();

  constructor(mode: ThinkOpeningTagMode) {
    this.mode = mode;
  }

  transform(chunk: any): any[] {
    if (!Array.isArray(chunk?.choices) || chunk.choices.length === 0 || this.mode === "off")
      return [chunk];
    const output: any[] = [];
    const base = { ...chunk };
    delete base.choices;

    for (const choice of chunk.choices) {
      const index = Number(choice?.index ?? 0);
      let state = this.states.get(index);
      if (!state) {
        state = {
          phase: this.mode === "force" ? "reasoning" : "answer",
          buffer: "",
          started: false,
          lastBase: base,
          lastChoice: choice,
        };
        this.states.set(index, state);
      }
      state.lastBase = base;
      state.lastChoice = choice;
      const content = choice?.delta?.content;
      if (typeof content !== "string") {
        output.push({ ...base, choices: [choice] });
        continue;
      }
      const parts = this.processContent(state, content);
      for (const part of parts) {
        output.push({ ...base, choices: [this.makeDelta(choice, part.channel, part.value)] });
      }
      if (parts.length === 0) {
        const delta = { ...choice.delta };
        delete delta.content;
        if (Object.keys(delta).length > 0) {
          output.push({ ...base, choices: [{ ...choice, delta }] });
        }
      }
    }
    return output;
  }

  flush(): any[] {
    const output: any[] = [];
    for (const state of this.states.values()) {
      if (!state.buffer) continue;
      const channel = this.mode === "force"
        ? "reasoning_content"
        : state.phase === "reasoning" ? "content" : "content";
      output.push({ ...state.lastBase, choices: [this.makeDelta(state.lastChoice, channel, state.buffer)] });
      state.buffer = "";
    }
    return output;
  }

  private processContent(state: StreamChoiceState, content: string): { channel: "content" | "reasoning_content"; value: string }[] {
    if (this.mode === "detect") return this.processDetect(state, content);

    const results: { channel: "content" | "reasoning_content"; value: string }[] = [];
    let text = state.buffer + content;
    state.buffer = "";
    if (!state.started) {
      const lower = text.toLowerCase();
      if (lower !== "<think>" && "<think>".startsWith(lower) && lower.length < "<think>".length) {
        state.buffer = text;
        return results;
      }
      state.started = true;
      if (!lower.startsWith("<think")) {
        results.push({ channel: "reasoning_content", value: "<think>" });
      }
    }

    while (text) {
      if (state.phase === "answer") {
        const opening = openingTag.exec(text);
        if (!opening) {
          results.push({ channel: "content", value: text });
          break;
        }
        if (opening.index) results.push({ channel: "content", value: text.slice(0, opening.index) });
        state.phase = "reasoning";
        text = text.slice(opening.index);
        continue;
      }
      const closing = closingTag.exec(text);
      if (!closing) {
        results.push({ channel: "reasoning_content", value: text });
        break;
      }
      const end = closing.index + closing[0].length;
      results.push({ channel: "reasoning_content", value: text.slice(0, end) });
      state.phase = "answer";
      text = text.slice(end);
    }
    return results;
  }

  private processDetect(state: StreamChoiceState, content: string): { channel: "content" | "reasoning_content"; value: string }[] {
    state.buffer += content;
    if (!closingTag.test(state.buffer)) return [];
    const text = state.buffer;
    state.buffer = "";
    const results: { channel: "content" | "reasoning_content"; value: string }[] = [];
    let cursor = 0;
    thinkBlockRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = thinkBlockRegex.exec(text)) !== null) {
      if (match.index > cursor) results.push({ channel: "content", value: text.slice(cursor, match.index) });
      results.push({ channel: "reasoning_content", value: match[0] });
      cursor = match.index + match[0].length;
    }
    if (cursor === 0) {
      const closing = closingTag.exec(text);
      const end = closing ? closing.index + closing[0].length : text.length;
      results.push({ channel: "reasoning_content", value: `<think>${text.slice(0, end)}` });
      cursor = end;
    }
    if (cursor < text.length) results.push({ channel: "content", value: text.slice(cursor) });
    return results;
  }

  private makeDelta(choice: any, channel: "content" | "reasoning_content", value: string) {
    const delta = { ...choice.delta };
    if (channel === "reasoning_content") {
      delta.reasoning_content = value;
      delete delta.content;
    } else {
      delta.content = value;
      delete delta.reasoning_content;
    }
    return { ...choice, delta };
  }
}

export function fixThinkTagAsyncIterable<T extends AsyncIterable<any>>(
  stream: T,
  mode: ThinkOpeningTagMode = "off",
): T {
  if (mode === "off") return stream;
  const fixer = new ThinkTagChunkFixer(mode);
  return {
    ...(stream as any),
    controller: (stream as any).controller,
    async *[Symbol.asyncIterator]() {
      const iterator = stream[Symbol.asyncIterator]();
      try {
        while (true) {
          const { done, value } = await iterator.next();
          if (done) break;
          for (const chunk of fixer.transform(value)) yield chunk;
        }
        for (const chunk of fixer.flush()) yield chunk;
      } finally {
        await iterator.return?.();
      }
    },
  } as T;
}

function eventData(event: string): string {
  return event
    .split(/\r\n|\r|\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
}

export function fixThinkTagSseResponse(
  response: Response,
  mode: ThinkOpeningTagMode = "off",
) {
  if (mode === "off" || !response.body) return response;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const fixer = new ThinkTagChunkFixer(mode);
  let buffer = "";

  return new Response(
    new ReadableStream({
      async start(controller) {
        const emitChunk = (chunk: any) =>
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
          );
        const flush = () => {
          for (const chunk of fixer.flush()) emitChunk(chunk);
        };
        const processEvent = (event: string) => {
          const data = eventData(event);
          if (!data) {
            controller.enqueue(encoder.encode(`${event}\n\n`));
            return;
          }
          if (data === "[DONE]") {
            flush();
            controller.enqueue(encoder.encode(`${event}\n\n`));
            return;
          }
          try {
            const parsed = JSON.parse(data);
            for (const chunk of fixer.transform(parsed)) emitChunk(chunk);
          } catch {
            controller.enqueue(encoder.encode(`${event}\n\n`));
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
              if (buffer) processEvent(buffer);
              flush();
              controller.close();
              break;
            }
          }
        } catch (error) {
          controller.error(error);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    }),
    {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    },
  );
}
