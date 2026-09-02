/**
 * Flattens a persisted chat message content (a string or an array of
 * multimodal parts) into the plain text used for full-text search.
 */
export function textContentOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content == null ? "" : String(content);
  return content
    .map((part: any) => (part && typeof part === "object" && typeof part.text === "string" ? part.text : ""))
    .join("\n");
}
