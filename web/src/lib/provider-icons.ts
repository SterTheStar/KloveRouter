/**
 * Single source of truth for provider icon URLs on the client.
 * Mirrors the server-side candidate order in src/services/avatar.service.ts.
 */

const protocolIcons: Partial<Record<string, string>> = {
  antigravity: "https://antigravity.google/assets/image/brand/antigravity-icon__full-color.png",
  chatgpt: "https://chatgpt.com/favicon.ico",
  codex: "https://openai.com/favicon.ico",
  freebuff: "https://freebuff.com/favicon.ico",
  qwen: "https://assets.alicdn.com/g/qwenweb/qwen-webui-fe/0.0.201/favicon.png",
  atomesus: "https://atomesus.com/favicon.ico",
};

/** Google favicon service URL for the host of an endpoint, or null when it cannot be parsed. */
export function faviconForEndpoint(endpoint: string): string | null {
  try {
    const hostname = new URL(endpoint).hostname;
    if (!hostname) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  } catch {
    return null;
  }
}

/** Brand icon for a protocol, when one is known. */
export function protocolIcon(protocol: string | undefined): string | null {
  return (protocol && protocolIcons[protocol]) || null;
}

/** Whether a value is a custom avatar the user may persist (data image or http(s) URL). */
export function isPersistableAvatar(value: string | null | undefined): value is string {
  return !!value && (/^data:image\//i.test(value) || /^https?:\/\//i.test(value));
}

/** Whether a logo URL was derived from an endpoint and must not be persisted. */
export function isEndpointFavicon(url: string): boolean {
  return url.startsWith("https://www.google.com/s2/favicons?");
}

const dataUrlCache = new Map<string, Promise<string | null>>();

/**
 * Converts a bundled or remote logo into a data URL so it can be stored as the
 * provider's own avatar. Bundled Vite assets are served from the frontend origin,
 * which the backend cannot fetch, so their bytes are embedded instead.
 * Returns null when the image cannot be read, in which case the caller falls back to no avatar.
 */
export function logoToDataUrl(url: string): Promise<string | null> {
  const cached = dataUrlCache.get(url);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!blob.type.startsWith("image/") || blob.size > 25 * 1024 * 1024) return null;
      return await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  })();
  dataUrlCache.set(url, pending);
  return pending;
}
