import { Elysia, t } from "elysia";
import { userInfo } from "node:os";
import { getDb } from "../db/connection";

function defaultProfileName() {
  try {
    return userInfo().username || process.env.USERNAME || process.env.USER || process.env.LOGNAME || "User";
  } catch {
    return process.env.USERNAME || process.env.USER || process.env.LOGNAME || "User";
  }
}

export const settingsPlugin = (app: Elysia) =>
  app.get("/api/settings/profile", () => {
    const db = getDb();
    const name = (db.query("SELECT value FROM settings WHERE key = ?").get("profile_name") as { value: string } | undefined)?.value || defaultProfileName();
    const avatar = (db.query("SELECT value FROM settings WHERE key = ?").get("profile_avatar") as { value: string } | undefined)?.value || null;
    return { name, avatar };
  })
  .put("/api/settings/profile", ({ body, set }) => {
    const name = body.name.trim();
    if (!name) { set.status = 400; return { error: "Profile name is required" }; }
    if (name.length > 40) { set.status = 400; return { error: "Profile name must be 40 characters or fewer" }; }
    const db = getDb();
    db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("profile_name", name);
    db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("profile_avatar", body.avatar || "");
    return { name, avatar: body.avatar || null };
  }, { body: t.Object({ name: t.String(), avatar: t.Optional(t.Union([t.String(), t.Null()])) }) })
  .put(
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
