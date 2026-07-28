import { rtkBinary } from "./rtk.binary";
import { getDb } from "../../db/connection";
import { logger } from "../../logger";
import type { RtkStatus } from "./rtk.types";

function normalizeVersion(v: string | null): string {
  if (!v) return "";
  return v.replace(/^rtk\s*/i, "").replace(/^v/, "").trim();
}

class RtkManager {
  private _enabled = false;
  private _initialized = false;

  get enabled(): boolean {
    return this._enabled;
  }

  get initialized(): boolean {
    return this._initialized;
  }

  async initialize(): Promise<void> {
    if (this._initialized) return;
    this._initialized = true;
    logger.info("RTK manager initialized");
  }

  async enable(): Promise<void> {
    await this.initialize();
    if (this._enabled) return;

    try {
      logger.info("Enabling RTK...");

      await rtkBinary.ensureBinary();
      await rtkBinary.initializeOpenCode();

      this._enabled = true;
      logger.success("RTK enabled");
    } catch (error) {
      this._enabled = false;
      logger.error("Failed to enable RTK", { error });
      throw error;
    }
  }

  async disable(): Promise<void> {
    this._enabled = false;
    await rtkBinary.disableOpenCode();
    logger.info("RTK disabled");
  }

  async getStatus(): Promise<RtkStatus> {
    const installed = await rtkBinary.isInstalled();
    const binPath = rtkBinary.binaryPath();
    const version = installed ? await rtkBinary.getVersion() : null;
    let latestVersion: string | null = null;
    let updateAvailable = false;

    if (installed) {
      latestVersion = await rtkBinary.checkLatestVersion();
      const current = await rtkBinary.currentVersion();
      updateAvailable = latestVersion
        ? normalizeVersion(latestVersion) !== normalizeVersion(current)
        : false;
    }

    const db = getDb();
    const row = db
      .query("SELECT value FROM settings WHERE key = ?")
      .get("rtk_enabled") as { value: string } | undefined;
    const enabledFromDb = row?.value === "1";

    return {
      installed,
      enabled: enabledFromDb,
      version,
      binaryPath: installed ? binPath : null,
      platform: installed ? (rtkBinary.detectPlatform() as any) : null,
      arch: installed ? (rtkBinary.detectArch() as any) : null,
      configPath: installed ? rtkBinary.configPath() : null,
      downloadUrl: rtkBinary.getDownloadUrl(),
      latestVersion,
      updateAvailable,
    };
  }
}

export const rtkManager = new RtkManager();
