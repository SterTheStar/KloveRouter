import { Elysia, t } from "elysia";
import { getDb } from "../db/connection";

export const authPlugin = (app: Elysia) =>
  app
    .post(
      "/api/auth/login",
      async ({ body, jwt, set }) => {
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
        return { token };
      },
      {
        body: t.Object({
          password: t.String(),
        }),
      }
    )
    .get("/api/auth/verify", async ({ jwt, headers, set }) => {
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
      return { valid: true, role: payload.role };
    });
