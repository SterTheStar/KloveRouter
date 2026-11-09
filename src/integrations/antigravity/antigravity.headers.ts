import type { DeviceFingerprint } from "./antigravity.types";

function stableId(value: string) {
  return new Bun.CryptoHasher("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 16);
}

export function buildHubUserAgent(version = "2.26.0"): string {
  const platform =
    process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
        ? "darwin"
        : "linux";
  const arch = process.arch === "x64" ? "amd64" : process.arch === "arm64" ? "arm64" : process.arch;
  return `antigravity/hub/${version} (aidev_client; os_type=${platform}; arch=${arch})`;
}

export function generateFingerprint(email: string): DeviceFingerprint {
  const device = stableId(email);
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const platform =
    process.platform === "darwin"
      ? "darwin"
      : process.platform === "win32"
        ? "win32"
        : "linux";
  return {
    userAgent: buildHubUserAgent(),
    quotaUser: `device-${device}`,
    deviceId: device,
    platform: `${platform}/${arch}`,
    apiClient: "gl-node/18.18.2 fire/0.8.6 grpc/1.10.x",
    ideType: "ANTIGRAVITY",
    platformName: platform.toUpperCase(),
    sessionToken: crypto.randomUUID().replaceAll("-", ""),
    cliUserAgent: "google-api-nodejs-client/10.3.0",
    cliApiClient: "gl-node/22.18.0",
    clientMetadata: {
      ideType: "ANTIGRAVITY",
      platform: platform.toUpperCase(),
      pluginType: "GEMINI",
      osVersion: "15.1",
      arch,
      sqmId: crypto.randomUUID(),
    },
    createdAt: Date.now(),
  };
}

export function getImpersonationHeaders(
  token: string,
  fp: DeviceFingerprint,
  model?: string,
  sessionId?: string,
  accept = "application/json",
) {
  const isClaude = model?.toLowerCase().includes("claude");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": fp.userAgent || "antigravity/hub/2.25.0 linux/x64",
    "X-Client-Name": "antigravity",
    "X-Client-Version": "1.110.0",
    "x-goog-api-client": fp.apiClient || "gl-node/18.18.2 fire/0.8.6 grpc/1.10.x",
    "X-Goog-QuotaUser": fp.quotaUser,
    "X-Client-Device-Id": fp.deviceId,
    ...(sessionId ? { "X-Machine-Session-Id": sessionId } : {}),
    ...(accept && accept !== "application/json" ? { Accept: accept } : {}),
    ...(isClaude
      ? { "anthropic-beta": "interleaved-thinking-2025-05-14" }
      : {}),
  };
}

export function getGeminiCliHeaders(token: string, fp: DeviceFingerprint) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json; charset=utf-8",
    "User-Agent": fp.cliUserAgent || "antigravity/hub/2.25.0 linux/x64",
    "X-Client-Name": "antigravity",
    "X-Client-Version": "1.110.0",
    "x-goog-api-client": fp.cliApiClient || "gl-node/22.18.0",
    "X-Goog-QuotaUser": fp.quotaUser,
    "X-Client-Device-Id": fp.deviceId,
  };
}
