import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "../../logger";

const CAVEMAN_DIR = join(".", "data", "caveman");
const SKILL_FILE = "SKILL.md";

function cavemanDir(): string {
  return join(".", CAVEMAN_DIR);
}

function skillPath(): string {
  return join(cavemanDir(), SKILL_FILE);
}

function versionFilePath(): string {
  return join(cavemanDir(), "version.txt");
}

async function readVersion(): Promise<string | null> {
  try {
    return (await readFile(versionFilePath(), "utf-8")).trim();
  } catch {
    return null;
  }
}

async function writeVersion(version: string): Promise<void> {
  const dir = cavemanDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await writeFile(versionFilePath(), version);
}

async function downloadArchive(version: string): Promise<string> {
  const dir = cavemanDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const tag = version.startsWith("v") ? version : `v${version}`;
  const url = `https://github.com/JuliusBrussee/caveman/archive/refs/tags/${tag}.tar.gz`;
  const dest = join(dir, `caveman-${tag}.tar.gz`);

  logger.info(`Downloading Caveman from ${url}`);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download Caveman: ${response.status} ${response.statusText}`);

  const buffer = await response.arrayBuffer();
  await writeFile(dest, new Uint8Array(buffer));

  logger.info(`Downloaded to ${dest} (${buffer.byteLength} bytes)`);
  return dest;
}

async function extractSkill(archivePath: string, version: string): Promise<string> {
  const dir = cavemanDir();
  const tag = version.startsWith("v") ? version : `v${version}`;
  const extractDir = join(dir, `caveman-${tag.replace(/^v/, "")}`);

  if (existsSync(extractDir)) {
    await rm(extractDir, { recursive: true, force: true });
  }

  const { execSync } = await import("node:child_process");
  execSync(`tar -xzf "${archivePath}" -C "${dir}"`, { stdio: "pipe" });

  const srcSkillPath = join(extractDir, "skills", "caveman", SKILL_FILE);
  if (!existsSync(srcSkillPath)) {
    const entries = execSync(`ls "${extractDir}/skills/"`, { encoding: "utf8" }).trim();
    throw new Error(`Caveman SKILL.md not found. skills/ contents: ${entries}`);
  }

  const content = await readFile(srcSkillPath, "utf-8");
  await writeFile(skillPath(), content);

  await rm(extractDir, { recursive: true, force: true });
  await rm(archivePath, { force: true });

  logger.info(`Caveman skill extracted to ${skillPath()}`);
  return skillPath();
}

async function checkLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(
      "https://api.github.com/repos/JuliusBrussee/caveman/releases/latest",
      { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) return null;
    const data = await response.json() as any;
    return data.tag_name as string;
  } catch {
    return null;
  }
}

export const cavemanBinary = {
  cavemanDir,
  skillPath,
  versionFilePath,

  async currentVersion(): Promise<string | null> {
    return readVersion();
  },

  async isInstalled(): Promise<boolean> {
    return existsSync(skillPath());
  },

  async checkLatestVersion(): Promise<string | null> {
    return checkLatestVersion();
  },

  async ensureInstalled(version?: string): Promise<string> {
    if (await this.isInstalled()) {
      const v = await readVersion();
      logger.info(`Caveman skill already installed (${v || "unknown version"})`);
      return skillPath();
    }

    const ver = version || "v1.9.1";
    const archive = await downloadArchive(ver);
    const result = await extractSkill(archive, ver);
    await writeVersion(ver);
    return result;
  },

  async update(): Promise<string> {
    const latest = await checkLatestVersion();
    if (!latest) throw new Error("Could not fetch latest Caveman version");

    const current = await readVersion();
    if (current && current === latest) {
      logger.info("Caveman already at latest version");
      return skillPath();
    }

    logger.info(`Updating Caveman from ${current || "unknown"} to ${latest}`);
    const archive = await downloadArchive(latest);
    const result = await extractSkill(archive, latest);
    await writeVersion(latest);
    return result;
  },

  async uninstall(): Promise<void> {
    const dir = cavemanDir();
    if (existsSync(dir)) {
      await rm(dir, { recursive: true, force: true });
      logger.info("Caveman skill uninstalled");
    }
  },

  async readSkill(): Promise<string | null> {
    try {
      return await readFile(skillPath(), "utf-8");
    } catch {
      return null;
    }
  },
};
