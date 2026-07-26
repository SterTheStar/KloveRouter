import { Elysia, t } from "elysia";
import {
  CODEX_CALLBACK_HTML,
  codexAuthService,
  codexConsumeResetCredit,
  codexModels,
  codexResetCredits,
  codexUsage,
} from "../integrations/codex";
import { logger } from "../logger";
import { credentialService } from "../services/credential.service";
import {
  ANTIGRAVITY_CALLBACK_HTML,
  antigravityAuthService,
} from "../integrations/antigravity";
import { antigravityUsage } from "../integrations/antigravity";
import { parseManualOAuthCallback } from "../integrations/oauth-callback";

export const codexPublicPlugin = (app: Elysia) =>
  app.get(
    "/auth/callback",
    async ({ query, set }) => {
      try {
        if (!query.code || !query.state) {
          set.status = 400;
          return "Missing OAuth code or state";
        }
        await codexAuthService.completeLogin(query.code, query.state);
        logger.success("Codex OAuth callback completed");
        return new Response(CODEX_CALLBACK_HTML, {
          headers: { "Content-Type": "text/html" },
        });
      } catch (error: any) {
        set.status = 400;
        return `Codex OAuth failed: ${error.message}`;
      }
    },
    {
      query: t.Object({
        code: t.Optional(t.String()),
        state: t.Optional(t.String()),
        error: t.Optional(t.String()),
      }),
    },
  );

export const antigravityPublicPlugin = (app: Elysia) =>
  app.get(
    "/antigravity/callback",
    async ({ query, set }) => {
      try {
        if (!query.code || !query.state) {
          set.status = 400;
          return "Missing OAuth code or state";
        }
        await antigravityAuthService.completeLogin(query.code, query.state);
        return new Response(ANTIGRAVITY_CALLBACK_HTML, {
          headers: { "Content-Type": "text/html" },
        });
      } catch (error: any) {
        set.status = 400;
        return `Antigravity OAuth failed: ${error.message}`;
      }
    },
    {
      query: t.Object({
        code: t.Optional(t.String()),
        state: t.Optional(t.String()),
        error: t.Optional(t.String()),
      }),
    },
  );

export const codexPlugin = (app: Elysia) =>
  app
    .get("/api/codex/status", () => codexAuthService.status())
    .post(
      "/api/codex/login",
      ({ body }) => codexAuthService.startLogin(body.credential_id),
      { body: t.Object({ credential_id: t.String() }) },
    )
    .post(
      "/api/antigravity/login",
      ({ body }) => antigravityAuthService.startLogin(body.credential_id),
      { body: t.Object({ credential_id: t.String() }) },
    )
    .post(
      "/api/codex/login/complete",
      async ({ body, set }) => {
        try {
          const { code, state } = parseManualOAuthCallback(
            body.callback_url,
            "codex",
          );
          return await codexAuthService.completeLogin(
            code,
            state,
            body.credential_id,
          );
        } catch (error: any) {
          set.status = 400;
          return { error: error.message };
        }
      },
      {
        body: t.Object({
          callback_url: t.String({ minLength: 1, maxLength: 4096 }),
          credential_id: t.String({ minLength: 1 }),
        }),
      },
    )
    .post(
      "/api/antigravity/login/complete",
      async ({ body, set }) => {
        try {
          const { code, state } = parseManualOAuthCallback(
            body.callback_url,
            "antigravity",
          );
          return await antigravityAuthService.completeLogin(
            code,
            state,
            body.credential_id,
          );
        } catch (error: any) {
          set.status = 400;
          return { error: error.message };
        }
      },
      {
        body: t.Object({
          callback_url: t.String({ minLength: 1, maxLength: 4096 }),
          credential_id: t.String({ minLength: 1 }),
        }),
      },
    )
    .post("/api/codex/logout", () => codexAuthService.logout())
    .post("/api/codex/refresh", () => codexAuthService.refresh())
    .get(
      "/api/codex/usage",
      async ({ query, set }) => {
        try {
          const credential = credentialService.findById(query.credential_id);
          if (!credential) throw new Error("Codex credential not found");
          return await codexUsage(credential);
        } catch (error: any) {
          set.status = 502;
          return { error: error.message };
        }
      },
      { query: t.Object({ credential_id: t.String() }) },
    )
    .get(
      "/api/codex/reset-credits",
      async ({ query, set }) => {
        try {
          const credential = credentialService.findById(query.credential_id);
          if (!credential) throw new Error("Codex credential not found");
          return await codexResetCredits(credential);
        } catch (error: any) {
          set.status = 502;
          return { error: error.message };
        }
      },
      { query: t.Object({ credential_id: t.String() }) },
    )
    .post(
      "/api/codex/reset-credits/consume",
      async ({ body, set }) => {
        try {
          const credential = credentialService.findById(body.credential_id);
          if (!credential) throw new Error("Codex credential not found");
          return await codexConsumeResetCredit(body.credit_id, credential);
        } catch (error: any) {
          set.status = 502;
          return { error: error.message };
        }
      },
      {
        body: t.Object({
          credential_id: t.String(),
          credit_id: t.Optional(t.String()),
        }),
      },
    )
    .get("/api/codex/models", async () => codexModels());

export const antigravityUsagePlugin = (app: Elysia) =>
  app.get(
    "/api/antigravity/usage",
    async ({ query, set }) => {
      try {
        const credential = credentialService.findById(query.credential_id);
        if (!credential || credential.kind !== "antigravity")
          throw new Error("Antigravity credential not found");
        return await antigravityUsage(credential);
      } catch (error: any) {
        set.status = 502;
        return { error: error.message };
      }
    },
    { query: t.Object({ credential_id: t.String() }) },
  );
