export type ProviderProtocol =
  | "openai"
  | "anthropic"
  | "codex"
  | "antigravity"
  | "freebuff"
  | "qwen"
  | "atomesus";

const protocolIcons: Partial<Record<ProviderProtocol, string>> = {
  antigravity: "https://antigravity.google/assets/image/brand/antigravity-icon__full-color.png",
  codex: "https://openai.com/favicon.ico",
  freebuff: "https://freebuff.com/favicon.ico",
  qwen: "https://assets.alicdn.com/g/qwenweb/qwen-webui-fe/0.0.201/favicon.png",
  atomesus: "https://atomesus.com/favicon.ico",
};

export function faviconUrl(baseUrl: string): string | null {
  try {
    const hostname = new URL(baseUrl).hostname;
    if (!hostname) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  } catch {
    return null;
  }
}

export function resolveProviderAvatar(
  avatar: string | null | undefined,
  protocol: ProviderProtocol,
  baseUrl: string,
): string | null {
  return avatar || protocolIcons[protocol] || faviconUrl(baseUrl);
}

export function isValidAvatar(value: string | null | undefined): boolean {
  if (value == null || value === "") return true;
  if (Buffer.byteLength(value, "utf8") > 1_500_000) return false;
  if (/^data:image\/(png|jpeg|webp|gif|svg\+xml|x-icon);base64,/i.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
