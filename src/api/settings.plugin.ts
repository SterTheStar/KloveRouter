import { Elysia, t } from "elysia";
import { getDb } from "../db/connection";

export const settingsPlugin = (app: Elysia) =>
  app.put(
    "/api/settings/password",
    ({ body, set }) => {
      const db = getDb();

      // Verify current password
      const row = db
        .query("SELECT value FROM settings WHERE key = ?")
        .get("panel_password") as { value: string } | undefined;

      if (row) {
        const valid = Bun.password.verifySync(body.current_password, row.value);
        if (!valid) {
          set.status = 403;
          return { error: "Current password is incorrect" };
        }
      }

      if (body.new_password.length < 4) {
        set.status = 400;
        return { error: "New password must be at least 4 characters" };
      }

      const hash = Bun.password.hashSync(body.new_password, {
        algorithm: "bcrypt",
        cost: 10,
      });

      db.query(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"
      ).run("panel_password", hash);

      return { success: true, message: "Password updated successfully" };
    },
    {
      body: t.Object({
        current_password: t.String(),
        new_password: t.String({ minLength: 4 }),
      }),
    }
  );
