import { Elysia, t } from "elysia";
import { getDb } from "../db/connection";
import { logger } from "../logger";

export const authPlugin = (app: Elysia) =>
  app
    .post(
      "/api/auth/login",
      async ({ body, jwt, set }: any) => {
        const db = getDb();
        const row = db
          .query("SELECT value FROM settings WHERE key = ?")
          .get("panel_password") as { value: string } | undefined;

        if (!row) {
          set.status = 500;
          return { error: "Panel password not configured" };
        }

        const valid = Bun.password.verifySync(body.password, row.value);
        if (!valid) {
          set.status = 401;
          return { error: "Invalid password" };
        }

        const token = await jwt.sign({ role: "admin" });
        logger.success("Panel login accepted");
        return { token };
      },
      {
        body: t.Object({
          password: t.String(),
        }),
      },
    )
    .get("/api/auth/verify", async ({ jwt, headers, set }: any) => {
      const auth = headers.authorization;
      if (!auth || !auth.startsWith("Bearer ")) {
        set.status = 401;
        return { error: "Unauthorized", valid: false };
      }
      const payload = await jwt.verify(auth.slice(7));
      if (!payload) {
        set.status = 401;
        return { error: "Invalid token", valid: false };
      }
      logger.debug("Panel token verified", { role: payload.role });
      return { valid: true, role: payload.role };
    });
