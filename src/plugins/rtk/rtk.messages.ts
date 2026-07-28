type Message = Record<string, any>;

export async function filterLastToolMessage(
  messages: Message[],
  filter: (content: string) => Promise<string>,
): Promise<Message[]> {
  if (messages.length === 0) return messages;

  const index = messages.length - 1;
  const message = messages[index];
  if (message?.role !== "tool") return messages;

  if (typeof message.content === "string") {
    const content = await filter(message.content);
    if (content === message.content) return messages;
    const updated = [...messages];
    updated[index] = { ...message, content };
    return updated;
  }

  if (!Array.isArray(message.content)) return messages;

  let changed = false;
  const content = await Promise.all(
    message.content.map(async (part: any) => {
      if (part?.type !== "text" || typeof part.text !== "string") return part;
      const text = await filter(part.text);
      if (text === part.text) return part;
      changed = true;
      return { ...part, text };
    }),
  );
  if (!changed) return messages;

  const updated = [...messages];
  updated[index] = { ...message, content };
  return updated;
}
