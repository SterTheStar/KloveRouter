export type CavemanLevel = "lite" | "full" | "ultra" | "wenyan-lite" | "wenyan-full" | "wenyan-ultra";

export interface CavemanStatus {
  enabled: boolean;
  level: CavemanLevel;
  installed: boolean;
  version: string | null;
  skillPath: string | null;
}
