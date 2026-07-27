import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { logger } from "../../logger";
import type { RtkPlatform, RtkArch, RtkBinaryInfo } from "./rtk.types";

const RTK_DIR = join(".", "data", "rtk");
const BINARY_NAME = process.platform === "win32" ? "rtk.exe" : "rtk";
const RTK_VERSION = "0.44.0";

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

function downloadUrl(): string {
  const triple = getTargetTriple();
  const assetName = ASSET_NAMES[triple];
  if (!assetName) throw new Error(`No asset for target ${triple}`);
  return `https://github.com/rtk-ai/rtk/releases/download/v${RTK_VERSION}/${assetName}`;
}

function getBinaryInfo(): RtkBinaryInfo {
  const triple = getTargetTriple();
  const platform = detectPlatform();
  const arch = detectArch();
  const ext = platform === "windows" ? "zip" : "tar.gz";

  return {
    platform,
    arch,
    filename: `rtk-${triple}.${ext}`,
    url: downloadUrl(),
  };
}

function rtkDir(): string {
  return join(".", RTK_DIR);
}

function binaryPath(): string {
  return join(rtkDir(), BINARY_NAME);
}

function checksumPath(): string {
  return join(rtkDir(), `${BINARY_NAME}.sha256`);
}

async function computeChecksum(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

async function downloadBinary(info: RtkBinaryInfo): Promise<string> {
  const dir = rtkDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

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

  if (archivePath.endsWith(".zip")) {
    const { execSync } = await import("node:child_process");
    execSync(`unzip -o "${archivePath}" -d "${dir}"`, { stdio: "pipe" });
  } else {
    const { execSync } = await import("node:child_process");
    execSync(`tar -xzf "${archivePath}" -C "${dir}"`, { stdio: "pipe" });
  }

  if (!existsSync(binPath)) {
    const entries = readdirSync(dir);
    throw new Error(`Binary not found after extraction. Contents: ${entries.join(", ")}`);
  }

  await chmod(binPath, 0o755);
  logger.info(`Binary extracted to ${binPath}`);

  return binPath;
}

async function getVersion(binPath: string): Promise<string | null> {
  try {
    const proc = Bun.spawnSync([binPath, "--version"]);
    if (proc.exitCode === 0) return proc.stdout.toString().trim();
    return null;
  } catch {
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

  async ensureBinary(): Promise<string> {
    if (await this.isInstalled()) {
      const valid = await this.verifyChecksum();
      if (valid) {
        const version = await getVersion(binaryPath());
        if (version) {
          logger.info(`RTK binary already installed (${version})`);
          return binaryPath();
        }
      } else {
        logger.warn("RTK binary checksum mismatch, re-downloading");
      }
    }

    const info = getBinaryInfo();
    const archive = await downloadBinary(info);
    const binPath = await extractBinary(archive);

    const hash = await computeChecksum(binPath);
    await writeFile(checksumPath(), hash);

    const version = await getVersion(binPath);
    if (version) logger.success(`RTK ${version} installed at ${binPath}`);

    return binPath;
  },

  async getVersion(): Promise<string | null> {
    if (!(await this.isInstalled())) return null;
    return getVersion(binaryPath());
  },

  getDownloadUrl(): string {
    return downloadUrl();
  },
};
