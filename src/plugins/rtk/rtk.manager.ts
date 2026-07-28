import { existsSync } from "node:fs";
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
      this._enabled = true;
      logger.success("RTK enabled");
    } catch (error) {
      this._enabled = false;
      logger.error("Failed to enable RTK", { error });
      throw error;
    }
  }

  disable(): void {
    this._enabled = false;
    logger.info("RTK disabled");
  }

  async filterToolOutput(content: string): Promise<string> {
    if (!this._enabled || !content.trim()) return content;

    const binPath = rtkBinary.binaryPath();
    if (!existsSync(binPath)) return content;

    try {
      const proc = Bun.spawn([binPath, "pipe"], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, RTK_TELEMETRY_DISABLED: "1" },
      });
      proc.stdin.write(content);
      proc.stdin.end();

      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      if (exitCode !== 0 || !stdout) {
        logger.warn("RTK pipe failed, preserving tool output", {
          exitCode,
          error: stderr.trim().slice(0, 300),
        });
        return content;
      }

      if (stdout.length < content.length) {
        logger.info(`RTK filtered tool output: ${content.length} to ${stdout.length} chars`);
      }
      return stdout;
    } catch (error) {
      logger.warn("RTK pipe unavailable, preserving tool output", { error });
      return content;
    }
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
      configPath: null,
      downloadUrl: rtkBinary.getDownloadUrl(),
      latestVersion,
      updateAvailable,
    };
  }
}

export const rtkManager = new RtkManager();
