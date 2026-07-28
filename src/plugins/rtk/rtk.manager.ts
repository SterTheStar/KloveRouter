import { existsSync } from "node:fs";
import { rtkBinary } from "./rtk.binary";
import { logger } from "../../logger";
import type { RtkStatus } from "./rtk.types";

const MAX_TOOL_OUTPUT_BYTES = 10 * 1024 * 1024;
const PIPE_TIMEOUT_MS = 5_000;

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

    const inputBytes = Buffer.byteLength(content, "utf8");
    if (inputBytes > MAX_TOOL_OUTPUT_BYTES) {
      logger.warn("RTK skipped tool output: input exceeds limit", {
        inputBytes,
        maxBytes: MAX_TOOL_OUTPUT_BYTES,
      });
      return content;
    }

    const binPath = rtkBinary.binaryPath();
    if (!existsSync(binPath)) {
      logger.warn("RTK skipped tool output: binary not found", { binPath });
      return content;
    }

    try {
      logger.info("RTK starting pipe", { inputBytes });
      const proc = Bun.spawn([binPath, "pipe"], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, RTK_TELEMETRY_DISABLED: "1" },
      });
      proc.stdin.write(content);
      proc.stdin.end();

      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, PIPE_TIMEOUT_MS);

      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      clearTimeout(timeout);

      if (timedOut) {
        logger.warn("RTK pipe timed out, preserving tool output", {
          timeoutMs: PIPE_TIMEOUT_MS,
          inputBytes,
        });
        return content;
      }

      if (exitCode !== 0 || !stdout) {
        logger.warn("RTK pipe failed, preserving tool output", {
          exitCode,
          error: stderr.trim().slice(0, 300),
        });
        return content;
      }

      const outputBytes = Buffer.byteLength(stdout, "utf8");
      const savedBytes = inputBytes - outputBytes;
      const savedPercent = Math.max(0, Math.round((savedBytes / inputBytes) * 100));
      logger.info("RTK pipe finished", {
        exitCode,
        inputBytes,
        outputBytes,
        savedBytes,
        savedPercent,
      });
      if (outputBytes < inputBytes) {
        logger.info(`RTK filtered tool output: ${inputBytes} to ${outputBytes} bytes (-${savedPercent}%)`);
      }
      return outputBytes < inputBytes ? stdout : content;
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

    return {
      installed,
      enabled: this._enabled,
      version,
      binaryPath: installed ? binPath : null,
      platform: installed ? (rtkBinary.detectPlatform() as any) : null,
      arch: installed ? (rtkBinary.detectArch() as any) : null,
      downloadUrl: rtkBinary.getDownloadUrl(),
      latestVersion,
      updateAvailable,
    };
  }
}

export const rtkManager = new RtkManager();
