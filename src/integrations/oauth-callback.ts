type OAuthProvider = "codex" | "antigravity";

const callbackPaths: Record<OAuthProvider, string> = {
  codex: "/auth/callback",
  antigravity: "/antigravity/callback",
};

export function parseManualOAuthCallback(callbackUrl: string, provider: OAuthProvider) {
  let url: URL;
  try {
    url = new URL(callbackUrl.trim());
  } catch {
    throw new Error("Invalid callback URL");
  }

  if (url.protocol !== "http:" || url.hostname !== "localhost" || url.port !== "1455" || url.pathname !== callbackPaths[provider] || url.username || url.password) {
    throw new Error(`Expected the ${provider === "codex" ? "Codex" : "Antigravity"} localhost callback URL`);
  }
  if (url.searchParams.has("error")) throw new Error("OAuth authorization was denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) throw new Error("Callback URL is missing the OAuth code or state");
  return { code, state };
}
