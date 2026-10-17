import { accessSync, chmodSync, constants, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { config } from "../config";
import { getDb } from "../db/connection";

const SETTING_KEY = "openfree_cli_path";
const OPENCODE_LATEST_API = "https://opencode.ai/update/api/latest/cli/npm";
const NPM_REGISTRY = "https://registry.npmjs.org";
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;
const MAX_PACKAGE_BYTES = 500 * 1024 * 1024;
const EXECUTABLE_NAME = process.platform === "win32" ? "opencode.exe" : "opencode";
let installOperation: Promise<OpenFreeCliStatus> | null = null;

export type OpenFreeCliStatus = {
  path: string | null;
  source: string | null;
  saved_path: string | null;
  warning: string | null;
  managed_path: string;
  managed_installed: boolean;
  managed_version: string | null;
};

export type OpenFreeCliLoginResult = {
  logged_in: boolean;
  path: string;
  warning: string | null;
};

export function openfreeAuthDatabasePath(apiKey: string): string {
  const keyProfile = createHash("sha256").update(apiKey).digest("hex").slice(0, 24);
  const authDirectory = join(managedDirectory(), "auth");
  mkdirSync(authDirectory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") chmodSync(authDirectory, 0o700);
  return join(authDirectory, `${keyProfile}.db`);
}

/**
 * OpenCode's API-key login is an interactive prompt. Expect supplies the PTY
 * the CLI requires; the key itself is sent over stdin and is never put in the
 * script, process arguments, or logs.
 */
export async function loginOpenfreeCli(apiKey: string): Promise<OpenFreeCliLoginResult> {
  const secret = apiKey.trim();
  if (!secret) throw new Error("Enter an OpenCode Zen API key.");
  if (/[\r\n\0]/.test(secret)) throw new Error("The OpenCode Zen API key must be a single line.");

  const cliStatus = getOpenfreeCliStatus();
  if (!cliStatus.path) {
    throw new Error("OpenFREE could not find an OpenCode CLI. Install it or set its executable path first.");
  }
  const expectPath = Bun.which("expect");
  if (!expectPath) {
    return {
      logged_in: false,
      path: cliStatus.path,
      warning: "The expect utility is not installed on the KloveRouter host, so OpenCode CLI login could not be opened. The saved API key can still be passed directly to OpenCode when OpenFREE makes requests.",
    };
  }

  const script = [
    "set timeout 60",
    "log_user 0",
    "if {[gets stdin api_key] < 0 || $api_key eq \"\"} { exit 2 }",
    "spawn -noecho $env(OPENFREE_CLI_PATH) auth login opencode --method key",
    "expect {",
    "  -re {(?i)api[[:space:]]*key} { send -- \"$api_key\\r\" }",
    "  eof { exit 3 }",
    "  timeout { catch {close}; catch {wait}; exit 124 }",
    "}",
    "expect {",
    "  eof {}",
    "  timeout { catch {close}; catch {wait}; exit 124 }",
    "}",
    "set result [wait]",
    "if {[lindex $result 2] == 0} { exit [lindex $result 3] }",
    "exit 1",
  ].join("\n");
  const authDatabasePath = openfreeAuthDatabasePath(secret);

  const exitCode = await new Promise<number>((resolve, reject) => {
    const childEnvironment = {
      ...process.env,
      OPENFREE_CLI_PATH: cliStatus.path!,
      OPENCODE_DB: authDatabasePath,
    };
    // Force the CLI to show its key prompt even if the server has a global Zen key.
    delete childEnvironment.OPENCODE_API_KEY;
    const child = spawn(expectPath, ["-c", script], {
      env: childEnvironment,
      stdio: ["pipe", "ignore", "ignore"],
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill();
      resolve(124);
    }, 70_000);
    timer.unref?.();
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(`${secret}\n`);
  });

  if (exitCode === 124) throw new Error("OpenCode CLI API-key login timed out. Check the CLI path and try again.");
  if (exitCode !== 0) throw new Error("OpenCode CLI API-key login failed. Check the OpenCode Zen API key and try again.");
  return { logged_in: true, path: cliStatus.path, warning: null };
}

function managedDirectory(): string {
  return resolve(config.dataDir, "openfree");
}

function managedBinaryPath(): string {
  return join(managedDirectory(), EXECUTABLE_NAME);
}

function managedVersion(): string | null {
  try {
    return readFileSync(join(managedDirectory(), "version.txt"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

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
  const managedPath = managedBinaryPath();
  if (isExecutableFile(managedPath)) {
    return { path: managedPath, source: "KloveRouter managed install" };
  }

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
  const managedPath = managedBinaryPath();
  const managedInstalled = isExecutableFile(managedPath);
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
      return {
        path: candidate,
        source: override.source,
        saved_path: databasePath,
        warning,
        managed_path: managedPath,
        managed_installed: managedInstalled,
        managed_version: managedInstalled ? managedVersion() : null,
      };
    }
    warning = `Ignoring ${override.source}: the configured path is not an executable file.`;
  }

  const detected = findInstalledCli();
  if (detected) {
    return {
      ...detected,
      saved_path: databasePath,
      warning,
      managed_path: managedPath,
      managed_installed: managedInstalled,
      managed_version: managedInstalled ? managedVersion() : null,
    };
  }

  return {
    path: null,
    source: null,
    saved_path: databasePath,
    warning,
    managed_path: managedPath,
    managed_installed: managedInstalled,
    managed_version: managedInstalled ? managedVersion() : null,
  };
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

function openCodeTarget(): string {
  const platform = process.platform === "win32"
    ? "windows"
    : process.platform === "darwin"
      ? "darwin"
      : process.platform === "linux"
        ? "linux"
        : null;
  if (!platform) throw new Error(`OpenCode CLI installation is not supported on ${process.platform}.`);

  const arch = process.arch === "x64"
    ? "x64"
    : process.arch === "arm64"
      ? "arm64"
      : null;
  if (!arch) throw new Error(`OpenCode CLI installation is not supported on ${process.arch}.`);

  // The baseline build runs on all x64 CPUs; arm64 has no separate baseline variant.
  let target = `${platform}-${arch}${arch === "x64" ? "-baseline" : ""}`;
  if (platform === "linux") {
    let isMusl = existsSync("/etc/alpine-release");
    if (!isMusl && Bun.which("ldd")) {
      try {
        const result = Bun.spawnSync(["ldd", "--version"]);
        const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;
        isMusl = /musl/i.test(output);
      } catch {
        // Use the standard glibc package when libc cannot be identified.
      }
    }
    if (isMusl) target += "-musl";
  }
  return target;
}

async function responseJson(url: string, timeout: number): Promise<any> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`OpenCode package metadata request failed (HTTP ${response.status}).`);
  return response.json();
}

async function computeSha512(filePath: string): Promise<string> {
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return `sha512-${hash.digest("base64")}`;
}

async function downloadAndInstall(): Promise<OpenFreeCliStatus> {
  const latest = await responseJson(OPENCODE_LATEST_API, 15_000);
  const version = typeof latest?.version === "string" ? latest.version : "";
  const cliPackage = typeof latest?.metadata?.package === "string" ? latest.metadata.package : "";
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("OpenCode returned an invalid CLI version.");
  }
  if (!/^@[a-z0-9-]+\/cli$/.test(cliPackage)) {
    throw new Error("OpenCode returned an unexpected CLI package name.");
  }

  const packageName = `${cliPackage.slice(0, -"/cli".length)}/cli-${openCodeTarget()}`;
  const encodedPackageName = packageName.replace("/", "%2f");
  const npmMetadata = await responseJson(
    `${NPM_REGISTRY}/${encodedPackageName}/${encodeURIComponent(version)}`,
    20_000,
  );
  if (npmMetadata?.name !== packageName || npmMetadata?.version !== version) {
    throw new Error("The OpenCode CLI package metadata does not match the requested package version.");
  }
  const tarballUrl = typeof npmMetadata?.dist?.tarball === "string" ? npmMetadata.dist.tarball : "";
  const integrity = typeof npmMetadata?.dist?.integrity === "string" ? npmMetadata.dist.integrity : "";
  let parsedTarballUrl: URL;
  try {
    parsedTarballUrl = new URL(tarballUrl);
  } catch {
    throw new Error("OpenCode returned an invalid CLI package download URL.");
  }
  if (parsedTarballUrl.protocol !== "https:" || parsedTarballUrl.hostname !== "registry.npmjs.org") {
    throw new Error("OpenCode returned an unexpected CLI package download URL.");
  }
  if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity)) {
    throw new Error("The OpenCode CLI package has no valid SHA-512 integrity value.");
  }

  const directory = managedDirectory();
  await mkdir(directory, { recursive: true });
  const staging = await mkdtemp(join(directory, `.install-${randomUUID()}-`));
  const archivePath = join(staging, "opencode-cli.tgz");
  const extractDirectory = join(staging, "extract");
  try {
    const response = await fetch(tarballUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`OpenCode CLI download failed (HTTP ${response.status}).`);
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_PACKAGE_BYTES) {
      throw new Error("The OpenCode CLI package exceeds the 500 MB download limit.");
    }
    await Bun.write(archivePath, response);
    const archiveSize = statSync(archivePath).size;
    if (archiveSize > MAX_PACKAGE_BYTES) throw new Error("The OpenCode CLI package exceeds the 500 MB download limit.");
    if (await computeSha512(archivePath) !== integrity) {
      throw new Error("OpenCode CLI package integrity verification failed.");
    }

    const entries = execFileSync("tar", ["-tzf", archivePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    }).split(/\r?\n/).filter(Boolean);
    if (entries.some((entry) => {
      const path = entry.replace(/\\/g, "/").replace(/\/+$/, "");
      return path.startsWith("/") || (path !== "package" && !path.startsWith("package/")) || path.split("/").some((part) => part === ".." || part === ".");
    })) {
      throw new Error("The OpenCode CLI package contains an unsafe archive path.");
    }
    const packageBinary = `package/bin/${EXECUTABLE_NAME}`;
    if (!entries.includes(packageBinary)) throw new Error("The OpenCode CLI package does not contain its executable.");

    await mkdir(extractDirectory, { recursive: true });
    execFileSync("tar", ["-xzf", archivePath, "-C", extractDirectory, packageBinary], {
      stdio: "pipe",
      timeout: 60_000,
    });
    const stagedBinary = join(extractDirectory, packageBinary);
    if (!(await lstat(stagedBinary)).isFile()) throw new Error("The extracted OpenCode CLI is not a regular file.");
    if (process.platform !== "win32") await chmod(stagedBinary, 0o755);

    const versionCheck = Bun.spawnSync([stagedBinary, "--version"]);
    const versionOutput = `${versionCheck.stdout.toString()}\n${versionCheck.stderr.toString()}`.trim();
    if (versionCheck.exitCode !== 0 || !versionOutput) {
      throw new Error("The downloaded OpenCode CLI failed its version check.");
    }

    const installedBinary = managedBinaryPath();
    if (process.platform === "win32") await rm(installedBinary, { force: true });
    await rename(stagedBinary, installedBinary);
    await writeFile(join(directory, "version.txt"), version);
    getDb().query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(SETTING_KEY, installedBinary);
    return getOpenfreeCliStatus();
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

export function installOpenfreeCli(): Promise<OpenFreeCliStatus> {
  if (!installOperation) {
    installOperation = downloadAndInstall().finally(() => {
      installOperation = null;
    });
  }
  return installOperation;
}
