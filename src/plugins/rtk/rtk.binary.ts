import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { readFile, writeFile, chmod, rm, mkdtemp, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { logger } from "../../logger";
import { config } from "../../config";
import type { RtkPlatform, RtkArch, RtkBinaryInfo } from "./rtk.types";

const BINARY_NAME = process.platform === "win32" ? "rtk.exe" : "rtk";
const FALLBACK_VERSION = "v0.44.0";
const DOWNLOAD_TIMEOUT_MS = 30_000;
const LATEST_VERSION_CACHE_MS = 10 * 60_000;

let installPromise: Promise<string> | null = null;
let latestVersionCache: { value: string | null; expiresAt: number } | null = null;

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
  const dest = join(dir, `${crypto.randomUUID()}-${info.filename}`);
  logger.info(`Downloading RTK binary from ${info.url}`);

  const response = await fetch(info.url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Failed to download RTK: ${response.status} ${response.statusText}`);

  const buffer = await response.arrayBuffer();
  await writeFile(dest, new Uint8Array(buffer));

  logger.info(`Downloaded to ${dest} (${buffer.byteLength} bytes)`);

  const checksumResponse = await fetch(
    `https://github.com/rtk-ai/rtk/releases/download/${version.startsWith("v") ? version : `v${version}`}/checksums.txt`,
    { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) },
  );
  if (!checksumResponse.ok) {
    await rm(dest, { force: true });
    throw new Error(`Failed to download RTK checksums: ${checksumResponse.status}`);
  }
  const checksums = await checksumResponse.text();
  const expected = checksums
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find((parts) => parts.at(-1)?.replace(/^\*/, "") === info.filename)?.[0];
  const actual = await computeChecksum(dest);
  if (!expected || actual !== expected.toLowerCase()) {
    await rm(dest, { force: true });
    throw new Error(`RTK archive checksum verification failed for ${info.filename}`);
  }

  return dest;
}

async function extractBinary(archivePath: string): Promise<string> {
  const dir = rtkDir();
  const binPath = binaryPath();
  const extractDir = await mkdtemp(join(dir, ".extract-"));
  const extractedBin = join(extractDir, BINARY_NAME);
  const stagedBin = join(dir, `${BINARY_NAME}.new-${crypto.randomUUID()}`);

  try {
    if (archivePath.endsWith(".zip")) {
      const { execFileSync } = await import("node:child_process");
      execFileSync("unzip", ["-o", archivePath, "-d", extractDir], { stdio: "pipe" });
    } else {
      const { execFileSync } = await import("node:child_process");
      execFileSync("tar", ["-xzf", archivePath, "-C", extractDir], { stdio: "pipe" });
    }

    if (!existsSync(extractedBin)) {
      const entries = readdirSync(extractDir);
      throw new Error(`Binary not found after extraction. Contents: ${entries.join(", ")}`);
    }

    await rename(extractedBin, stagedBin);
    await chmod(stagedBin, 0o755);
    if (process.platform === "win32") await rm(binPath, { force: true });
    await rename(stagedBin, binPath);
    logger.info(`Binary extracted to ${binPath}`);
    return binPath;
  } finally {
    await rm(archivePath, { force: true }).catch(() => {});
    await rm(extractDir, { recursive: true, force: true }).catch(() => {});
    await rm(stagedBin, { force: true }).catch(() => {});
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
  if (latestVersionCache && latestVersionCache.expiresAt > Date.now()) {
    return latestVersionCache.value;
  }
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
    const value = data.tag_name as string;
    latestVersionCache = { value, expiresAt: Date.now() + LATEST_VERSION_CACHE_MS };
    return value;
  } catch (error) {
    logger.warn("Error fetching latest RTK version", { error });
    return null;
  }
}

function normalizeVersion(version: string | null): string {
  return (version ?? "").replace(/^rtk\s*/i, "").replace(/^v/, "").trim();
}

async function cleanupLegacyArchives(): Promise<void> {
  const dir = rtkDir();
  if (!existsSync(dir)) return;
  await Promise.all(
    readdirSync(dir)
      .filter((name) => name.endsWith(".tar.gz") || name.endsWith(".zip"))
      .map((name) => rm(join(dir, name), { force: true }).catch(() => {})),
  );
}

async function ensureBinaryUnlocked(version?: string): Promise<string> {
  const installed = existsSync(binaryPath());
  if (installed && await rtkBinary.verifyChecksum()) {
    const binVersion = await getVersion(binaryPath());
    if (binVersion && (!version || normalizeVersion(binVersion) === normalizeVersion(version))) {
      await cleanupLegacyArchives();
      logger.info(`RTK binary already installed (${binVersion})`);
      return binaryPath();
    }
  } else if (installed) {
    logger.warn("RTK binary checksum mismatch, re-downloading");
  }

  const targetVersion = version || await checkLatestVersion() || FALLBACK_VERSION;
  const archive = await downloadBinary(targetVersion);
  const binPath = await extractBinary(archive);
  const hash = await computeChecksum(binPath);
  await writeFile(checksumPath(), hash);
  const binVersion = await getVersion(binPath);
  await writeVersion(binVersion || targetVersion);
  await cleanupLegacyArchives();
  if (binVersion) logger.success(`RTK ${binVersion} installed at ${binPath}`);
  return binPath;
}

export const rtkBinary = {
  detectPlatform,
  detectArch,
  getTargetTriple,
  binaryPath,
  rtkDir,
  checksumPath,

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
    if (!installPromise) {
      installPromise = ensureBinaryUnlocked(version).finally(() => {
        installPromise = null;
      });
    }
    return installPromise;
  },

  async update(): Promise<string> {
    const latest = await checkLatestVersion();
    if (!latest) throw new Error("Could not fetch latest RTK version");

    const current = await this.currentVersion();
    if (current && normalizeVersion(current) === normalizeVersion(latest)) {
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
    return downloadUrl(FALLBACK_VERSION);
  },
};
