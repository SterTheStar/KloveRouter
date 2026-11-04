const activeGenerations = new Map<string, AbortController>();
const liveOutput = new Map<string, { reasoning: string; content: string }>();

function key(chatId: string, messageId: string) {
  return `${chatId}:${messageId}`;
}

export interface LiveOutput {
  reasoning: string;
  content: string;
}

export const chatGenerationService = {
  start(chatId: string, messageId: string, controller: AbortController) {
    activeGenerations.set(key(chatId, messageId), controller);
    liveOutput.set(key(chatId, messageId), { reasoning: "", content: "" });
  },

  finish(chatId: string, messageId: string) {
    activeGenerations.delete(key(chatId, messageId));
    liveOutput.delete(key(chatId, messageId));
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

  /**
   * Records the text produced so far so a second viewer (or a tab that
   * reconnects) can render the live response without reloading the chat.
   */
  publish(chatId: string, messageId: string, output: LiveOutput) {
    const entry = liveOutput.get(key(chatId, messageId));
    if (!entry) return;
    entry.reasoning = output.reasoning;
    entry.content = output.content;
  },

  output(chatId: string, messageId: string): LiveOutput | undefined {
    return liveOutput.get(key(chatId, messageId));
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
