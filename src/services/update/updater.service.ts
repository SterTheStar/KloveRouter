import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "../../db/connection";
import { logger } from "../../logger";
import { CURRENT_VERSION, isPrereleaseVersion } from "../../version";
import {
  checkForUpdates,
  DEFAULT_REPO,
  getEffectiveRepo,
  type CheckUpdateResult,
  type GitHubReleaseInfo,
} from "./github-release.service";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "downloading"
  | "installing_deps"
  | "building"
  | "ready_restart"
  | "error";

export interface UpdateProgressState {
  status: UpdateStatus;
  step: string;
  progress: number;
  error: string | null;
  targetVersion: string | null;
  targetTag: string | null;
  startedAt: string | null;
  completedAt: string | null;
  logs: string[];
}

export interface UpdateSettings {
  autoCheck: boolean;
  includePrerelease: boolean;
  /** True when running a beta/prerelease build, which always follows prereleases. */
  includePrereleaseLocked: boolean;
  lastCheck: string | null;
}

let currentState: UpdateProgressState = {
  status: "idle",
  step: "Ready",
  progress: 0,
  error: null,
  targetVersion: null,
  targetTag: null,
  startedAt: null,
  completedAt: null,
  logs: [],
};

const MAX_LOG_LINES = 100;

function appendLog(line: string): void {
  const timestamp = new Date().toLocaleTimeString();
  const formatted = `[${timestamp}] ${line}`;
  currentState.logs.push(formatted);
  if (currentState.logs.length > MAX_LOG_LINES) {
    currentState.logs.shift();
  }
}

function updateProgress(
  status: UpdateStatus,
  step: string,
  progress: number,
  error: string | null = null,
): void {
  currentState.status = status;
  currentState.step = step;
  currentState.progress = progress;
  if (error) currentState.error = error;
  appendLog(`${step}${error ? ` - Error: ${error}` : ""}`);
}

/**
 * Reads updater settings from the SQLite database.
 */
export function getUpdateSettings(): UpdateSettings {
  const db = getDb();
  const rows = db
    .query("SELECT key, value FROM settings WHERE key IN (?, ?, ?)")
    .all(
      "update_auto_check",
      "update_include_prerelease",
      "update_last_check",
    ) as Array<{ key: string; value: string }>;

  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const locked = isPrereleaseVersion(CURRENT_VERSION);

  return {
    autoCheck: map.update_auto_check !== "false", // default true
    includePrerelease: locked || map.update_include_prerelease === "true",
    includePrereleaseLocked: locked,
    lastCheck: map.update_last_check || null,
  };
}

/**
 * Saves updater settings to the SQLite database.
 */
export function saveUpdateSettings(settings: Partial<UpdateSettings>): UpdateSettings {
  const db = getDb();
  const current = getUpdateSettings();
  const merged: UpdateSettings = {
    ...current,
    ...settings,
  };

  const updateTx = db.transaction(() => {
    db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
      "update_auto_check",
      String(merged.autoCheck),
    );
    // On a prerelease build the option is forced on, so the stored preference is
    // left untouched and applies again once the user is back on a stable build.
    if (!current.includePrereleaseLocked) {
      db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
        "update_include_prerelease",
        String(merged.includePrerelease),
      );
    }
    if (merged.lastCheck) {
      db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
        "update_last_check",
        merged.lastCheck,
      );
    }
  });

  updateTx();
  return merged;
}

/**
 * Returns current update progress state.
 */
export function getUpdateProgress(): UpdateProgressState {
  return { ...currentState };
}

/**
 * Executes a shell command using Bun.spawn, collecting output in logs.
 */
async function executeCommand(
  cmd: string[],
  cwd = process.cwd(),
): Promise<{ exitCode: number; output: string }> {
  appendLog(`> ${cmd.join(" ")}`);
  try {
    const proc = Bun.spawn(cmd, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const code = await proc.exited;
    const combined = (stdout + "\n" + stderr).trim();
    if (combined) {
      for (const line of combined.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) appendLog(`  ${trimmed}`);
      }
    }
    return { exitCode: code, output: combined };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    appendLog(`  Command failed: ${errorMsg}`);
    return { exitCode: 1, output: errorMsg };
  }
}

/**
 * Applies an update to the specified release.
 */
export async function applyUpdate(release: GitHubReleaseInfo): Promise<UpdateProgressState> {
  if (
    currentState.status !== "idle" &&
    currentState.status !== "error" &&
    currentState.status !== "ready_restart"
  ) {
    throw new Error(`Update is already in progress (current step: ${currentState.step})`);
  }

  const rootDir = process.cwd();
  const isGitRepo = existsSync(join(rootDir, ".git"));

  currentState = {
    status: "checking",
    step: "Starting update...",
    progress: 5,
    error: null,
    targetVersion: release.version,
    targetTag: release.tag,
    startedAt: new Date().toISOString(),
    completedAt: null,
    logs: [],
  };

  logger.info(`Starting SaturnRouter update to ${release.tag} (${release.version})`);

  // Run asynchronously without blocking HTTP response
  (async () => {
    try {
      if (isGitRepo) {
        // --- GIT MODE ---
        updateProgress("downloading", "Fetching latest tags from git origin...", 20);
        const fetchRes = await executeCommand(["git", "fetch", "--tags", "origin"]);
        if (fetchRes.exitCode !== 0) {
          throw new Error(`git fetch failed: ${fetchRes.output}`);
        }

        updateProgress("downloading", `Checking out version ${release.tag}...`, 40);
        // Try checkout tag
        const checkoutRes = await executeCommand(["git", "checkout", `tags/${release.tag}`]);
        if (checkoutRes.exitCode !== 0) {
          // If checkout tag failed, fallback to pulling main if tag not yet pushed
          appendLog(`Direct tag checkout failed, attempting fetch and checkout without tags prefix...`);
          const fallbackRes = await executeCommand(["git", "checkout", release.tag]);
          if (fallbackRes.exitCode !== 0) {
            throw new Error(`Failed to checkout tag ${release.tag}: ${checkoutRes.output}`);
          }
        }
      } else {
        // --- ZIP/TARBALL FALLBACK MODE ---
        updateProgress("downloading", "Downloading release archive from GitHub...", 25);
        const downloadUrl = release.tarballUrl || release.zipballUrl;
        if (!downloadUrl) {
          throw new Error("No download URL available for release archive");
        }
        appendLog(`Downloading from: ${downloadUrl}`);
        // Fetch archive
        const res = await fetch(downloadUrl, {
          headers: {
            "User-Agent": `SaturnRouter/${CURRENT_VERSION}`,
            Accept: "application/octet-stream",
          },
        });
        if (!res.ok) {
          throw new Error(`Failed to download archive: ${res.statusText}`);
        }
        // Note: Git mode is the default and standard for SaturnRouter (git clone).
      }

      // --- STEP: INSTALL DEPENDENCIES ---
      updateProgress("installing_deps", "Installing dependencies with bun...", 60);
      const installRes = await executeCommand(["bun", "install"], rootDir);
      if (installRes.exitCode !== 0) {
        throw new Error(`bun install failed: ${installRes.output}`);
      }

      // Also ensure web dependencies are in sync if web directory exists
      if (existsSync(join(rootDir, "web", "package.json"))) {
        updateProgress("installing_deps", "Installing web dependencies...", 75);
        const webInstallRes = await executeCommand(["bun", "install"], join(rootDir, "web"));
        if (webInstallRes.exitCode !== 0) {
          throw new Error(`bun install in web directory failed: ${webInstallRes.output}`);
        }
      }

      // --- STEP: BUILD FRONTEND ---
      updateProgress("building", "Building frontend assets...", 85);
      const buildRes = await executeCommand(["bun", "run", "build"], join(rootDir, "web"));
      if (buildRes.exitCode !== 0) {
        throw new Error(`Frontend build failed: ${buildRes.output}`);
      }

      // --- STEP: COMPLETED ---
      currentState.completedAt = new Date().toISOString();
      updateProgress(
        "ready_restart",
        `Update to ${release.tag} installed successfully! Restart required.`,
        100,
      );
      logger.success(`SaturnRouter update to ${release.tag} installed successfully.`);
    } catch (err: any) {
      const msg = err?.message || String(err);
      logger.error(`Update failed: ${msg}`);
      updateProgress("error", "Update failed", currentState.progress, msg);
    }
  })();

  return currentState;
}

/**
 * Resets updater state back to idle if in error or ready_restart.
 */
export function resetUpdateState(): UpdateProgressState {
  if (currentState.status === "error" || currentState.status === "ready_restart") {
    currentState = {
      status: "idle",
      step: "Ready",
      progress: 0,
      error: null,
      targetVersion: null,
      targetTag: null,
      startedAt: null,
      completedAt: null,
      logs: [],
    };
  }
  return currentState;
}

/**
 * Triggers a graceful application restart.
 */
export function restartApplication(): { success: boolean; message: string } {
  logger.info("Restart requested via Update system. Shutting down in 500ms...");

  setTimeout(() => {
    logger.info("Exiting SaturnRouter process for restart...");
    process.exit(0);
  }, 500);

  return {
    success: true,
    message: "SaturnRouter is restarting...",
  };
}

/**
 * Background auto-check initialization.
 */
let autoCheckTimer: Timer | null = null;

export function initUpdateCheckOnStartup(): void {
  const settings = getUpdateSettings();
  if (!settings.autoCheck) {
    return;
  }

  // Delay first check slightly to let server finish bootstrapping
  setTimeout(async () => {
    try {
      logger.debug("Performing scheduled update check...");
      const result = await checkForUpdates({
        repo: DEFAULT_REPO,
        includePrereleases: settings.includePrerelease,
      });

      saveUpdateSettings({ lastCheck: result.checkedAt });

      if (result.hasUpdate && result.latestRelease) {
        logger.badge(
          "UPDATE",
          `New SaturnRouter release available: ${result.latestRelease.tag} (current: v${CURRENT_VERSION})`,
        );
      }
    } catch {
      // Ignore background check errors
    }
  }, 10000);

  // Periodically check every 6 hours
  if (!autoCheckTimer) {
    autoCheckTimer = setInterval(async () => {
      const current = getUpdateSettings();
      if (!current.autoCheck) return;
      try {
        const result = await checkForUpdates({
          repo: DEFAULT_REPO,
          includePrereleases: current.includePrerelease,
        });
        saveUpdateSettings({ lastCheck: result.checkedAt });
      } catch {}
    }, 6 * 60 * 60 * 1000);
    autoCheckTimer.unref?.();
  }
}
