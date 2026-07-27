import { existsSync } from "node:fs";
import { rtkBinary } from "./rtk.binary";
import { rtkConfig } from "./rtk.config";
import { getDb } from "../../db/connection";
import { logger } from "../../logger";
import type { RtkStatus } from "./rtk.types";

function normalizeVersion(v: string | null): string {
  if (!v) return "";
  return v.replace(/^rtk\s*/i, "").replace(/^v/, "").trim();
}

class RtkManager {
  private process: Bun.Subprocess | null = null;
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
    if (this._enabled) return;

    try {
      logger.info("Enabling RTK...");

      await rtkBinary.ensureBinary();
      await rtkConfig.ensureConfig();
      await rtkConfig.ensureConfigDir();

      this._enabled = true;
      logger.success("RTK enabled");
    } catch (error) {
      this._enabled = false;
      logger.error("Failed to enable RTK", { error });
      throw error;
    }
  }

  disable(): void {
    this.stopDaemon();
    this._enabled = false;
    logger.info("RTK disabled");
  }

  startDaemon(): void {
    if (this.process) return;
    if (!this._enabled) return;

    const binPath = rtkBinary.binaryPath();
    if (!existsSync(binPath)) {
      logger.warn("Cannot start RTK daemon: binary not found");
      return;
    }

    try {
      this.process = Bun.spawn([binPath, "proxy"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      this.process.exited.then((code) => {
        logger.info(`RTK daemon exited with code ${code}`);
        this.process = null;
      });

      logger.info(`RTK daemon started (pid: ${this.process.pid})`);
    } catch (error) {
      logger.error("Failed to start RTK daemon", { error });
    }
  }

  stopDaemon(): void {
    if (!this.process) return;

    try {
      this.process.kill();
      logger.info(`RTK daemon stopped (pid: ${this.process.pid})`);
    } catch (error) {
      logger.error("Failed to stop RTK daemon", { error });
    }

    this.process = null;
  }

  getPid(): number | null {
    return this.process?.pid ?? null;
  }

  async getStatus(): Promise<RtkStatus> {
    const installed = await rtkBinary.isInstalled();
    const version = await rtkBinary.getVersion();
    const binPath = rtkBinary.binaryPath();
    const cfgPath = rtkConfig.configPath();

    const [latestVersion, updateAvailable] = installed
      ? await Promise.all([
          rtkBinary.checkLatestVersion(),
          rtkBinary.currentVersion().then((cur) =>
            rtkBinary.checkLatestVersion().then((latest) => {
              if (!latest) return false;
              return normalizeVersion(latest) !== normalizeVersion(cur);
            }),
          ),
        ])
      : [null, false];

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
      pid: this.getPid(),
      configPath: existsSync(cfgPath) ? cfgPath : null,
      downloadUrl: rtkBinary.getDownloadUrl(),
      latestVersion,
      updateAvailable,
    };
  }
}

export const rtkManager = new RtkManager();
