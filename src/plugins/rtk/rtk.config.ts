import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { rtkBinary } from "./rtk.binary";
import { config } from "../../config";
import { logger } from "../../logger";
import type { RtkConfig } from "./rtk.types";

const CONFIG_FILE = "config.toml";

function configDir(): string {
  return join(config.dataDir, "rtk", "config");
}

function configPath(): string {
  return join(configDir(), CONFIG_FILE);
}

function generateToml(cfg: RtkConfig): string {
  const lines: string[] = [];

  if (cfg.hooks) {
    lines.push("[hooks]");
    if (cfg.hooks.exclude_commands?.length) {
      const cmds = cfg.hooks.exclude_commands.map((c) => `"${c}"`).join(", ");
      lines.push(`exclude_commands = [${cmds}]`);
    }
    lines.push("");
  }

  if (cfg.tee) {
    lines.push("[tee]");
    lines.push(`enabled = ${cfg.tee.enabled ?? true}`);
    lines.push(`mode = "${cfg.tee.mode ?? "failures"}"`);
    lines.push("");
  }

  return lines.join("\n");
}

export const rtkConfig = {
  configPath,

  async ensureConfigDir(): Promise<void> {
    const dir = configDir();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      logger.info(`Created RTK config directory: ${dir}`);
    }
  },

  async load(): Promise<RtkConfig> {
    const path = configPath();
    try {
      const content = await readFile(path, "utf-8");
      return parseToml(content);
    } catch (error) {
      logger.warn("Failed to load RTK config, using defaults", { path, error });
      return {};
    }
  },

  async save(cfg: RtkConfig): Promise<void> {
    await this.ensureConfigDir();
    const toml = generateToml(cfg);
    await writeFile(configPath(), toml, "utf-8");
    logger.info(`RTK config saved to ${configPath()}`);
  },

  async getDefaultConfig(): Promise<RtkConfig> {
    return {
      hooks: {
        exclude_commands: ["curl", "playwright"],
      },
      tee: {
        enabled: true,
        mode: "failures",
      },
    };
  },

  async ensureConfig(): Promise<void> {
    try {
      await readFile(configPath(), "utf-8");
    } catch {
      const cfg = await this.getDefaultConfig();
      await this.save(cfg);
    }
  },
};

function parseToml(content: string): RtkConfig {
  const cfg: RtkConfig = {};
  let currentSection: string | null = null;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const sectionMatch = trimmed.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    if (currentSection === "hooks") {
      const excludeMatch = trimmed.match(/^exclude_commands\s*=\s*\[(.*)\]$/);
      if (excludeMatch) {
        const items = excludeMatch[1]
          .split(",")
          .map((s) => s.trim().replace(/^"|"$/g, ""))
          .filter(Boolean);
        cfg.hooks = cfg.hooks || {};
        cfg.hooks.exclude_commands = items;
      }
    }

    if (currentSection === "tee") {
      const enabledMatch = trimmed.match(/^enabled\s*=\s*(true|false)$/);
      if (enabledMatch) {
        cfg.tee = cfg.tee || {};
        cfg.tee.enabled = enabledMatch[1] === "true";
      }
      const modeMatch = trimmed.match(/^mode\s*=\s*"(failures|always|never)"$/);
      if (modeMatch) {
        cfg.tee = cfg.tee || {};
        cfg.tee.mode = modeMatch[1] as "failures" | "always" | "never";
      }
    }
  }

  return cfg;
}
