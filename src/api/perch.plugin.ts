import { Elysia, t } from "elysia";
import { credentialService } from "../services/credential.service";
import { providerService } from "../services/provider.service";
import { perchUsage } from "../integrations/perch";

export const perchUsagePlugin = (app: Elysia) =>
  app.get(
    "/api/perch/usage",
    async ({ query, set }) => {
      try {
        const credential = credentialService.findById(query.credential_id);
        if (!credential || credential.kind !== "perch")
          throw new Error("Perch credential not found");
        const provider = providerService.findById(credential.provider_id);
        return await perchUsage(credential, provider?.base_url);
      } catch (error: any) {
        set.status = 502;
        return { error: error.message || "Perch usage request failed" };
      }
    },
    { query: t.Object({ credential_id: t.String() }) },
  );
