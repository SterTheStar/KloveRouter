import { accessSync, constants, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { getDb } from "../db/connection";

const SETTING_KEY = "openfree_cli_path";

export type OpenFreeCliStatus = {
  path: string | null;
  source: string | null;
  saved_path: string | null;
  warning: string | null;
};

function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    if (process.platform !== "win32") accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function savedPath(): string | null {
  const row = getDb()
    .query("SELECT value FROM settings WHERE key = ?")
    .get(SETTING_KEY) as { value: string } | undefined;
  return row?.value.trim() || null;
}

function findDesktopCli(): string | null {
  const home = homedir();
  const dataRoot = process.platform === "win32"
    ? process.env.APPDATA || join(home, "AppData", "Roaming")
    : process.platform === "darwin"
      ? join(home, "Library", "Application Support")
      : process.env.XDG_CONFIG_HOME || join(home, ".config");
  const cliDirectory = join(dataRoot, "ai.opencode.desktop", "cli");
  const executableName = process.platform === "win32" ? "opencode-cli.exe" : "opencode-cli";

  try {
    const versions = readdirSync(cliDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true, sensitivity: "base" }));
    for (const version of versions) {
      const candidate = join(cliDirectory, version, executableName);
      if (isExecutableFile(candidate)) return candidate;
    }
  } catch {
    // The desktop bundled CLI is optional.
  }
  return null;
}

function findInstalledCli(): { path: string; source: string } | null {
  for (const command of ["opencode-cli", "opencode"]) {
    const found = Bun.which(command);
    if (found && isExecutableFile(found)) return { path: resolve(found), source: "PATH" };
  }

  const home = homedir();
  const standardBinDirectories = [
    process.env.OPENCODE_INSTALL_DIR,
    process.env.XDG_BIN_DIR,
    join(home, "bin"),
    join(home, ".opencode", "bin"),
    join(home, ".local", "bin"),
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs", "OpenCode") : undefined,
    process.env.APPDATA ? join(process.env.APPDATA, "npm") : undefined,
    "/usr/local/bin",
    "/usr/bin",
    "/opt/homebrew/bin",
    "/home/linuxbrew/.linuxbrew/bin",
    "/snap/bin",
  ].filter((directory): directory is string => Boolean(directory));
  const executableNames = process.platform === "win32"
    ? ["opencode.exe", "opencode.cmd", "opencode"]
    : ["opencode"];

  for (const directory of standardBinDirectories) {
    for (const executableName of executableNames) {
      const candidate = resolve(directory, executableName);
      if (isExecutableFile(candidate)) return { path: candidate, source: "standard install location" };
    }
  }

  const desktopCli = findDesktopCli();
  return desktopCli ? { path: desktopCli, source: "OpenCode desktop app" } : null;
}

export function getOpenfreeCliStatus(): OpenFreeCliStatus {
  const databasePath = savedPath();
  const environmentOverrides = [
    { path: process.env.OPENFREE_CLI_PATH?.trim(), source: "OPENFREE_CLI_PATH" },
    { path: process.env.OPENCODE_CLI_PATH?.trim(), source: "OPENCODE_CLI_PATH" },
  ].filter((item): item is { path: string; source: string } => Boolean(item.path));
  const overrides = [
    ...environmentOverrides,
    ...(databasePath ? [{ path: databasePath, source: "KloveRouter setting" }] : []),
  ];
  let warning: string | null = null;

  for (const override of overrides) {
    const candidate = resolve(override.path);
    if (isExecutableFile(candidate)) {
      return { path: candidate, source: override.source, saved_path: databasePath, warning };
    }
    warning = `Ignoring ${override.source}: the configured path is not an executable file.`;
  }

  const detected = findInstalledCli();
  if (detected) {
    return { ...detected, saved_path: databasePath, warning };
  }

  return { path: null, source: null, saved_path: databasePath, warning };
}

export function saveOpenfreeCliPath(value: string): OpenFreeCliStatus {
  const path = value.trim();
  const db = getDb();
  if (!path) {
    db.query("DELETE FROM settings WHERE key = ?").run(SETTING_KEY);
    return getOpenfreeCliStatus();
  }
  if (!isAbsolute(path)) throw new Error("Enter an absolute path to the OpenCode CLI executable.");
  const absolutePath = resolve(path);
  if (!isExecutableFile(absolutePath)) throw new Error("That path is not an executable file on the KloveRouter host.");
  db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(SETTING_KEY, absolutePath);
  return getOpenfreeCliStatus();
}
