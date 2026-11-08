export function validateChatCompletionRequest(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Request body must be a JSON object with model and messages";
  const request = body as Record<string, unknown>;
  if (typeof request.model !== "string" || !request.model.trim())
    return "model is required and must be a non-empty string";
  if (!Array.isArray(request.messages)) return "messages must be an array";
  if (request.messages.length === 0) return "messages must contain at least one message";
  for (const [index, message] of request.messages.entries()) {
    if (!message || typeof message !== "object" || Array.isArray(message))
      return `messages[${index}] must be an object`;
    const record = message as Record<string, unknown>;
    if (typeof record.role !== "string" || !record.role.trim())
      return `messages[${index}].role is required and must be a string`;
    const content = record.content;
    const hasContent = typeof content === "string" || Array.isArray(content);
    const hasToolCall = Array.isArray(record.tool_calls) || typeof record.function_call === "object" && record.function_call !== null;
    if (!hasContent && !hasToolCall && record.role !== "assistant")
      return `messages[${index}].content must be a string or content parts array`;
  }
  return null;
}
