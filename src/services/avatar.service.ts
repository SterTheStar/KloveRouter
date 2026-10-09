import type { ProviderProtocol } from "./provider-appearance";

/** Upper bound for a decoded uploaded image, in bytes. */
export const MAX_AVATAR_BYTES = 25 * 1024 * 1024;

const DATA_AVATAR_PATTERN =
  /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml|x-icon));base64,([A-Za-z0-9+/]+={0,2})$/i;

/** Brand icons for protocols that do not expose a usable public base URL. */
const protocolIcons: Partial<Record<ProviderProtocol, string>> = {
  antigravity: "https://antigravity.google/assets/image/brand/antigravity-icon__full-color.png",
  chatgpt: "https://chatgpt.com/favicon.ico",
  codex: "https://openai.com/favicon.ico",
  freebuff: "https://freebuff.com/favicon.ico",
  qwen: "https://assets.alicdn.com/g/qwenweb/qwen-webui-fe/0.0.201/favicon.png",
  atomesus: "https://atomesus.com/favicon.ico",
};

export interface ParsedAvatar {
  mimeType: string;
  bytes: Uint8Array;
}

export interface AvatarOwner {
  id: string;
  /** Custom avatar persisted by the user. Null means "use the detected icon". */
  avatar: string | null;
  protocol: ProviderProtocol;
  baseUrl: string;
}

export interface PublicAvatar {
  /** URL the UI should render first, or null when only initials can be shown. */
  avatar: string | null;
  /** Fallback URLs, in order. Never contains raw data URLs. */
  sources: string[];
}

/** Parses a supported `data:image/...;base64,...` value within the size limit, or returns null. */
export function parseDataAvatar(value: string): ParsedAvatar | null {
  const match = DATA_AVATAR_PATTERN.exec(value);
  if (!match) return null;
  const bytes = new Uint8Array(Buffer.from(match[2], "base64"));
  if (!bytes.byteLength || bytes.byteLength > MAX_AVATAR_BYTES) return null;
  return { mimeType: match[1].toLowerCase(), bytes };
}

export function isDataAvatar(value: string | null | undefined): value is string {
  return value != null && parseDataAvatar(value) !== null;
}

/** SHA-256 of the decoded bytes, used as the content-addressed media path segment. */
export function avatarHash(value: string): string | null {
  const parsed = parseDataAvatar(value);
  if (!parsed) return null;
  return new Bun.CryptoHasher("sha256").update(parsed.bytes).digest("hex");
}

export function avatarMediaUrl(ownerId: string, value: string): string {
  const hash = avatarHash(value);
  if (!hash) throw new Error("Invalid avatar data URL");
  return `/api/media/avatars/${encodeURIComponent(ownerId)}/${hash}`;
}

export function avatarResponseHeaders(mimeType: string, hash: string): Headers {
  return new Headers({
    "Content-Type": mimeType,
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: `"${hash}"`,
    "X-Content-Type-Options": "nosniff",
  });
}

/** Validates a user-supplied avatar: empty (no custom avatar), a supported data image, or an http(s) URL. */
export function isValidAvatar(value: string | null | undefined): boolean {
  if (value == null || value === "") return true;
  if (value.startsWith("data:")) return isDataAvatar(value);
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Google favicon service URL for the host of a base URL, or null when unparseable. */
export function faviconUrl(baseUrl: string): string | null {
  try {
    const hostname = new URL(baseUrl).hostname;
    if (!hostname) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  } catch {
    return null;
  }
}

/** Ordered, deduplicated candidate icons: custom avatar, then brand icon, then favicon. */
export function avatarCandidates(owner: Pick<AvatarOwner, "avatar" | "protocol" | "baseUrl">): string[] {
  const candidates = [owner.avatar, protocolIcons[owner.protocol] ?? null, faviconUrl(owner.baseUrl)];
  return [...new Set(candidates.filter((value): value is string => Boolean(value)))];
}

/**
 * Public representation of a provider's avatar. Raw data URLs are replaced by
 * content-addressed media URLs, and are never included in `sources`.
 */
export function publicAvatar(owner: AvatarOwner): PublicAvatar {
  const toPublicUrl = (value: string) => (isDataAvatar(value) ? avatarMediaUrl(owner.id, value) : value);
  const [first = null, ...rest] = avatarCandidates(owner);
  const avatar = first ? toPublicUrl(first) : null;
  const sources = rest.filter((value) => !isDataAvatar(value)).map(toPublicUrl);
  return { avatar, sources: sources.filter((value) => value !== avatar) };
}
