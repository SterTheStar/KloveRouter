import { Elysia, t } from "elysia";
import { getDb } from "../db/connection";
function isConfigured() {
  return Boolean(
    getDb().query("SELECT value FROM settings WHERE key = ?").get("panel_password") as { value: string } | undefined,
  );
}

export const setupPlugin = (app: Elysia) =>
  app
    .get("/api/setup/status", () => ({ needs_setup: !isConfigured() }))
    .post(
      "/api/setup",
      ({ body, set }) => {
        const name = body.name.trim();
        if (!name) {
          set.status = 400;
          return { error: "Profile name is required" };
        }
        if (name.length > 40) {
          set.status = 400;
          return { error: "Profile name must be 40 characters or fewer" };
        }
        if (body.password.length < 6) {
          set.status = 400;
          return { error: "Password must be at least 6 characters" };
        }
        if (body.password !== body.confirm_password) {
          set.status = 400;
          return { error: "Passwords do not match" };
        }

        const db = getDb();
        db.exec("BEGIN IMMEDIATE");
        try {
          const existing = db
            .query("SELECT value FROM settings WHERE key = ?")
            .get("panel_password") as { value: string } | undefined;
          if (existing) {
            db.exec("ROLLBACK");
            set.status = 409;
            return { error: "Setup already completed", needs_setup: false };
          }
          const hash = Bun.password.hashSync(body.password, {
            algorithm: "bcrypt",
            cost: 10,
          });
          db.query("INSERT INTO settings (key, value) VALUES (?, ?)").run("panel_password", hash);
          db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("profile_name", name);
          db.exec("COMMIT");
          return { success: true, needs_setup: false };
        } catch (error) {
          try { db.exec("ROLLBACK"); } catch {}
          throw error;
        }
      },
      {
        body: t.Object({
          name: t.String(),
          password: t.String(),
          confirm_password: t.String(),
        }),
      },
    );
