import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { readFile, writeFile, chmod, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { logger } from "../../logger";
import { config } from "../../config";
import type { RtkPlatform, RtkArch, RtkBinaryInfo } from "./rtk.types";

const BINARY_NAME = process.platform === "win32" ? "rtk.exe" : "rtk";

const ASSET_NAMES: Record<string, string> = {
  "aarch64-apple-darwin": "rtk-aarch64-apple-darwin.tar.gz",
  "aarch64-unknown-linux-gnu": "rtk-aarch64-unknown-linux-gnu.tar.gz",
  "x86_64-apple-darwin": "rtk-x86_64-apple-darwin.tar.gz",
  "x86_64-pc-windows-msvc": "rtk-x86_64-pc-windows-msvc.zip",
  "x86_64-unknown-linux-musl": "rtk-x86_64-unknown-linux-musl.tar.gz",
};

function detectPlatform(): RtkPlatform {
  switch (process.platform) {
    case "linux":
      return "linux";
    case "darwin":
      return "darwin";
    case "win32":
      return "windows";
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

function detectArch(): RtkArch {
  const arch = process.arch as string;
  if (arch === "arm64" || arch === "aarch64") return "aarch64";
  if (arch === "x64") return "x86_64";
  throw new Error(`Unsupported architecture: ${arch}`);
}

function getTargetTriple(): string {
  const platform = detectPlatform();
  const arch = detectArch();

  if (platform === "darwin" && arch === "aarch64") return "aarch64-apple-darwin";
  if (platform === "darwin" && arch === "x86_64") return "x86_64-apple-darwin";
  if (platform === "linux" && arch === "aarch64") return "aarch64-unknown-linux-gnu";
  if (platform === "linux" && arch === "x86_64") return "x86_64-unknown-linux-musl";
  if (platform === "windows" && arch === "x86_64") return "x86_64-pc-windows-msvc";

  throw new Error(`No binary available for ${platform}-${arch}`);
}

function downloadUrl(version: string): string {
  const triple = getTargetTriple();
  const assetName = ASSET_NAMES[triple];
  if (!assetName) throw new Error(`No asset for target ${triple}`);
  const v = version.startsWith("v") ? version : `v${version}`;
  return `https://github.com/rtk-ai/rtk/releases/download/${v}/${assetName}`;
}

function getBinaryInfo(version: string): RtkBinaryInfo {
  const triple = getTargetTriple();
  const platform = detectPlatform();
  const arch = detectArch();
  const ext = platform === "windows" ? "zip" : "tar.gz";

  return {
    platform,
    arch,
    filename: `rtk-${triple}.${ext}`,
    url: downloadUrl(version),
  };
}

function rtkDir(): string {
  return resolve(config.dataDir, "rtk");
}

function binaryPath(): string {
  return join(rtkDir(), BINARY_NAME);
}

function checksumPath(): string {
  return join(rtkDir(), `${BINARY_NAME}.sha256`);
}

function versionFilePath(): string {
  return join(rtkDir(), "version.txt");
}

function opencodePluginPath(): string {
  return join(homedir(), ".config", "opencode", "plugins", "rtk.ts");
}

function configPath(): string {
  return join(homedir(), ".config", "rtk", "config.toml");
}

function shellQuote(value: string): string {
  return JSON.stringify(value);
}

function generateOpenCodePlugin(binPath: string): string {
  return `import type { Plugin } from "@opencode-ai/plugin";

const RTK = ${shellQuote(binPath)};

export const RtkOpenCodePlugin: Plugin = async ({ $ }) => ({
  "tool.execute.before": async (input, output) => {
    const tool = String(input?.tool ?? "").toLowerCase();
    if (tool !== "bash" && tool !== "shell") return;

    const args = output?.args;
    if (!args || typeof args !== "object") return;

    const command = (args as Record<string, unknown>).command;
    if (typeof command !== "string" || !command) return;

    try {
      const result = await $\`\${RTK} rewrite \${command}\`.quiet().nothrow();
      const rewritten = String(result.stdout).trim();
      if (rewritten && rewritten !== command) {
        (args as Record<string, unknown>).command = rewritten;
      }
    } catch {
      // Keep the original command when RTK cannot rewrite it.
    }
  },
});
`;
}

async function initializeOpenCode(): Promise<string> {
  const path = opencodePluginPath();
  const dir = join(homedir(), ".config", "opencode", "plugins");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
  await writeFile(path, generateOpenCodePlugin(binaryPath()), "utf-8");
  logger.info(`RTK OpenCode plugin installed at ${path}`);
  return path;
}

async function disableOpenCode(): Promise<void> {
  const path = opencodePluginPath();
  const { rm } = await import("node:fs/promises");
  await rm(path, { force: true });
  logger.info(`RTK OpenCode plugin removed from ${path}`);
}

async function readVersion(): Promise<string | null> {
  try {
    return (await readFile(versionFilePath(), "utf-8")).trim();
  } catch {
    return null;
  }
}

async function writeVersion(version: string): Promise<void> {
  await writeFile(versionFilePath(), version);
}

async function computeChecksum(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

async function downloadBinary(version: string): Promise<string> {
  const dir = rtkDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const info = getBinaryInfo(version);
  const dest = join(dir, info.filename);
  logger.info(`Downloading RTK binary from ${info.url}`);

  const response = await fetch(info.url);
  if (!response.ok) throw new Error(`Failed to download RTK: ${response.status} ${response.statusText}`);

  const buffer = await response.arrayBuffer();
  await writeFile(dest, new Uint8Array(buffer));

  logger.info(`Downloaded to ${dest} (${buffer.byteLength} bytes)`);

  return dest;
}

async function extractBinary(archivePath: string): Promise<string> {
  const dir = rtkDir();
  const binPath = binaryPath();

  try {
    if (archivePath.endsWith(".zip")) {
      const { execFileSync } = await import("node:child_process");
      execFileSync("unzip", ["-o", archivePath, "-d", dir], { stdio: "pipe" });
    } else {
      const { execFileSync } = await import("node:child_process");
      execFileSync("tar", ["-xzf", archivePath, "-C", dir], { stdio: "pipe" });
    }

    if (!existsSync(binPath)) {
      const entries = readdirSync(dir);
      throw new Error(`Binary not found after extraction. Contents: ${entries.join(", ")}`);
    }

    await chmod(binPath, 0o755);
    logger.info(`Binary extracted to ${binPath}`);
    return binPath;
  } finally {
    await rm(archivePath, { force: true }).catch(() => {});
  }
}

async function getVersion(binPath: string): Promise<string | null> {
  try {
    const proc = Bun.spawnSync([binPath, "--version"]);
    if (proc.exitCode === 0) return proc.stdout.toString().trim();
    logger.warn("Failed to get RTK version", { exitCode: proc.exitCode });
    return null;
  } catch {
    logger.warn("Failed to execute RTK binary for version check", { binPath });
    return null;
  }
}

async function checkLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(
      "https://api.github.com/repos/rtk-ai/rtk/releases/latest",
      { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) {
      logger.warn("Failed to fetch latest RTK version", { status: response.status });
      return null;
    }
    const data = await response.json() as any;
    return data.tag_name as string;
  } catch (error) {
    logger.warn("Error fetching latest RTK version", { error });
    return null;
  }
}

export const rtkBinary = {
  detectPlatform,
  detectArch,
  getTargetTriple,
  binaryPath,
  rtkDir,
  checksumPath,
  configPath,
  initializeOpenCode,
  disableOpenCode,

  async currentVersion(): Promise<string | null> {
    const stored = await readVersion();
    if (stored) return stored;
    const bin = binaryPath();
    if (existsSync(bin)) {
      const v = await getVersion(bin);
      if (v) {
        await writeVersion(v);
        return v;
      }
    }
    return null;
  },

  async isInstalled(): Promise<boolean> {
    return existsSync(binaryPath());
  },

  async verifyChecksum(): Promise<boolean> {
    const path = binaryPath();
    if (!existsSync(path)) return false;
    const saved = await readFile(checksumPath(), "utf-8").catch(() => "");
    if (!saved) return false;
    const actual = await computeChecksum(path);
    return actual === saved.trim().toLowerCase();
  },

  async checkLatestVersion(): Promise<string | null> {
    return checkLatestVersion();
  },

  async ensureBinary(version?: string): Promise<string> {
    const ver = version || (await readVersion()) || "v0.44.0";

    if (await this.isInstalled()) {
      const valid = await this.verifyChecksum();
      if (valid) {
        const binVersion = await getVersion(binaryPath());
        if (binVersion) {
          logger.info(`RTK binary already installed (${binVersion})`);
          return binaryPath();
        }
      } else {
        logger.warn("RTK binary checksum mismatch, re-downloading");
      }
    }

    const targetVer = version || ver;
    const archive = await downloadBinary(targetVer);
    const binPath = await extractBinary(archive);

    const hash = await computeChecksum(binPath);
    await writeFile(checksumPath(), hash);

    const binVersion = await getVersion(binPath);
    const versionStr = binVersion || targetVer;
    await writeVersion(versionStr);

    if (binVersion) logger.success(`RTK ${binVersion} installed at ${binPath}`);

    return binPath;
  },

  async update(): Promise<string> {
    const latest = await checkLatestVersion();
    if (!latest) throw new Error("Could not fetch latest RTK version");

    const current = await this.currentVersion();
    if (current && current.replace(/^rtk\s*/i, "").replace(/^v/, "").trim() === latest.replace(/^rtk\s*/i, "").replace(/^v/, "").trim()) {
      logger.info("RTK already at latest version");
      return binaryPath();
    }

    logger.info(`Updating RTK from ${current || "unknown"} to ${latest}`);
    return this.ensureBinary(latest);
  },

  async getVersion(): Promise<string | null> {
    if (!(await this.isInstalled())) return null;
    return getVersion(binaryPath());
  },

  getDownloadUrl(): string {
    const fallback = "v0.44.0";
    return downloadUrl(fallback);
  },
};
