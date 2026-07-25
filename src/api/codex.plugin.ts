import { Elysia, t } from "elysia";
import { CODEX_CALLBACK_HTML, codexAuthService, codexModels } from "../integrations/codex";

export const codexPublicPlugin = (app: Elysia) =>
  app.get("/auth/callback", async ({ query, set }) => {
    try {
      if (!query.code || !query.state) {
        set.status = 400;
        return "Missing OAuth code or state";
      }
      await codexAuthService.completeLogin(query.code, query.state);
      return new Response(CODEX_CALLBACK_HTML, { headers: { "Content-Type": "text/html" } });
    } catch (error: any) {
      set.status = 400;
      return `Codex OAuth failed: ${error.message}`;
    }
  }, { query: t.Object({ code: t.Optional(t.String()), state: t.Optional(t.String()), error: t.Optional(t.String()) }) });

export const codexPlugin = (app: Elysia) =>
  app
    .get("/api/codex/status", () => codexAuthService.status())
    .post("/api/codex/login", () => codexAuthService.startLogin())
    .post("/api/codex/logout", () => codexAuthService.logout())
    .post("/api/codex/refresh", () => codexAuthService.refresh())
    .get("/api/codex/models", async () => codexModels());
