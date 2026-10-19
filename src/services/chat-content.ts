/**
 * Flattens a persisted chat message content (a string or an array of
 * multimodal parts) into the plain text used for full-text search.
 */
export function textContentOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const record = content as Record<string, unknown>;
    const pieces = [typeof record.content === "string" ? record.content : "", typeof (record.audio as any)?.transcript === "string" ? (record.audio as any).transcript : ""];
    return pieces.filter(Boolean).join("\n").trim() || (content == null ? "" : String(content));
  }
  if (!Array.isArray(content)) return content == null ? "" : String(content);
  return content
    .map((part: any) => (part && typeof part === "object" && typeof part.text === "string" ? part.text : ""))
    .join("\n");
}
