import type { DeviceFingerprint } from "./antigravity.types";

function stableId(value: string) {
  return new Bun.CryptoHasher("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 16);
}
export function generateFingerprint(email: string): DeviceFingerprint {
  const device = stableId(email);
  return {
    userAgent: "antigravity/2.0.1 darwin/arm64",
    quotaUser: `device-${device}`,
    deviceId: device,
    platform: "darwin/arm64",
    apiClient: "google-cloud-sdk vscode/1.96.0",
    ideType: "VSCODE",
    platformName: "MACOS",
    sessionToken: crypto.randomUUID().replaceAll("-", ""),
    cliUserAgent: "google-api-nodejs-client/10.3.0",
    cliApiClient: "gl-node/22.18.0",
    clientMetadata: {
      ideType: "VSCODE",
      platform: "MACOS",
      pluginType: "GEMINI",
      osVersion: "15.1",
      arch: "arm64",
      sqmId: crypto.randomUUID(),
    },
    createdAt: Date.now(),
  };
}
export function getImpersonationHeaders(
  token: string,
  fp: DeviceFingerprint,
  model?: string,
) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Antigravity/2.0.1 Chrome/138.0.7204.235 Electron/37.3.1 Safari/537.36",
    "X-Goog-Api-Client": fp.apiClient,
    "X-Goog-QuotaUser": fp.quotaUser,
    "X-Client-Device-Id": fp.deviceId,
    "Client-Metadata": JSON.stringify(fp.clientMetadata),
    ...(model?.includes("claude")
      ? { "anthropic-beta": "interleaved-thinking-2025-05-14" }
      : {}),
  };
}
export function getGeminiCliHeaders(token: string, fp: DeviceFingerprint) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json; charset=utf-8",
    "User-Agent": fp.cliUserAgent,
    "X-Goog-Api-Client": fp.cliApiClient,
    "X-Goog-QuotaUser": fp.quotaUser,
    "X-Client-Device-Id": fp.deviceId,
    "Client-Metadata": Object.entries(fp.clientMetadata ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join(","),
  };
}
