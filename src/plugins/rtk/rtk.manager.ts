import { existsSync, mkdirSync } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { rtkBinary } from "./rtk.binary";
import { rtkConfig } from "./rtk.config";
import { getDb } from "../../db/connection";
import { logger } from "../../logger";
import type { RtkStatus, RtkCompressResult } from "./rtk.types";

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
    if (!this._enabled) return;

    if (this.process) {
      try {
        this.process.kill();
      } catch {
      }
      this.process = null;
    }

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

  async compress(content: string): Promise<RtkCompressResult | null> {
    if (!content) return null;

    const binPath = rtkBinary.binaryPath();
    if (!existsSync(binPath)) return null;

    const tmpDir = join(".", "data", "rtk", "tmp");
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    const tmpFile = join(tmpDir, `resp-${Date.now()}.txt`);

    try {
      await writeFile(tmpFile, content, "utf-8");

      const proc = Bun.spawnSync([binPath, "read", tmpFile, "-l", "aggressive"], {
        env: { ...process.env, RTK_TELEMETRY_DISABLED: "1" },
      });

      if (proc.exitCode !== 0) return null;

      const compressed = proc.stdout.toString();
      if (!compressed) return null;

      const originalChars = content.length;
      const compressedChars = compressed.length;
      const savedChars = originalChars - compressedChars;
      const savedPercent = originalChars > 0
        ? Math.round((savedChars / originalChars) * 100)
        : 0;

      return {
        original: content,
        compressed,
        originalChars,
        compressedChars,
        savedChars,
        savedPercent,
      };
    } catch {
      logger.error("Failed to compress response", { contentLength: content.length });
      return null;
    } finally {
      unlink(tmpFile).catch(() => {});
    }
  }

  async getStatus(): Promise<RtkStatus> {
    const installed = await rtkBinary.isInstalled();
    const binPath = rtkBinary.binaryPath();
    const version = installed ? await rtkBinary.getVersion() : null;
    const cfgPath = rtkConfig.configPath();

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
      pid: this.getPid(),
      configPath: existsSync(cfgPath) ? cfgPath : null,
      downloadUrl: rtkBinary.getDownloadUrl(),
      latestVersion,
      updateAvailable,
    };
  }
}

export const rtkManager = new RtkManager();
