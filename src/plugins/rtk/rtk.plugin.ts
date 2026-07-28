import { Elysia } from "elysia";
import { getDb } from "../../db/connection";
import { logger } from "../../logger";
import { rtkManager } from "./rtk.manager";
import { rtkBinary } from "./rtk.binary";

function isRtkEnabled(): boolean {
  const db = getDb();
  const row = db
    .query("SELECT value FROM settings WHERE key = ?")
    .get("rtk_enabled") as { value: string } | undefined;
  return row?.value === "1";
}

function setRtkEnabled(enabled: boolean): void {
  const db = getDb();
  db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    "rtk_enabled",
    enabled ? "1" : "0",
  );
}

export const rtkPublicPlugin = (app: Elysia) =>
  app.get("/api/rtk/status", async () => {
    return rtkManager.getStatus();
  });

export const rtkPlugin = (app: Elysia) =>
  app
    .post("/api/rtk/enable", async ({ set }) => {
      try {
        await rtkManager.enable();
        setRtkEnabled(true);
        return { success: true, message: "RTK enabled for proxy tool output" };
      } catch (error: any) {
        set.status = 500;
        return { success: false, message: error.message };
      }
    })
    .post("/api/rtk/disable", async () => {
      rtkManager.disable();
      setRtkEnabled(false);
      return { success: true, message: "RTK disabled for proxy tool output" };
    })
    .post("/api/rtk/install", async ({ set }) => {
      try {
        const binPath = await rtkBinary.ensureBinary();
        return { success: true, binaryPath: binPath };
      } catch (error: any) {
        set.status = 500;
        return { success: false, message: error.message };
      }
    })
    .post("/api/rtk/update", async ({ set }) => {
      try {
        const binPath = await rtkBinary.update();
        return { success: true, binaryPath: binPath, message: "RTK updated" };
      } catch (error: any) {
        set.status = 500;
        return { success: false, message: error.message };
      }
    });

export function initRtkOnStartup(): void {
  if (!isRtkEnabled()) return;

  logger.info("RTK is enabled in settings, initializing...");

  rtkManager.enable().catch((err) => {
    setRtkEnabled(false);
    logger.error("Failed to auto-start RTK", { error: err });
  });
}
