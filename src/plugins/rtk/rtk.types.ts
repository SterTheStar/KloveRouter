export type RtkPlatform = "linux" | "darwin" | "windows";

export type RtkArch = "x86_64" | "aarch64";

export interface RtkBinaryInfo {
  platform: RtkPlatform;
  arch: RtkArch;
  filename: string;
  url: string;
}

export interface RtkStatus {
  installed: boolean;
  enabled: boolean;
  version: string | null;
  binaryPath: string | null;
  platform: RtkPlatform | null;
  arch: RtkArch | null;
  downloadUrl: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
}
