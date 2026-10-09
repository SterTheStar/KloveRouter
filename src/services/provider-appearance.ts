export type ProviderProtocol =
  | "openai"
  | "openai-responses"
  | "anthropic"
  | "codex"
  | "chatgpt"
  | "antigravity"
  | "freebuff"
  | "qwen"
  | "atomesus"
  | "conol";

export function isOpenAICompatibleProtocol(protocol: ProviderProtocol): boolean {
  return protocol === "openai" || protocol === "openai-responses";
}

export const openCodeProviderIds = new Set(["opencode", "opencodezen", "opencodezengo"]);

export function isOpenCodeProvider(name: string): boolean {
  return openCodeProviderIds.has(name.toLowerCase().replace(/[\s_-]+/g, ""));
}
