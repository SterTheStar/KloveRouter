/**
 * Shared incremental SSE parsing helpers.
 *
 * Every SSE consumer in the codebase (proxy streams, codex, conol, antigravity,
 * panel chat) receives text chunks from a `Response` body and needs the same
 * three steps: split the buffer into complete events on blank lines (tolerating
 * CRLF line endings), pull the `data:` payload out of an event (joining
 * multiline data per the SSE spec), and skip comments/keep-alives.
 */

export const SSE_DONE = "[DONE]";

export function createSseSplitter(): (chunk: string) => string[] {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk;
    const events = buffer.split(/\r\n\r\n|\r\r|\n\n/);
    buffer = events.pop() ?? "";
    return events;
  };
}

export function extractSseData(event: string): string {
  return event
    .split(/\r\n|\r|\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n")
    .trim();
}

export function extractSseEvents(text: string): Array<{
  data: string;
  rest: Record<string, string>;
}> {
  return splitSseEvents(text).map((event) => {
    const dataLines: string[] = [];
    const rest: Record<string, string> = {};
    for (const line of event.split(/\r\n|\r|\n/)) {
      if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
      else if (line.includes(":")) {
        const index = line.indexOf(":");
        const field = line.slice(0, index);
        if (field !== "data") rest[field] = line.slice(index + 1).replace(/^ /, "");
      }
    }
    return { data: dataLines.join("\n").trim(), rest };
  });
}

export function splitSseEvents(text: string): string[] {
  return text.split(/\r\n\r\n|\r\r|\n\n/).filter((event) => event.trim().length > 0);
}
