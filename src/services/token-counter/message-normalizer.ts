export type TokenMessage = { role?: string; content?: unknown };

export function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part && (part.type === "text" || part.type === "input_text"))
    .map((part) => typeof part.text === "string" ? part.text : "")
    .join("\n");
}

export function messageText(message: TokenMessage): string {
  return textFromContent(message.content);
}

export function normalizeMessages(messages: unknown): { role: string; content: string }[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message): message is TokenMessage => Boolean(message) && typeof message === "object")
    .map((message) => ({ role: String(message.role ?? "user"), content: messageText(message) }))
    .filter((message) => message.content.length > 0);
}

export function serializeMessages(messages: unknown): string {
  return normalizeMessages(messages)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
}
