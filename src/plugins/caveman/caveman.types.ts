export type CavemanCanonicalLevel = "caveman" | "ultracave" | "megacave";

export type CavemanLegacyLevel =
  | "ultra"
  | "wenyan"
  | "lite"
  | "full"
  | "wenyan-lite"
  | "wenyan-full"
  | "wenyan-ultra";

export type CavemanLevel = CavemanCanonicalLevel | CavemanLegacyLevel;

export interface CavemanStatus {
  enabled: boolean;
  level: CavemanLevel;
  installed: boolean;
  version: string | null;
  skillPath?: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
}
