import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "../../logger";

const CAVEMAN_DIR = join(".", "data", "caveman");
const CAVEMAN_VERSION = "v1.9.1";
const SKILL_FILE = "SKILL.md";

function cavemanDir(): string {
  return join(".", CAVEMAN_DIR);
}

function skillPath(): string {
  return join(cavemanDir(), SKILL_FILE);
}

async function downloadArchive(): Promise<string> {
  const dir = cavemanDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const url = `https://github.com/JuliusBrussee/caveman/archive/refs/tags/${CAVEMAN_VERSION}.tar.gz`;
  const dest = join(dir, `caveman-${CAVEMAN_VERSION}.tar.gz`);

  logger.info(`Downloading Caveman from ${url}`);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download Caveman: ${response.status} ${response.statusText}`);

  const buffer = await response.arrayBuffer();
  await writeFile(dest, new Uint8Array(buffer));

  logger.info(`Downloaded to ${dest} (${buffer.byteLength} bytes)`);
  return dest;
}

async function extractSkill(archivePath: string): Promise<string> {
  const dir = cavemanDir();
  const extractDir = join(dir, `caveman-${CAVEMAN_VERSION.replace(/^v/, "")}`);

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

export const cavemanBinary = {
  cavemanDir,
  skillPath,

  async isInstalled(): Promise<boolean> {
    return existsSync(skillPath());
  },

  async ensureInstalled(): Promise<string> {
    if (await this.isInstalled()) {
      logger.info("Caveman skill already installed");
      return skillPath();
    }

    const archive = await downloadArchive();
    return extractSkill(archive);
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
