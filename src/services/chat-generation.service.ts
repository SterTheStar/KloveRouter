const activeGenerations = new Map<string, AbortController>();

function key(chatId: string, messageId: string) {
  return `${chatId}:${messageId}`;
}

export const chatGenerationService = {
  start(chatId: string, messageId: string, controller: AbortController) {
    activeGenerations.set(key(chatId, messageId), controller);
  },

  finish(chatId: string, messageId: string) {
    activeGenerations.delete(key(chatId, messageId));
  },

  isActive(chatId: string, messageId: string) {
    return activeGenerations.has(key(chatId, messageId));
  },

  activeMessageIds(chatId: string) {
    const prefix = `${chatId}:`;
    return [...activeGenerations.keys()]
      .filter((entry) => entry.startsWith(prefix))
      .map((entry) => entry.slice(prefix.length));
  },

  async waitForIdle(chatId: string, messageId: string, timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    while (activeGenerations.has(key(chatId, messageId)) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  },

  stop(chatId: string, messageId: string) {
    const controller = activeGenerations.get(key(chatId, messageId));
    if (!controller) return false;
    controller.abort(new DOMException("Generation stopped by user. The partial response was saved.", "AbortError"));
    return true;
  },
};
