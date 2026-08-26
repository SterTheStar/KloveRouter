const openingTag = /<think\s*>/i;
const closingTag = /<\/think\s*>/i;

type BufferedChoice = {
  base: Record<string, unknown>;
  choice: any;
};

type ChoiceState = {
  content: string;
  buffered: BufferedChoice[];
  decided: boolean;
};

function needsOpeningTag(content: string): boolean {
  const closing = closingTag.exec(content);
  if (!closing) return false;
  const opening = openingTag.exec(content);
  return !opening || opening.index > closing.index;
}

export function fixMissingThinkOpeningTag(completion: any, enabled = true) {
  if (!enabled) return completion;
  for (const choice of completion?.choices ?? []) {
    const content = choice?.message?.content;
    if (typeof content === "string" && needsOpeningTag(content))
      choice.message.content = `<think>${content}`;
  }
  return completion;
}

export class ThinkTagChunkFixer {
  private readonly states = new Map<number, ChoiceState>();

  transform(chunk: any): any[] {
    if (!Array.isArray(chunk?.choices) || chunk.choices.length === 0)
      return [chunk];

    const output: any[] = [];
    const base = { ...chunk };
    delete base.choices;

    for (const choice of chunk.choices) {
      const index = Number(choice?.index ?? 0);
      let state = this.states.get(index);
      if (!state) {
        state = { content: "", buffered: [], decided: false };
        this.states.set(index, state);
      }
      if (state.decided) {
        output.push({ ...base, choices: [choice] });
        continue;
      }

      state.buffered.push({ base, choice });
      const content = choice?.delta?.content;
      if (typeof content === "string") state.content += content;

      const opening = openingTag.exec(state.content);
      const closing = closingTag.exec(state.content);
      if (closing && (!opening || closing.index < opening.index)) {
        this.release(state, output, true);
      } else if (opening) {
        this.release(state, output, false);
      }
    }
    return output;
  }

  flush(): any[] {
    const output: any[] = [];
    for (const state of this.states.values()) {
      if (!state.decided) this.release(state, output, false);
    }
    return output;
  }

  private release(state: ChoiceState, output: any[], prefix: boolean) {
    let prefixed = false;
    for (const item of state.buffered) {
      let choice = item.choice;
      if (
        prefix &&
        !prefixed &&
        typeof choice?.delta?.content === "string"
      ) {
        choice = {
          ...choice,
          delta: {
            ...choice.delta,
            content: `<think>${choice.delta.content}`,
          },
        };
        prefixed = true;
      }
      output.push({ ...item.base, choices: [choice] });
    }
    state.buffered = [];
    state.decided = true;
  }
}

export function fixThinkTagAsyncIterable<T extends AsyncIterable<any>>(
  stream: T,
  enabled = true,
): T {
  if (!enabled) return stream;
  const fixer = new ThinkTagChunkFixer();
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

export function fixThinkTagSseResponse(response: Response, enabled = true) {
  if (!enabled || !response.body) return response;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const fixer = new ThinkTagChunkFixer();
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
