import { Elysia, t } from "elysia";
import { providerService } from "../services/provider.service";
import { credentialService } from "../services/credential.service";
import { codexAuthService } from "../integrations/codex";
import { logger } from "../logger";

export const providersPlugin = (app: Elysia) =>
  app
    .get("/api/providers", () => {
      return providerService.findAll();
    })
    .get("/api/providers/:id", ({ params: { id }, set }) => {
      const provider = providerService.findById(id);
      if (!provider) {
        set.status = 404;
        return { error: "Provider not found" };
      }
      const pub = providerService.findPublicById(id)!;
      return {
        ...pub,
        api_key: provider.api_key
          ? provider.api_key.slice(0, 6) + "..." + provider.api_key.slice(-4)
          : null,
      };
    })
    .post(
      "/api/providers",
      ({ body, set }) => {
        const existing = providerService.findByName(body.name);
        if (existing) {
          set.status = 409;
          return { error: "Provider name already exists" };
        }
        const provider = providerService.create({
          ...body,
          api_key:
            body.api_key ??
            body.auth_code ??
            (body.protocol === "codex" ? "codex-session" : "freebuff-token"),
        });
        logger.success("Provider created", {
          provider: provider.name,
          protocol: provider.protocol,
        });
        return provider;
      },
      {
        body: t.Object({
          name: t.String({ minLength: 1 }),
          base_url: t.String({ minLength: 1 }),
          api_key: t.Optional(t.String({ minLength: 1 })),
          auth_code: t.Optional(t.String({ minLength: 1 })),
          avatar: t.Optional(t.String()),
          protocol: t.Optional(
            t.Union([
              t.Literal("openai"),
              t.Literal("anthropic"),
              t.Literal("codex"),
              t.Literal("antigravity"),
              t.Literal("freebuff"),
            ]),
          ),
          credential_mode: t.Optional(
            t.Union([t.Literal("fixed"), t.Literal("round_robin")]),
          ),
          fixed_credential_id: t.Optional(t.Union([t.String(), t.Null()])),
        }),
      },
    )
    .put(
      "/api/providers/:id",
      ({ params: { id }, body, set }) => {
        const existing = providerService.findById(id);
        if (!existing) {
          set.status = 404;
          return { error: "Provider not found" };
        }
        const updated = providerService.update(id, body);
        return updated;
      },
      {
        body: t.Object({
          name: t.Optional(t.String({ minLength: 1 })),
          base_url: t.Optional(t.String({ minLength: 1 })),
          api_key: t.Optional(t.String({ minLength: 1 })),
          auth_code: t.Optional(t.String({ minLength: 1 })),
          avatar: t.Optional(t.Union([t.String(), t.Null()])),
          protocol: t.Optional(
            t.Union([
              t.Literal("openai"),
              t.Literal("anthropic"),
              t.Literal("codex"),
              t.Literal("antigravity"),
              t.Literal("freebuff"),
            ]),
          ),
          credential_mode: t.Optional(
            t.Union([t.Literal("fixed"), t.Literal("round_robin")]),
          ),
          fixed_credential_id: t.Optional(t.Union([t.String(), t.Null()])),
          is_active: t.Optional(t.Numeric()),
        }),
      },
    )
    .get("/api/providers/:id/credentials", ({ params: { id }, set }) => {
      if (!providerService.findById(id)) {
        set.status = 404;
        return { error: "Provider not found" };
      }
      return credentialService.findAll(id);
    })
    .get(
      "/api/providers/:id/credentials/:credentialId/status",
      ({ params: { id, credentialId }, set }) => {
        const credential = credentialService.findById(credentialId);
        if (!credential || credential.provider_id !== id) {
          set.status = 404;
          return { error: "Credential not found" };
        }
        return credentialService.status(credentialId);
      },
    )
    .get(
      "/api/providers/:id/credentials/:credentialId/secret",
      ({ params: { id, credentialId }, set }) => {
        const credential = credentialService.findById(credentialId);
        if (
          !credential ||
          credential.provider_id !== id ||
           credential.kind !== "api_key" && credential.kind !== "freebuff"
        ) {
          set.status = 404;
          return { error: "Credential secret not found" };
        }
        return { secret: credential.secret };
      },
    )
    .post(
      "/api/providers/:id/credentials",
      ({ params: { id }, body, set }) => {
        if (!providerService.findById(id)) {
          set.status = 404;
          return { error: "Provider not found" };
        }
        const fingerprint_json =
          body.fingerprint_id || body.fingerprint_hash
            ? JSON.stringify({
                fingerprintId: body.fingerprint_id,
                fingerprintHash: body.fingerprint_hash,
              })
            : body.fingerprint_json;
        return credentialService.create({
          ...body,
          provider_id: id,
          kind: body.kind ?? "api_key",
          fingerprint_json,
        });
      },
      {
        body: t.Object({
          label: t.String({ minLength: 1 }),
          kind: t.Optional(
            t.Union([
              t.Literal("api_key"),
              t.Literal("codex"),
              t.Literal("antigravity"),
              t.Literal("freebuff"),
            ]),
          ),
          secret: t.Optional(t.String()),
          access_token: t.Optional(t.String()),
          refresh_token: t.Optional(t.String()),
          id_token: t.Optional(t.String()),
          account_id: t.Optional(t.String()),
          email: t.Optional(t.String()),
          project_id: t.Optional(t.String()),
          fingerprint_json: t.Optional(t.String()),
          fingerprint_id: t.Optional(t.String()),
          fingerprint_hash: t.Optional(t.String()),
        }),
      },
    )
    .put(
      "/api/providers/:id/credentials/:credentialId",
      ({ params: { id, credentialId }, body, set }) => {
        const credential = credentialService.findById(credentialId);
        if (!credential || credential.provider_id !== id) {
          set.status = 404;
          return { error: "Credential not found" };
        }
        return credentialService.update(credentialId, body);
      },
      {
        body: t.Object({
          label: t.Optional(t.String({ minLength: 1 })),
          secret: t.Optional(t.String()),
          is_active: t.Optional(t.Numeric()),
        }),
      },
    )
    .delete(
      "/api/providers/:id/credentials/:credentialId",
      ({ params: { id, credentialId }, set }) => {
        const credential = credentialService.findById(credentialId);
        if (!credential || credential.provider_id !== id) {
          set.status = 404;
          return { error: "Credential not found" };
        }
        const removed = credentialService.remove(credentialId);
        if (
          removed &&
          (providerService.findById(id)?.protocol === "openai" ||
            providerService.findById(id)?.protocol === "anthropic")
        ) {
          const remaining = credentialService
            .findAll(id)
            .some((item) => item.kind === "api_key" && item.is_active);
          if (!remaining) providerService.update(id, { api_key: "" });
        }
        return { success: removed };
      },
    )
    .post(
      "/api/providers/:id/credentials/:credentialId/import-legacy",
      async ({ params: { id, credentialId }, set }) => {
        const credential = credentialService.findById(credentialId);
        if (!credential || credential.provider_id !== id) {
          set.status = 404;
          return { error: "Credential not found" };
        }
        try {
          return await codexAuthService.importLegacy(credentialId);
        } catch (error: any) {
          set.status = 400;
          return { error: error.message };
        }
      },
    )
    .post(
      "/api/providers/:id/credentials/:credentialId/disconnect",
      async ({ params: { id, credentialId }, set }) => {
        const credential = credentialService.findById(credentialId);
        if (!credential || credential.provider_id !== id) {
          set.status = 404;
          return { error: "Credential not found" };
        }
        const result = credentialService.disconnect(credentialId);
        if (!credentialService.hasAuthenticatedCodexAccount())
          await codexAuthService.logout();
        return result;
      },
    )
    .delete("/api/providers/:id", ({ params: { id }, set }) => {
      const removed = providerService.remove(id);
      if (!removed) {
        set.status = 404;
        return { error: "Provider not found" };
      }
      return { success: true };
    })
    .post("/api/providers/:id/toggle", ({ params: { id }, set }) => {
      const provider = providerService.toggleActive(id);
      if (!provider) {
        set.status = 404;
        return { error: "Provider not found" };
      }
      return provider;
    });
