import { Elysia } from "elysia";
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
  app.get("/api/caveman/status", async () => getCavemanStatus());

export const cavemanPlugin = (app: Elysia) =>
  app
    .post("/api/caveman/enable", async () => {
      setCavemanEnabled(true);
      logger.success("Caveman enabled");
      return { success: true, message: "Caveman enabled", level: getCavemanLevel() };
    })
    .post("/api/caveman/disable", async () => {
      setCavemanEnabled(false);
      logger.info("Caveman disabled");
      return { success: true, message: "Caveman disabled" };
    })
    .post("/api/caveman/level", async ({ body, set }: any) => {
      const { level } = body as { level: string };
      if (!CAVEMAN_LEVELS.includes(level as CavemanLevel)) {
        set.status = 400;
        return { success: false, message: `Invalid level. Must be one of: ${CAVEMAN_LEVELS.join(", ")}` };
      }
      setCavemanLevel(level as CavemanLevel);
      logger.info(`Caveman level set to ${level}`);
      return { success: true, message: `Caveman level set to ${level}`, level };
    })
    .post("/api/caveman/install", async ({ set }) => {
      try {
        const skillPath = await cavemanBinary.ensureInstalled();
        return { success: true, skillPath };
      } catch (error: any) {
        set.status = 500;
        return { success: false, message: error.message };
      }
    })
    .post("/api/caveman/uninstall", async () => {
      await cavemanBinary.uninstall();
      logger.info("Caveman uninstalled");
      return { success: true, message: "Caveman uninstalled" };
    });
