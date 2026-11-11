import { Elysia, t } from "elysia";
import { CURRENT_VERSION } from "../version";
import {
  checkForUpdates,
  fetchReleasesFromGitHub,
  getEffectiveRepo,
} from "../services/update/github-release.service";
import {
  applyUpdate,
  getUpdateProgress,
  getUpdateSettings,
  resetUpdateState,
  restartApplication,
  saveUpdateSettings,
} from "../services/update/updater.service";

export const updatesPlugin = (app: Elysia) =>
  app
    .get("/api/updates/status", async () => {
      const settings = getUpdateSettings();
      const progress = getUpdateProgress();
      const repo = getEffectiveRepo();

      // Fast check with cache
      const checkResult = await checkForUpdates({
        repo,
        includePrereleases: settings.includePrerelease,
        force: false,
      });

      return {
        currentVersion: CURRENT_VERSION,
        hasUpdate: checkResult.hasUpdate,
        latestRelease: checkResult.latestRelease,
        lastCheck: settings.lastCheck,
        repo,
        progress,
        settings,
      };
    })
    .post("/api/updates/check", async () => {
      const settings = getUpdateSettings();
      const repo = getEffectiveRepo();

      const checkResult = await checkForUpdates({
        repo,
        includePrereleases: settings.includePrerelease,
        force: true,
      });

      saveUpdateSettings({ lastCheck: checkResult.checkedAt });

      return {
        ...checkResult,
        settings: getUpdateSettings(),
      };
    })
    .get("/api/updates/releases", async () => {
      const repo = getEffectiveRepo();
      const releases = await fetchReleasesFromGitHub(repo, false);

      return {
        repo,
        currentVersion: CURRENT_VERSION,
        releases,
      };
    })
    .get("/api/updates/progress", () => {
      return getUpdateProgress();
    })
    .post("/api/updates/reset", () => {
      return resetUpdateState();
    })
    .post(
      "/api/updates/apply",
      async ({ body, set }) => {
        try {
          const settings = getUpdateSettings();
          const repo = getEffectiveRepo();

          let targetRelease = null;
          if (body?.releaseTag) {
            const allReleases = await fetchReleasesFromGitHub(repo, false);
            targetRelease = allReleases.find((r) => r.tag === body.releaseTag) || null;
            if (!targetRelease) {
              set.status = 404;
              return { error: `Release tag "${body.releaseTag}" not found on GitHub` };
            }
          } else {
            const check = await checkForUpdates({
              repo,
              includePrereleases: settings.includePrerelease,
              force: false,
            });
            targetRelease = check.latestRelease;
            if (!targetRelease) {
              set.status = 400;
              return { error: "No newer release available to install" };
            }
          }

          const state = await applyUpdate(targetRelease);
          return {
            success: true,
            message: `Updating to ${targetRelease.tag}...`,
            progress: state,
          };
        } catch (error: any) {
          set.status = 400;
          return { error: error?.message || String(error) };
        }
      },
      {
        body: t.Optional(
          t.Object({
            releaseTag: t.Optional(t.String()),
          }),
        ),
      },
    )
    .post("/api/updates/restart", () => {
      return restartApplication();
    })
    .get("/api/updates/settings", () => {
      return getUpdateSettings();
    })
    .put(
      "/api/updates/settings",
      ({ body }) => {
        return saveUpdateSettings(body);
      },
      {
        body: t.Object({
          autoCheck: t.Optional(t.Boolean()),
          includePrerelease: t.Optional(t.Boolean()),
        }),
      },
    );
