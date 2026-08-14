export function validateChatCompletionRequest(body: unknown): string | null {
  if (!body || typeof body !== "object") return "model and messages are required";
  const request = body as Record<string, unknown>;
  if (typeof request.model !== "string" || !request.model.trim())
    return "model and messages are required";
  if (!Array.isArray(request.messages)) return "model and messages are required";
  return null;
}
