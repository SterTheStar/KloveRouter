import type { ChatMessage, ChatSession } from "../types";

function messageText(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
}

/**
 * Builds a downloadable Markdown transcript of a chat. Thinking blocks and
 * per-message stats are included when present.
 */
export function chatToMarkdown(
  session: ChatSession,
  messages: ChatMessage[],
  modelNames: Record<string, string> = {},
): string {
  const exportedAt = new Date().toLocaleString();
  const lines: string[] = [
    `# ${session.title || "Chat"}`,
    "",
    `- **Model:** ${session.model || "—"}${modelNames[session.model] ? ` (${modelNames[session.model]})` : ""}`,
    `- **Exported:** ${exportedAt}`,
    "",
    "---",
    "",
  ];

  for (const message of messages) {
    const speaker = message.role === "user" ? "👤 **You**" : "🤖 **Assistant**";
    lines.push(`### ${speaker}`, "");
    const text = messageText(message.content).trim();
    if (message.reasoning?.trim()) {
      lines.push("<details><summary>Thinking</summary>", "", "```text");
      lines.push(...message.reasoning.trim().split("\n"));
      lines.push("```", "", "</details>", "");
    }
    if (text) lines.push(...text.split("\n"), "");
    else if (!message.reasoning?.trim()) lines.push("_(empty)_", "");
    if (message.error) lines.push(`> ⚠️ Error: ${message.error}`, "");
    if (message.stats) {
      const { prompt_tokens, completion_tokens, duration_ms, tps, model } = message.stats;
      const parts = [
        model ? `model: ${modelNames[model] ?? model}` : null,
        `in: ${prompt_tokens ?? 0} tok`,
        `out: ${completion_tokens ?? 0} tok`,
        duration_ms ? `${(duration_ms / 1000).toFixed(1)}s` : null,
        tps ? `${tps.toFixed(1)} tok/s` : null,
      ].filter(Boolean);
      if (parts.length) lines.push(`<sub>${parts.join(" · ")}</sub>`, "");
    }
    lines.push("---", "");
  }

  return lines.join("\n");
}

export function downloadChatMarkdown(
  session: ChatSession,
  messages: ChatMessage[],
  modelNames: Record<string, string> = {},
): void {
  const markdown = chatToMarkdown(session, messages, modelNames);
  const slug = (session.title || "chat")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "chat";
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slug}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
