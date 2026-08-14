import { Elysia, t } from "elysia";
import { providerService } from "../services/provider.service";
import { credentialService } from "../services/credential.service";
import { codexAuthService } from "../integrations/codex";
import { logger } from "../logger";
import { isValidAvatar } from "../services/provider-appearance";
import { assertSafeRemoteUrl } from "../services/ssrf";
import { chatgptModels } from "../integrations/chatgpt";
import { qwenModels } from "../integrations/qwen";
import { conolValidate } from "../integrations/conol";
import { credentialKindForProtocol, validateCredential } from "../services/credential-validation";
import type { ProviderProtocol } from "../services/provider-appearance";
import { anthropicEndpoint } from "../clients/anthropic";

export const providersPlugin = (app: Elysia) =>
  app
    .get("/api/providers", () => {
      return providerService.findAll();
    })
    .post(
      "/api/providers/validate-credential",
      async ({ body, set }) => {
        const protocol = (body.protocol ?? "openai") as ProviderProtocol;
        const secret = body.api_key ?? body.auth_code ?? body.secret;
        try {
          const kind = credentialKindForProtocol(protocol);
          validateCredential(protocol, kind, secret, { accountId: body.account_id, allowIncompleteOAuth: protocol !== "conol" });
          const provider = {
            id: "validation",
            name: "validation",
            base_url: body.base_url.replace(/\/+$/, ""),
            api_key: secret ?? "",
            protocol,
            avatar: null,
            credential_mode: "fixed",
            fixed_credential_id: null,
            is_active: 1,
            created_at: "",
            updated_at: "",
          } as any;
          const credential = { id: "validation", secret: secret ?? "", account_id: body.account_id };
          if (protocol === "conol") {
            await conolValidate(credential, provider.base_url);
          } else if (protocol === "chatgpt") {
            const models = await chatgptModels(credential, { strict: true });
            if (!models.length) throw new Error("ChatGPT returned no models");
          } else if (protocol === "qwen") {
            const models = await qwenModels(credential, provider.base_url);
            if (!models.length) throw new Error("Qwen returned no models");
          } else if (protocol === "openai" || protocol === "anthropic") {
            const url = protocol === "anthropic"
              ? anthropicEndpoint(provider as any, "models")
              : `${provider.base_url.replace(/\/+$/, "")}${provider.base_url.replace(/\/+$/, "").endsWith("/v1") ? "" : "/v1"}/models`;
            await assertSafeRemoteUrl(url);
            const headers: Record<string, string> = protocol === "anthropic"
              ? { Accept: "application/json", "x-api-key": secret ?? "", "anthropic-version": "2023-06-01" }
              : { Accept: "application/json", Authorization: `Bearer ${secret ?? ""}` };
            const response = await fetch(url, { headers });
            const data: any = await response.json().catch(() => null);
            if (!response.ok) throw new Error(`${protocol} model listing failed (${response.status})`);
            const models = Array.isArray(data) ? data : data?.data ?? data?.models;
            if (!Array.isArray(models) || !models.length) throw new Error(`${protocol} returned no models`);
          } else {
            return { valid: true, verified: false, message: "This integration has no authenticated model catalog endpoint; verification will occur when models are synced." };
          }
          return { valid: true, verified: true, message: "Credential verified: models were loaded successfully." };
        } catch (error: any) {
          set.status = 400;
          return { valid: false, verified: false, error: error.message || "Credential verification failed" };
        }
      },
      {
        body: t.Object({
          base_url: t.String({ minLength: 1 }),
          protocol: t.Optional(t.Union([t.Literal("openai"), t.Literal("anthropic"), t.Literal("codex"), t.Literal("chatgpt"), t.Literal("antigravity"), t.Literal("freebuff"), t.Literal("qwen"), t.Literal("atomesus"), t.Literal("conol")])),
          api_key: t.Optional(t.String()),
          auth_code: t.Optional(t.String()),
          secret: t.Optional(t.String()),
          account_id: t.Optional(t.String()),
          model: t.Optional(t.String()),
        }),
      },
    )
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
       async ({ body, set }) => {
         try {
           await assertSafeRemoteUrl(body.base_url);
         } catch (error: any) {
           set.status = 400;
           return { error: error.message };
         }
        if (!isValidAvatar(body.avatar)) {
          set.status = 400;
          return { error: "Avatar must be an image URL or an image up to 25 MB" };
        }
        const existing = providerService.findByName(body.name);
        if (existing) {
          set.status = 409;
          return { error: "Provider name already exists" };
        }
        let provider;
        try {
          provider = providerService.create({ ...body, api_key: body.api_key ?? body.auth_code ?? body.secret, account_id: body.account_id });
        } catch (error: any) {
          set.status = 400;
          return { error: error.message };
        }
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
          secret: t.Optional(t.String({ minLength: 1 })),
          account_id: t.Optional(t.String({ minLength: 1 })),
          avatar: t.Optional(t.String()),
          protocol: t.Optional(
            t.Union([
              t.Literal("openai"),
              t.Literal("anthropic"),
              t.Literal("codex"),
              t.Literal("chatgpt"),
              t.Literal("antigravity"),
              t.Literal("freebuff"),
              t.Literal("qwen"),
              t.Literal("atomesus"),
              t.Literal("conol"),
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
       async ({ params: { id }, body, set }) => {
        const existing = providerService.findById(id);
        if (!existing) {
          set.status = 404;
          return { error: "Provider not found" };
        }
        if (!isValidAvatar(body.avatar)) {
          set.status = 400;
          return { error: "Avatar must be an image URL or an image up to 25 MB" };
        }
        if (body.base_url !== undefined) {
          try {
            await assertSafeRemoteUrl(body.base_url);
          } catch (error: any) {
            set.status = 400;
            return { error: error.message };
          }
        }
        try {
          return providerService.update(id, { ...body, api_key: body.api_key ?? body.auth_code });
        } catch (error: any) {
          set.status = 400;
          return { error: error.message };
        }
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
              t.Literal("chatgpt"),
              t.Literal("antigravity"),
              t.Literal("freebuff"),
              t.Literal("qwen"),
              t.Literal("atomesus"),
              t.Literal("conol"),
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
            credential.kind !== "api_key" && credential.kind !== "chatgpt" && credential.kind !== "freebuff" && credential.kind !== "qwen" && credential.kind !== "atomesus" && credential.kind !== "conol"
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
        try {
          return credentialService.create({ ...body, provider_id: id, kind: body.kind ?? "api_key", fingerprint_json });
        } catch (error: any) {
          set.status = 400;
          return { error: error.message };
        }
      },
      {
        body: t.Object({
          label: t.String({ minLength: 1 }),
          kind: t.Optional(
            t.Union([
              t.Literal("api_key"),
              t.Literal("codex"),
              t.Literal("chatgpt"),
              t.Literal("antigravity"),
              t.Literal("freebuff"),
              t.Literal("qwen"),
              t.Literal("atomesus"),
              t.Literal("conol"),
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
        try {
          return credentialService.update(credentialId, body);
        } catch (error: any) {
          set.status = 400;
          return { error: error.message };
        }
      },
      {
        body: t.Object({
          label: t.Optional(t.String({ minLength: 1 })),
          kind: t.Optional(
            t.Union([
              t.Literal("api_key"),
              t.Literal("codex"),
              t.Literal("chatgpt"),
              t.Literal("antigravity"),
              t.Literal("freebuff"),
              t.Literal("qwen"),
              t.Literal("atomesus"),
              t.Literal("conol"),
            ]),
          ),
          secret: t.Optional(t.Union([t.String(), t.Null()])),
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
