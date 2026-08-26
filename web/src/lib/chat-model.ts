import type { ChatMessage } from "../types";

export function resolveChatModel(
  sessionModel: string,
  messages: ChatMessage[],
  globalModel: string | null,
  validModelIds: ReadonlySet<string>,
): string | null {
  if (validModelIds.has(sessionModel)) return sessionModel;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const statsModel = message.role === "assistant" ? message.stats?.model : null;
    if (statsModel && validModelIds.has(statsModel)) return statsModel;
  }

  return globalModel && validModelIds.has(globalModel) ? globalModel : null;
}
