const DATA_AVATAR_PATTERN = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml|x-icon));base64,([A-Za-z0-9+/=]+)$/i;

export interface ParsedAvatar {
  mimeType: string;
  bytes: Uint8Array;
}

export function isDataAvatar(value: string | null | undefined): boolean {
  return value != null && DATA_AVATAR_PATTERN.test(value);
}

export function parseDataAvatar(value: string): ParsedAvatar | null {
  const match = DATA_AVATAR_PATTERN.exec(value);
  if (!match) return null;
  try {
    const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
    if (!bytes.length) return null;
    return { mimeType: match[1].toLowerCase(), bytes };
  } catch {
    return null;
  }
}

export function avatarHash(value: string): string | null {
  const parsed = parseDataAvatar(value);
  if (!parsed) return null;
  return new Bun.CryptoHasher("sha256").update(parsed.bytes).digest("hex");
}

export function avatarMediaUrl(id: string, value: string): string {
  const hash = avatarHash(value);
  if (!hash) throw new Error("Invalid avatar data URL");
  return `/api/media/avatars/${encodeURIComponent(id)}/${hash}`;
}

export function avatarResponseHeaders(mimeType: string, hash: string): Headers {
  return new Headers({
    "Content-Type": mimeType,
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: `"${hash}"`,
    "X-Content-Type-Options": "nosniff",
  });
}
