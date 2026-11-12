import { Elysia, t } from "elysia";
import { guardrailsService } from "./guardrails.service";
import { logger } from "../../logger";

export const guardrailsPlugin = (app: Elysia) =>
  app
    .get("/api/guardrails/settings", () => {
      return guardrailsService.getSettings();
    })
    .post(
      "/api/guardrails/settings",
      ({ body }) => {
        const updated = guardrailsService.updateSettings(body as any);
        return { success: true, settings: updated };
      },
      {
        body: t.Object({
          enabled: t.Optional(t.Boolean()),
          action: t.Optional(t.Union([t.Literal("block"), t.Literal("redact"), t.Literal("audit")])),
          protectSecrets: t.Optional(t.Boolean()),
          protectEnvVars: t.Optional(t.Boolean()),
          protectPii: t.Optional(t.Boolean()),
          protectPromptInjection: t.Optional(t.Boolean()),
          protectSystemPromptLeak: t.Optional(t.Boolean()),
          protectCookies: t.Optional(t.Boolean()),
          protectCrypto: t.Optional(t.Boolean()),
          scanInbound: t.Optional(t.Boolean()),
          scanOutbound: t.Optional(t.Boolean()),
        }),
      },
    )
    .get("/api/guardrails/stats", () => {
      return guardrailsService.getStats();
    })
    .post(
      "/api/guardrails/test",
      ({ body }) => {
        const { text, settings } = body as { text: string; settings?: any };
        const result = guardrailsService.scanText(text || "", settings);
        return result;
      },
      {
        body: t.Object({
          text: t.String(),
          settings: t.Optional(t.Any()),
        }),
      },
    );
