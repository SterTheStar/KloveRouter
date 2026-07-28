import { Elysia, t } from "elysia";
import { logger } from "../../logger";
import {
  isCavemanEnabled,
  getCavemanLevel,
  setCavemanEnabled,
  setCavemanLevel,
  getCavemanStatus,
} from "./caveman.proxy";
import { cavemanBinary } from "./caveman.binary";
import { CAVEMAN_LEVELS } from "./caveman.prompt";
import type { CavemanLevel } from "./caveman.types";

export const cavemanPublicPlugin = (app: Elysia) =>
  app.get("/api/caveman/status", async () => {
    const status = await getCavemanStatus();
    return { ...status, skillPath: null };
  });

export const cavemanPlugin = (app: Elysia) =>
  app
    .post("/api/caveman/enable", async () => {
      if (!(await cavemanBinary.isInstalled())) {
        return { success: false, message: "Install Caveman before enabling it" };
      }
      setCavemanEnabled(true);
      logger.success("Caveman enabled");
      return { success: true, message: "Caveman enabled", level: getCavemanLevel() };
    })
    .post("/api/caveman/disable", async () => {
      setCavemanEnabled(false);
      logger.info("Caveman disabled");
      return { success: true, message: "Caveman disabled" };
    })
    .post("/api/caveman/level", async ({ body, set }) => {
      const { level } = body;
      if (!CAVEMAN_LEVELS.includes(level as CavemanLevel)) {
        set.status = 400;
        return { success: false, message: `Invalid level. Must be one of: ${CAVEMAN_LEVELS.join(", ")}` };
      }
      setCavemanLevel(level as CavemanLevel);
      logger.info(`Caveman level set to ${level}`);
      return { success: true, message: `Caveman level set to ${level}`, level };
    }, { body: t.Object({ level: t.String() }) })
    .post("/api/caveman/install", async ({ set }) => {
      try {
        const skillPath = await cavemanBinary.ensureInstalled();
        logger.success(`Caveman skill installed at ${skillPath}`);
        return { success: true, skillPath };
      } catch (error) {
        set.status = 500;
        logger.error("Caveman install failed", { error });
        return { success: false, message: "Caveman installation failed" };
      }
    })
    .post("/api/caveman/uninstall", async () => {
      await cavemanBinary.uninstall();
      logger.info("Caveman uninstalled");
      return { success: true, message: "Caveman uninstalled" };
    })
    .post("/api/caveman/update", async ({ set }) => {
      try {
        const skillPath = await cavemanBinary.update();
        logger.success(`Caveman updated to latest version at ${skillPath}`);
        return { success: true, skillPath, message: "Caveman updated" };
      } catch (error) {
        set.status = 500;
        logger.error("Caveman update failed", { error });
        return { success: false, message: "Caveman update failed" };
      }
    });
