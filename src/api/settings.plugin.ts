import { Elysia, t } from "elysia";
import { userInfo } from "node:os";
import { getDb } from "../db/connection";
import { isValidAvatar } from "../services/provider-appearance";
import { modelService } from "../services/model.service";

function defaultProfileName() {
  try {
    return (
      userInfo().username ||
      process.env.USERNAME ||
      process.env.USER ||
      process.env.LOGNAME ||
      "User"
    );
  } catch {
    return (
      process.env.USERNAME || process.env.USER || process.env.LOGNAME || "User"
    );
  }
}

export const settingsPlugin = (app: Elysia) =>
  app
    .get("/api/settings/chat", () => {
      const row = getDb().query("SELECT value FROM settings WHERE key = ?").get("chat_title_model") as { value: string } | undefined;
      return { chat_title_model: row?.value || "auto" };
    })
    .put(
      "/api/settings/chat",
      ({ body, set }) => {
        const value = body.chat_title_model.trim();
        if (value !== "auto") {
          const valid = modelService.findAllActiveWithProvider().some(
            (model) => `${model.provider_name.toLowerCase().replace(/\s+/g, "")}/${model.model_id}` === value,
          );
          if (!valid) {
            set.status = 400;
            return { error: "Chat title model must be auto or an active configured model" };
          }
        }
        getDb().query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("chat_title_model", value);
        return { chat_title_model: value };
      },
      { body: t.Object({ chat_title_model: t.String({ minLength: 1 }) }) },
    )
    .get("/api/settings/profile", () => {
      const db = getDb();
      const name =
        (
          db
            .query("SELECT value FROM settings WHERE key = ?")
            .get("profile_name") as { value: string } | undefined
        )?.value || defaultProfileName();
      const avatar =
        (
          db
            .query("SELECT value FROM settings WHERE key = ?")
            .get("profile_avatar") as { value: string } | undefined
        )?.value || null;
      return { name, avatar };
    })
    .put(
      "/api/settings/profile",
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
        if (!isValidAvatar(body.avatar)) {
          set.status = 400;
          return { error: "Avatar must be an image URL or an image up to 25 MB" };
        }
        const db = getDb();
        db.query(
          "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ).run("profile_name", name);
        db.query(
          "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ).run("profile_avatar", body.avatar || "");
        return { name, avatar: body.avatar || null };
      },
      {
        body: t.Object({
          name: t.String(),
          avatar: t.Optional(t.Union([t.String(), t.Null()])),
        }),
      },
    )
    .put(
      "/api/settings/password",
      ({ body, set }) => {
        const db = getDb();

        // Verify current password
        const row = db
          .query("SELECT value FROM settings WHERE key = ?")
          .get("panel_password") as { value: string } | undefined;

        if (row) {
          const valid = Bun.password.verifySync(
            body.current_password,
            row.value,
          );
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
          "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        ).run("panel_password", hash);

        return { success: true, message: "Password updated successfully" };
      },
      {
        body: t.Object({
          current_password: t.String(),
          new_password: t.String({ minLength: 4 }),
        }),
      },
    );
