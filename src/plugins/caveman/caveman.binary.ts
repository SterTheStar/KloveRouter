import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { config } from "../../config";
import { logger } from "../../logger";

const SKILL_FILE = "SKILL.md";
const FALLBACK_VERSION = "v1.9.1";
const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const LATEST_VERSION_CACHE_MS = 10 * 60_000;
let operation: Promise<unknown> | null = null;
let latestCache: { value: string | null; expiresAt: number } | null = null;

function cavemanDir(): string { return resolve(config.dataDir, "caveman"); }
function skillPath(): string { return join(cavemanDir(), SKILL_FILE); }
function versionFilePath(): string { return join(cavemanDir(), "version.txt"); }
function normalizeVersion(version: string | null): string { return (version ?? "").replace(/^v/, "").trim(); }
function tagFor(version: string): string {
  const tag = version.startsWith("v") ? version : `v${version}`;
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error("Invalid Caveman version");
  return tag;
}
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = operation ?? Promise.resolve();
  const current = previous.catch(() => {}).then(fn);
  operation = current.finally(() => { if (operation === current) operation = null; });
  return current;
}
async function readVersion(): Promise<string | null> {
  try { return (await readFile(versionFilePath(), "utf8")).trim() || null; } catch { return null; }
}
async function downloadArchive(version: string, dir: string): Promise<string> {
  const tag = tagFor(version);
  const url = `https://github.com/JuliusBrussee/caveman/archive/refs/tags/${tag}.tar.gz`;
  const dest = join(dir, `.caveman-${tag}.tar.gz`);
  logger.info(`Downloading Caveman from ${url}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Failed to download Caveman (${response.status})`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) throw new Error("Caveman archive is too large");
  await writeFile(dest, new Uint8Array(buffer));
  return dest;
}
function validateArchive(archivePath: string): void {
  const listing = execFileSync("tar", ["-tvzf", archivePath], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  for (const line of listing.split("\n")) {
    if (!line.trim()) continue;
    if (/^[lhs]/.test(line) || /(?:^|\/)(?:\.\.?)(?:\/|$)/.test(line) || /(^|\s)\//.test(line)) {
      throw new Error("Caveman archive contains unsafe entries");
    }
  }
}
async function installFromArchive(archivePath: string, version: string): Promise<string> {
  const dir = cavemanDir();
  const tag = tagFor(version);
  const staging = await mkdtemp(join(dir, ".staging-"));
  const stagedSkill = join(staging, SKILL_FILE);
  try {
    validateArchive(archivePath);
    execFileSync("tar", ["--no-absolute-names", "-xzf", archivePath, "-C", staging], { stdio: "pipe" });
    const root = readdirSync(staging).find((entry) => entry.startsWith("caveman-"));
    if (!root) throw new Error("Caveman archive has unexpected layout");
    const source = join(staging, root, "skills", "caveman", SKILL_FILE);
    const content = await readFile(source, "utf8");
    validateSkill(content);
    await writeFile(stagedSkill, content);
    await rename(stagedSkill, skillPath());
    await writeFile(versionFilePath(), tag);
    return skillPath();
  } finally {
    await rm(archivePath, { force: true }).catch(() => {});
    await rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}
function validateSkill(content: string): void {
  if (!content.trim() || Buffer.byteLength(content, "utf8") > 2 * 1024 * 1024) throw new Error("Caveman SKILL.md is invalid");
  const levels = ["lite", "full", "ultra", "wenyan-lite", "wenyan-full", "wenyan-ultra"];
  if (levels.some((level) => !content.includes(`**${level}**`))) throw new Error("Caveman SKILL.md missing required levels");
}
async function latestVersion(): Promise<string | null> {
  if (latestCache && latestCache.expiresAt > Date.now()) return latestCache.value;
  try {
    const response = await fetch("https://api.github.com/repos/JuliusBrussee/caveman/releases/latest", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const value = String((await response.json() as { tag_name?: string }).tag_name ?? "");
    const result = /^v?\d+\.\d+\.\d+$/.test(value) ? value : null;
    latestCache = { value: result, expiresAt: Date.now() + LATEST_VERSION_CACHE_MS };
    return result;
  } catch { return null; }
}
export const cavemanBinary = {
  cavemanDir, skillPath, versionFilePath,
  async currentVersion() { return readVersion(); },
  async isInstalled() { return existsSync(skillPath()); },
  async checkLatestVersion() { return latestVersion(); },
  async ensureInstalled(version = FALLBACK_VERSION) { return withLock(async () => {
    if (existsSync(skillPath())) return skillPath();
    const dir = cavemanDir(); if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return installFromArchive(await downloadArchive(version, dir), version);
  }); },
  async update() { return withLock(async () => {
    const latest = await latestVersion(); if (!latest) throw new Error("Could not fetch latest Caveman version");
    const current = await readVersion();
    if (current && normalizeVersion(current) === normalizeVersion(latest) && existsSync(skillPath())) return skillPath();
    const dir = cavemanDir(); if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return installFromArchive(await downloadArchive(latest, dir), latest);
  }); },
  async uninstall() { return withLock(async () => { await rm(cavemanDir(), { recursive: true, force: true }); }); },
  async readSkill() { try { return await readFile(skillPath(), "utf8"); } catch { return null; } },
};
