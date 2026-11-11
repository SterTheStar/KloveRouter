type ContentPart =
  | string
  | { type?: string; text?: string; image_url?: { url?: string }; [key: string]: unknown };

export type ChatMessage = {
  role?: string;
  content?: string | ContentPart[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: unknown };
  }>;
};

export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if (typeof (part as any).text === "string") return (part as any).text;
      if ((part as any).type === "image_url" || (part as any).type === "image")
        return "[image supplied]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function renderToolsDocumentation(tools: any[]): string {
  if (!Array.isArray(tools) || !tools.length) return "";
  const lines: string[] = ["# AVAILABLE TOOLS", ""];
  for (const tool of tools) {
    const fn = tool?.function || {};
    const name = fn.name || "unnamed";
    lines.push(`## ${name}`);
    if (typeof fn.description === "string" && fn.description.trim()) {
      lines.push(fn.description.trim());
    }
    const schema = fn.parameters || {};
    lines.push("Parameters JSON Schema:");
    lines.push(JSON.stringify(schema, null, 2));
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function formatClaudeAgentPrompt(
  messages: ChatMessage[],
  tools?: any[],
): { systemPrompt: string | undefined; prompt: string } {
  const systemParts: string[] = [];
  const nonSystemMessages: ChatMessage[] = [];

  for (const message of messages) {
    const role = (message.role || "user").toLowerCase();
    if (role === "system" || role === "developer") {
      const text = contentText(message.content);
      if (text.trim()) systemParts.push(text.trim());
    } else {
      nonSystemMessages.push(message);
    }
  }

  if (Array.isArray(tools) && tools.length > 0) {
    const toolsDoc = renderToolsDocumentation(tools);
    if (toolsDoc) systemParts.push(toolsDoc);
  }

  const systemPrompt = systemParts.length > 0 ? systemParts.join("\n\n") : undefined;

  // Single message optimization: if there's only 1 user message, return its content cleanly
  if (nonSystemMessages.length === 1 && nonSystemMessages[0].role === "user") {
    const text = contentText(nonSystemMessages[0].content);
    return { systemPrompt, prompt: text || "Hello" };
  }

  // Multi-turn transcript conversion:
  const transcript: string[] = [];
  for (const message of nonSystemMessages) {
    const role = (message.role || "user").toLowerCase();

    if (role === "tool") {
      const callId = message.tool_call_id || message.name || "tool";
      const text = contentText(message.content);
      transcript.push(`<tool_result id="${callId}">\n${text}\n</tool_result>`);
      continue;
    }

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const call of message.tool_calls) {
        const fn = call.function || {};
        let args = fn.arguments;
        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {
            // Keep original string if not valid JSON
          }
        }
        transcript.push(
          `<tool_call id="${call.id || "call_1"}">\n${JSON.stringify({
            name: fn.name,
            arguments: args ?? {},
          })}\n</tool_call>`,
        );
      }
    }

    const text = contentText(message.content);
    if (!text.trim()) continue;

    if (role === "assistant") {
      transcript.push(`<assistant>\n${text}\n</assistant>`);
    } else {
      transcript.push(`<user>\n${text}\n</user>`);
    }
  }

  const prompt = transcript.join("\n\n").trim();
  return { systemPrompt, prompt: prompt || "Hello" };
}
